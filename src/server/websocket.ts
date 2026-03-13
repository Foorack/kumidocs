import type { ServerWebSocket } from 'bun';
import type { User, WsClientMessage, WsServerMessage, PresenceUser } from '../lib/types';

export interface WsData {
	user: User;
	pageId: string | null;
	sessionId: string;
	lastHeartbeat: number;
}

let sessionCounter = 0;

const sessions = new Map<string, ServerWebSocket<WsData>>(); // sessionId -> ws
const pageViewers = new Map<string, Set<string>>(); // pageId -> Set<sessionId>
const pageEditors = new Map<string, string>(); // pageId -> sessionId holding edit-lock

function send(ws: ServerWebSocket<WsData>, msg: WsServerMessage): void {
	try {
		ws.send(JSON.stringify(msg));
	} catch (err: unknown) {
		console.error('WebSocket send error:', err);
	}
}

function broadcastToAll(msg: WsServerMessage): void {
	for (const ws of sessions.values()) send(ws, msg);
}

function broadcastToPage(pageId: string, msg: WsServerMessage, except?: string): void {
	const sids = pageViewers.get(pageId);
	if (!sids) return;
	for (const sid of sids) {
		if (sid === except) continue;
		const ws = sessions.get(sid);
		if (ws) send(ws, msg);
	}
}

function presenceUpdate(pageId: string): WsServerMessage {
	const sids = pageViewers.get(pageId) ?? new Set<string>();
	const editorSid = pageEditors.get(pageId);

	const viewers: PresenceUser[] = [];
	let editor: PresenceUser | null = null;

	for (const sid of sids) {
		const ws = sessions.get(sid);
		if (!ws) continue;
		const u: PresenceUser = {
			id: ws.data.user.id,
			name: ws.data.user.displayName,
			email: ws.data.user.email,
		};
		viewers.push(u);
		if (sid === editorSid) editor = u;
	}

	return { type: 'presence_update', pageId, viewers, editor };
}

function leaveCurrentPage(ws: ServerWebSocket<WsData>): void {
	const sid = ws.data.sessionId;
	const pageId = ws.data.pageId;
	if (!pageId) return;

	pageViewers.get(pageId)?.delete(sid);
	if (pageEditors.get(pageId) === sid) pageEditors.delete(pageId);
	// Broadcast to ALL sessions so every client's sidebar updates immediately,
	// not just viewers of this page (who may not include the user who navigated away).
	broadcastToAll(presenceUpdate(pageId));
	ws.data.pageId = null;
}

export function wsOpen(ws: ServerWebSocket<WsData>): void {
	ws.data.sessionId = String(++sessionCounter);
	ws.data.pageId = null;
	ws.data.lastHeartbeat = Date.now();
	sessions.set(ws.data.sessionId, ws);
}

export function wsMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): void {
	ws.data.lastHeartbeat = Date.now();
	let msg: WsClientMessage;
	try {
		msg = JSON.parse(String(raw)) as WsClientMessage;
	} catch {
		return;
	}

	const sid = ws.data.sessionId;

	switch (msg.type) {
		case 'hello': {
			if (ws.data.pageId !== msg.pageId) leaveCurrentPage(ws);
			ws.data.pageId = msg.pageId;
			if (!pageViewers.has(msg.pageId)) pageViewers.set(msg.pageId, new Set());
			const viewers = pageViewers.get(msg.pageId);
			if (viewers) viewers.add(sid);
			// Broadcast join to ALL sessions so every sidebar reflects the new location.
			const update = presenceUpdate(msg.pageId);
			broadcastToAll(update);
			// Send a full snapshot of all active pages to the newly-connected client
			// so their sidebar is immediately populated without waiting for navigations.
			for (const [pageId] of pageViewers) {
				if (pageId !== msg.pageId) send(ws, presenceUpdate(pageId));
			}
			break;
		}

		case 'editing_start': {
			const existingSid = pageEditors.get(msg.pageId);
			if (existingSid && existingSid !== sid && sessions.has(existingSid)) {
				// Already locked by another active session — reject, send back current state
				send(ws, presenceUpdate(msg.pageId));
				return;
			}
			pageEditors.set(msg.pageId, sid);
			broadcastToPage(msg.pageId, presenceUpdate(msg.pageId));
			break;
		}

		case 'editing_stop': {
			if (pageEditors.get(msg.pageId) === sid) {
				pageEditors.delete(msg.pageId);
				broadcastToPage(msg.pageId, presenceUpdate(msg.pageId));
			}
			break;
		}

		case 'bye': {
			leaveCurrentPage(ws);
			break;
		}

		case 'heartbeat': {
			send(ws, { type: 'heartbeat_ack' });
			break;
		}
	}
}

export function wsClose(ws: ServerWebSocket<WsData>): void {
	const sid = ws.data.sessionId;
	leaveCurrentPage(ws);
	sessions.delete(sid);
}

// Called from the background pull loop after repo advances
export function broadcastPageChanged(
	pageId: string,
	commitSha: string,
	changedBy: string,
	changedByName: string,
): void {
	const msg: WsServerMessage = {
		type: 'page_changed',
		pageId,
		commitSha,
		changedBy,
		changedByName,
	};
	// Broadcast to all sessions — the client suppresses echoes of its own saves
	// via the `if (msg.changedBy === user?.id) return;` check in the WS listener.
	for (const ws of sessions.values()) send(ws, msg);
}

export function broadcastPageDeleted(pageId: string): void {
	const msg: WsServerMessage = { type: 'page_deleted', pageId };
	for (const ws of sessions.values()) send(ws, msg);
}

export function broadcastPageCreated(pageId: string, path: string): void {
	const msg: WsServerMessage = { type: 'page_created', pageId, path };
	for (const ws of sessions.values()) send(ws, msg);
}

export function sendSaveConflict(userId: string, pageId: string): void {
	for (const ws of sessions.values()) {
		if (ws.data.user.id === userId) {
			send(ws, {
				type: 'save_conflict_lost',
				pageId,
				message:
					'Your changes could not be saved: a remote conflict occurred and could not be resolved.',
			});
		}
	}
}

export function getEditorForPage(pageId: string): User | null {
	const sid = pageEditors.get(pageId);
	if (!sid) return null;
	const ws = sessions.get(sid);
	return ws?.data.user ?? null;
}

// Prune sessions that haven't sent a heartbeat in 90 seconds.
// ws.close() triggers the wsClose handler which calls leaveCurrentPage, so
// presence and edit-lock cleanup happens automatically.
export function pruneDeadSessions(): void {
	const cutoff = Date.now() - 90_000;
	for (const ws of sessions.values()) {
		if (ws.data.lastHeartbeat < cutoff) {
			ws.close(1001, 'Heartbeat timeout');
		}
	}
}
