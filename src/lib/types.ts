interface User {
  id: string;
  email: string;
  name: string;
  displayName: string;
  canEdit: boolean;
}

type MarkdownType = "doc" | "slide" | "page" | "sheet";
type FileType =
  | MarkdownType
  | "board"
  | "code"
  | "image"
  | "other"
  | "status"
  | "approve"
  | "reject"
  | "outdated";

interface FileEntry {
  path: string;
  type: FileType;
  title: string;
  emoji?: string;
}

interface TreeNode {
  path: string;
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];
  fileEntry?: FileEntry;
}

interface SearchResult {
  path: string;
  title: string;
  emoji?: string;
  type?: FileType;
  snippet: string;
  score: number;
}

interface PresenceUser {
  id: string;
  name: string;
  email: string;
}

// WebSocket message types
type WsClientMessage =
  | { type: "hello"; pageId: string; userId: string }
  | { type: "bye" }
  | { type: "editing_start"; pageId: string }
  | { type: "editing_stop"; pageId: string }
  | { type: "heartbeat" };

type WsServerMessage =
  | {
      type: "presence_update";
      pageId: string;
      viewers: PresenceUser[];
      editor: PresenceUser | undefined;
    }
  | {
      type: "page_changed";
      pageId: string;
      commitSha?: string;
      changedBy: string;
      changedByName: string;
    }
  | { type: "page_deleted"; pageId: string }
  | { type: "page_created"; pageId: string; path: string }
  | { type: "save_conflict_lost"; pageId: string; message: string }
  | { type: "heartbeat_ack" }
  | { type: "config_changed" }
  | {
      type: "sync_status";
      /** "ok" = all good, "degraded" = pushes failing, "unreachable" = remote unreachable */
      pull: "ok" | "failing";
      push: "ok" | "failing";
    };

interface PageNode {
  path: string; // always a .md path (may not exist on disk for virtual nodes)
  displayTitle: string;
  fileEntry?: FileEntry;
  children: PageNode[];
  isVirtual: boolean; // true = no .md file on disk
}

interface SidebarItem {
  title: string;
  href: string;
  children: SidebarItem[];
  emoji?: string;
}

interface CommitEntry {
  sha: string;
  fullSha: string;
  message: string;
  // Email address of the commit author
  author: string;
  authorEmail: string;
  // ISO 8601 timestamp
  date: string;
  added?: number;
  removed?: number;
}

interface FileDiff {
  sha: string;
  message: string;
  author: string;
  date: string;
  before: string;
  after: string;
}

interface BacklinkEntry {
  path: string;
  title: string;
}

interface SyncStatus {
  pull: "ok" | "failing";
  push: "ok" | "failing";
}

export type {
  User,
  MarkdownType,
  FileType,
  FileEntry,
  TreeNode,
  PageNode,
  SearchResult,
  PresenceUser,
  SyncStatus,
  WsClientMessage,
  WsServerMessage,
  SidebarItem,
  CommitEntry,
  FileDiff,
  BacklinkEntry,
};
