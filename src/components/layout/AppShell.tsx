import { useEffect, useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { SearchPalette } from '../search/SearchPalette';
import { NewPageDialog } from '../dialogs/NewPageDialog';
import { Toaster } from '../ui/sonner';
import { useUser } from '../../store/user';
import { wsClient, useWsListener } from '../../store/ws';
import type { TreeNode, PresenceUser } from '../../lib/types';

export function AppShell() {
	const { user } = useUser();
	const [searchOpen, setSearchOpen] = useState(false);
	const [tree, setTree] = useState<TreeNode[]>([]);
	const [instanceName, setInstanceName] = useState('KumiDocs');
	const [presenceByPage, setPresenceByPage] = useState<Map<string, PresenceUser[]>>(new Map());
	const [newPageOpen, setNewPageOpen] = useState(false);
	const [newPageParentDir, setNewPageParentDir] = useState<string | undefined>(undefined);

	// Connect WS once user loads
	useEffect(() => {
		if (user) wsClient.connect(user.id);
	}, [user]);

	// Reload full file tree for sidebar.
	// Returns void so it's safe to pass as event handler or onCreated callback.
	const loadTree = useCallback((): void => {
		fetch('/api/tree')
			.then((r) => r.json() as Promise<TreeNode[]>)
			.then((data) => {
				setTree(data);
			})
			.catch((err: unknown) => {
				console.error('Failed to load file tree:', err);
			});
	}, []);

	// Load user/instance info
	useEffect(() => {
		fetch('/api/me')
			.then((r) => r.json() as Promise<{ instanceName?: string }>)
			.then((data) => {
				if (data.instanceName) setInstanceName(data.instanceName);
			})
			.catch((err: unknown) => {
				console.error('Failed to load instance info:', err);
			});
		loadTree();
	}, [loadTree]);

	// Update per-page presence map from WS presence updates
	useWsListener((msg) => {
		if (msg.type === 'presence_update') {
			setPresenceByPage((prev) => {
				const next = new Map(prev);
				// Merge viewers + editor, deduplicated, minus self
				const all: PresenceUser[] = [];
				const seen = new Set<string>();
				for (const u of msg.viewers) {
					if (!seen.has(u.id) && u.id !== user?.id) {
						all.push(u);
						seen.add(u.id);
					}
				}
				if (msg.editor && !seen.has(msg.editor.id) && msg.editor.id !== user?.id) {
					all.push(msg.editor);
				}
				if (all.length > 0) {
					next.set(msg.pageId, all);
				} else {
					next.delete(msg.pageId);
				}
				return next;
			});
		}
		if (
			msg.type === 'page_created' ||
			msg.type === 'page_changed' ||
			msg.type === 'page_deleted'
		) {
			loadTree();
		}
	});

	// Ctrl+K shortcut
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
				e.preventDefault();
				setSearchOpen(true);
			}
		};
		window.addEventListener('keydown', handler);
		return () => {
			window.removeEventListener('keydown', handler);
		};
	}, []);

	return (
		<div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
			<TopBar
				instanceName={instanceName}
				onSearchOpen={() => {
					setSearchOpen(true);
				}}
			/>

			<div className="flex flex-1 overflow-hidden">
				<Sidebar
					tree={tree}
					reloadTree={loadTree}
					onNewPage={() => {
						setNewPageParentDir(undefined);
						setNewPageOpen(true);
					}}
					onNewSubPage={(parentDir) => {
						setNewPageParentDir(parentDir || undefined);
						setNewPageOpen(true);
					}}
					presenceByPage={presenceByPage}
				/>

				<main className="flex-1 overflow-hidden flex flex-col">
					<Outlet context={{ reloadTree: loadTree }} />
				</main>
			</div>

			<SearchPalette
				open={searchOpen}
				onClose={() => {
					setSearchOpen(false);
				}}
			/>
			<NewPageDialog
				open={newPageOpen}
				onClose={() => {
					setNewPageOpen(false);
				}}
				parentDir={newPageParentDir}
				onCreated={loadTree}
			/>
			<Toaster richColors position="top-right" />
		</div>
	);
}
