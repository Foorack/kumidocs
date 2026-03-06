export interface User {
	id: string;
	email: string;
	name: string;
	displayName: string;
	initials: string;
	canEdit: boolean;
}

export interface FileEntry {
	path: string;
	type: 'doc' | 'slide' | 'code' | 'image' | 'other';
	title: string;
	emoji?: string;
	description?: string;
}

export interface TreeNode {
	path: string;
	name: string;
	type: 'file' | 'dir';
	children?: TreeNode[];
	fileEntry?: FileEntry;
}

export interface SearchResult {
	path: string;
	title: string;
	emoji?: string;
	type?: string;
	snippet: string;
	score: number;
}

export interface PresenceUser {
	id: string;
	name: string;
	initials: string;
}

// WebSocket message types
export type WsClientMessage =
	| { type: 'hello'; pageId: string; userId: string }
	| { type: 'editing_start'; pageId: string }
	| { type: 'editing_stop'; pageId: string }
	| { type: 'heartbeat' };

export type WsServerMessage =
	| {
			type: 'presence_update';
			pageId: string;
			viewers: PresenceUser[];
			editor: PresenceUser | null;
	  }
	| {
			type: 'page_changed';
			pageId: string;
			commitSha: string;
			changedBy: string;
			changedByName: string;
	  }
	| { type: 'page_deleted'; pageId: string }
	| { type: 'page_created'; pageId: string; path: string }
	| { type: 'save_conflict_lost'; pageId: string; message: string }
	| { type: 'heartbeat_ack' };

export interface SidebarItem {
	title: string;
	href: string;
	children: SidebarItem[];
	emoji?: string;
}

export interface CommitEntry {
	sha: string;
	message: string;
	author: string;
	date: string; // ISO 8601
}

export interface FileDiff {
	sha: string;
	message: string;
	author: string;
	date: string;
	before: string;
	after: string;
}
