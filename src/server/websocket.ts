import type { PresenceUser, User, WsClientMessage, WsServerMessage } from "@/lib/types";
import { getFile } from "./filestore";

interface WsData {
  user: User;
  pageId: string | undefined;
  sessionId: string;
  lastHeartbeat: number;
}

// Per-connection data store. On Bun the initial data is populated by
// srv.upgrade()'s `data` option; on Node the upgrade handler would set it.
const wsDataStore = new WeakMap<WebSocket, WsData>();

let sessionCounter = 0;

const sessions = new Map<string, WebSocket>(); // sessionId -> ws
const pageViewers = new Map<string, Set<string>>(); // pageId -> Set<sessionId>
const pageEditors = new Map<string, string>(); // pageId -> sessionId holding edit-lock

function getWsData(ws: WebSocket): WsData {
  const data = wsDataStore.get(ws);
  // wsOpen always sets data before any handler runs, so this should never
  // be undefined in practice. The assertion keeps the call sites clean.
  // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
  return data!;
}

function send(ws: WebSocket, msg: WsServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch (error: unknown) {
    console.error("WebSocket send error:", error);
  }
}

// Sync status tracking
// Tracks whether the server can reach and sync with the remote git origin.
// Broadcasts to all connected clients on state changes so the UI can show
// a persistent banner when remote sync is degraded.

type SyncState = "ok" | "failing";
interface SyncStatus {
  pull: SyncState;
  push: SyncState;
}

let currentSyncStatus: SyncStatus = { pull: "ok", push: "ok" };

function broadcastConfigChanged(): void {
  const msg: WsServerMessage = { type: "config_changed" };
  for (const ws of sessions.values()) {
    send(ws, msg);
  }
}

function broadcastSyncStatus(status: SyncStatus): void {
  const prev = currentSyncStatus;
  // Avoid spamming clients with no-op updates
  if (prev.pull === status.pull && prev.push === status.push) {
    return;
  }
  currentSyncStatus = status;
  const msg: WsServerMessage = { ...status, type: "sync_status" };
  for (const ws of sessions.values()) {
    send(ws, msg);
  }
}

/** Fetch the current sync status (for sending to newly connected clients). */
function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

function broadcastToAll(msg: WsServerMessage): void {
  for (const ws of sessions.values()) {
    send(ws, msg);
  }
}

function broadcastToPage(pageId: string, msg: WsServerMessage, except?: string): void {
  const sids = pageViewers.get(pageId);
  if (!sids) {
    return;
  }
  for (const sid of sids) {
    if (sid === except) {
      continue;
    }
    const ws = sessions.get(sid);
    if (ws) {
      send(ws, msg);
    }
  }
}

function presenceUpdate(pageId: string): WsServerMessage {
  const sids = pageViewers.get(pageId) ?? new Set<string>();
  const editorSid = pageEditors.get(pageId);

  const viewers: PresenceUser[] = [];
  let editor: PresenceUser | undefined;

  for (const sid of sids) {
    const ws = sessions.get(sid);
    if (!ws) {
      continue;
    }
    const wsInfo = getWsData(ws);
    const presenceUser: PresenceUser = {
      email: wsInfo.user.email,
      id: wsInfo.user.id,
      name: wsInfo.user.displayName,
    };
    viewers.push(presenceUser);
    if (sid === editorSid) {
      editor = presenceUser;
    }
  }

  return { editor, pageId, type: "presence_update", viewers };
}

function leaveCurrentPage(ws: WebSocket): void {
  const wsInfo = getWsData(ws);
  const sid = wsInfo.sessionId;
  const pageId = wsInfo.pageId;
  if (pageId === undefined || pageId === "") {
    return;
  }

  const hadViewers = pageViewers.has(pageId);
  const viewers = pageViewers.get(pageId);
  if (viewers) {
    viewers.delete(sid);
    if (viewers.size === 0) {
      pageViewers.delete(pageId);
    }
  }
  if (pageEditors.get(pageId) === sid) {
    pageEditors.delete(pageId);
  }
  // Broadcast presence update so other clients know the viewer left.
  // Check hadViewers before the delete above to handle the last-leaver case.
  if (hadViewers || pageEditors.has(pageId)) {
    broadcastToAll(presenceUpdate(pageId));
  }
  wsInfo.pageId = undefined;
}

function wsOpen(ws: WebSocket): void {
  // Copy initial data set by Bun's srv.upgrade() into our own store.
  // This is the only place we touch the Bun-specific ws.data property.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const initial = (ws as unknown as { data: WsData | undefined }).data;
  if (initial) {
    wsDataStore.set(ws, initial);
  }
  const wsInfo = getWsData(ws);
  wsInfo.sessionId = String(++sessionCounter);
  wsInfo.lastHeartbeat = Date.now();
  sessions.set(wsInfo.sessionId, ws);
}

function handleHello(ws: WebSocket, sid: string, rawPid: string): void {
  if (typeof rawPid !== "string" || rawPid === "") {
    return;
  }
  if (getFile(rawPid) === undefined) {
    return;
  }
  const wsInfo = getWsData(ws);
  if (wsInfo.pageId !== rawPid) {
    leaveCurrentPage(ws);
  }
  wsInfo.pageId = rawPid;
  if (!pageViewers.has(rawPid)) {
    pageViewers.set(rawPid, new Set());
  }
  const viewers = pageViewers.get(rawPid);
  if (viewers) {
    viewers.add(sid);
  }
  const update = presenceUpdate(rawPid);
  broadcastToAll(update);
  for (const [existingPid] of pageViewers) {
    if (existingPid !== rawPid) {
      send(ws, presenceUpdate(existingPid));
    }
  }
  send(ws, { ...getSyncStatus(), type: "sync_status" });
}

function handleEditingStart(ws: WebSocket, sid: string, rawPid: string): void {
  if (typeof rawPid !== "string" || rawPid === "") {
    return;
  }
  if (!getWsData(ws).user.canEdit) {
    return;
  }
  const existingSid = pageEditors.get(rawPid);
  if (
    existingSid !== undefined &&
    existingSid !== "" &&
    existingSid !== sid &&
    sessions.has(existingSid)
  ) {
    send(ws, presenceUpdate(rawPid));
    return;
  }
  pageEditors.set(rawPid, sid);
  broadcastToPage(rawPid, presenceUpdate(rawPid));
}

function handleEditingStop(_ws: WebSocket, sid: string, rawPid: string): void {
  if (typeof rawPid !== "string" || rawPid === "") {
    return;
  }
  if (pageEditors.get(rawPid) === sid) {
    pageEditors.delete(rawPid);
    broadcastToPage(rawPid, presenceUpdate(rawPid));
  }
}

function wsMessage(ws: WebSocket, raw: string | Buffer): void {
  getWsData(ws).lastHeartbeat = Date.now();
  let msg: WsClientMessage;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    msg = JSON.parse(String(raw)) as WsClientMessage;
  } catch {
    return;
  }

  const sid = getWsData(ws).sessionId;

  switch (msg.type) {
    case "hello": {
      handleHello(ws, sid, msg.pageId);
      break;
    }

    case "editing_start": {
      handleEditingStart(ws, sid, msg.pageId);
      break;
    }

    case "editing_stop": {
      handleEditingStop(ws, sid, msg.pageId);
      break;
    }

    case "bye": {
      leaveCurrentPage(ws);
      break;
    }

    case "heartbeat": {
      send(ws, { type: "heartbeat_ack" });
      break;
    }
    default: {
      break;
    }
  }
}

function wsClose(ws: WebSocket): void {
  const sid = getWsData(ws).sessionId;
  leaveCurrentPage(ws);
  sessions.delete(sid);
}

// Called from the background pull loop after repo advances
function broadcastPageChanged(
  pageId: string,
  commitSha: string | undefined,
  changedBy: string,
  changedByName: string,
): void {
  const msg: WsServerMessage = {
    changedBy,
    changedByName,
    ...(commitSha !== undefined && { commitSha }),
    pageId,
    type: "page_changed",
  };
  // Broadcast to all sessions; the client suppresses echoes of its own saves
  // via the `if (msg.changedBy === user?.id) return;` check in the WS listener.
  for (const ws of sessions.values()) {
    send(ws, msg);
  }
}

function broadcastPageDeleted(pageId: string): void {
  const msg: WsServerMessage = { pageId, type: "page_deleted" };
  for (const ws of sessions.values()) {
    send(ws, msg);
  }
}

function broadcastPageCreated(pageId: string, path: string): void {
  const msg: WsServerMessage = { pageId, path, type: "page_created" };
  for (const ws of sessions.values()) {
    send(ws, msg);
  }
}

function sendSaveConflict(userId: string, pageId: string): void {
  for (const ws of sessions.values()) {
    if (getWsData(ws).user.id === userId) {
      send(ws, {
        message: "Save conflict: remote changes could not be merged.",
        pageId,
        type: "save_conflict_lost",
      });
    }
  }
}

function getEditorForPage(pageId: string): User | undefined {
  const sid = pageEditors.get(pageId);
  if (sid === undefined || sid === "") {
    return undefined;
  }
  const ws = sessions.get(sid);
  if (!ws) {
    return undefined;
  }
  return getWsData(ws).user;
}

// Prune sessions that haven't sent a heartbeat in 90 seconds.
// ws.close() triggers the wsClose handler which calls leaveCurrentPage, so
// presence and edit-lock cleanup happens automatically.
function pruneDeadSessions(): void {
  const cutoff = Date.now() - 90_000;
  for (const ws of sessions.values()) {
    // Can't use getWsData here because ws may already be half-closed
    // and its data may have been cleaned up. Attempt the lookup safely.
    const wsInfo = wsDataStore.get(ws);
    if (wsInfo && wsInfo.lastHeartbeat < cutoff) {
      ws.close(1001, "Heartbeat timeout");
    }
  }
}

export {
  type WsData,
  wsOpen,
  wsMessage,
  wsClose,
  broadcastConfigChanged,
  broadcastPageChanged,
  broadcastPageDeleted,
  broadcastPageCreated,
  broadcastSyncStatus,
  getSyncStatus,
  sendSaveConflict,
  getEditorForPage,
  pruneDeadSessions,
};
