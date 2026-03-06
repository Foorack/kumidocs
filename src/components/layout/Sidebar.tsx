import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
	AddRegular,
	ChevronRightRegular,
	ChevronDownRegular,
	CircleFilled,
	RenameRegular,
} from '@fluentui/react-icons';
import { KumiIcon } from '../ui/KumiIcon';
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from '../ui/context-menu';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import type { TreeNode, FileEntry, PresenceUser } from '../../lib/types';

interface SidebarProps {
	tree: TreeNode[];
	onNewPage: () => void;
	onNewSubPage: (parentDir: string) => void;
	editingPages: Map<string, PresenceUser>;
}

interface MoveDialogState {
	open: boolean;
	from: string;
	to: string;
}

/**
 * A PageNode represents a page in the sidebar — either a real .md file or a
 * virtual "ghost" that has sub-pages but no .md file of its own.
 * This gives Confluence-style nesting: pages contain sub-pages, no folder UI.
 */
interface PageNode {
	path: string; // always a .md path (may not exist on disk for virtual nodes)
	displayTitle: string;
	fileEntry?: FileEntry;
	children: PageNode[];
	isVirtual: boolean; // true = no .md file on disk
}

// Names always hidden from sidebar
const HIDDEN_NAMES = new Set(['_sidebar.md']);

/**
 * Merge TreeNode[] (mixed files + dirs) into PageNode[]:
 * - dir "test-3/" + "test-3.md" → one PageNode with children
 * - dir with no matching .md → virtual ghost PageNode
 * - .md file with no matching dir → leaf PageNode
 */
function buildPageTree(nodes: TreeNode[]): PageNode[] {
	const filtered = nodes.filter((n) => !HIDDEN_NAMES.has(n.name));

	const fileMap = new Map<string, TreeNode>(); // baseName → file node
	const dirMap = new Map<string, TreeNode>(); // dirName → dir node

	for (const node of filtered) {
		if (node.type === 'dir') {
			dirMap.set(node.name, node);
		} else {
			fileMap.set(node.name.replace(/\.md$/i, ''), node);
		}
	}

	const result: PageNode[] = [];

	// Real file nodes (with optional dir children)
	for (const [baseName, fileNode] of fileMap) {
		const dir = dirMap.get(baseName);
		result.push({
			path: fileNode.path,
			displayTitle: fileNode.fileEntry?.title ?? baseName.replace(/[-_]/g, ' '),
			fileEntry: fileNode.fileEntry,
			children: dir ? buildPageTree(dir.children ?? []) : [],
			isVirtual: false,
		});
	}

	// Orphan dirs (no matching .md) → virtual ghost page
	for (const [name, dirNode] of dirMap) {
		if (fileMap.has(name)) continue;
		result.push({
			path: `${dirNode.path}.md`,
			displayTitle: name.replace(/[-_]/g, ' '),
			fileEntry: undefined,
			children: buildPageTree(dirNode.children ?? []),
			isVirtual: true,
		});
	}

	// Sort: README first, then alphabetically by display title
	return result.sort((a, b) => {
		if (a.path === 'README.md') return -1;
		if (b.path === 'README.md') return 1;
		return a.displayTitle.localeCompare(b.displayTitle, undefined, { sensitivity: 'base' });
	});
}

function PageNodeRow({
	node,
	depth,
	editingPages,
	onNewSubPage,
	onMove,
}: {
	node: PageNode;
	depth: number;
	editingPages: Map<string, PresenceUser>;
	onNewSubPage: (parentDir: string) => void;
	onMove: (path: string) => void;
}) {
	const location = useLocation();
	const hasChildren = node.children.length > 0;
	const [open, setOpen] = useState(depth === 0);

	const href = node.fileEntry?.type === 'code' ? `/code/${node.path}` : `/p/${node.path}`;
	const isActive = location.pathname === href || location.pathname === `/p/${node.path}`;
	const beingEdited = node.isVirtual ? undefined : editingPages.get(node.path);
	const indent = 8 + depth * 14;

	return (
		<div>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className={`flex items-center gap-1 px-2 py-[3px] rounded text-sm select-none ${
							isActive
								? 'bg-accent text-accent-foreground font-medium'
								: 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
						}`}
						style={{ paddingLeft: `${String(indent)}px` }}
					>
						{/* Chevron — toggles expand without navigating */}
						<span
							className="shrink-0 w-3 h-3 flex items-center justify-center cursor-pointer"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								if (hasChildren) setOpen((o) => !o);
							}}
						>
							{hasChildren &&
								(open ? (
									<ChevronDownRegular className="w-3 h-3" />
								) : (
									<ChevronRightRegular className="w-3 h-3" />
								))}
						</span>

						{/* Page icon */}
						<span className={node.isVirtual ? 'opacity-40 shrink-0' : 'shrink-0'}>
							<KumiIcon
								emoji={node.fileEntry?.emoji}
								fileType={node.fileEntry?.type ?? 'doc'}
								size={16}
							/>
						</span>

						{/* Title navigates on click */}
						<Link
							to={href}
							className={`truncate flex-1 min-w-0 ${node.isVirtual ? 'italic opacity-50' : ''}`}
							title={node.displayTitle}
						>
							{node.displayTitle}
						</Link>

						{beingEdited && (
							<Tooltip>
								<TooltipTrigger asChild>
									<CircleFilled className="w-2 h-2 shrink-0 text-amber-500 animate-pulse" />
								</TooltipTrigger>
								<TooltipContent>{beingEdited.name} is editing</TooltipContent>
							</Tooltip>
						)}
					</div>
				</ContextMenuTrigger>

				<ContextMenuContent>
					{node.isVirtual ? (
						<ContextMenuItem asChild>
							<Link to={href}>Create this page</Link>
						</ContextMenuItem>
					) : (
						<>
							<ContextMenuItem
								onClick={() => {
									onNewSubPage(node.path.replace(/\.md$/i, ''));
								}}
							>
								<AddRegular className="mr-2 w-4 h-4" />
								Create subpage
							</ContextMenuItem>
							<ContextMenuItem
								onClick={() => {
									const dir = node.path.includes('/')
										? node.path.substring(0, node.path.lastIndexOf('/'))
										: '';
									onNewSubPage(dir);
								}}
							>
								<AddRegular className="mr-2 w-4 h-4" />
								Create page alongside
							</ContextMenuItem>
							<ContextMenuItem
								onClick={() => {
									onMove(node.path);
								}}
							>
								<RenameRegular className="mr-2 w-4 h-4" />
								Move / Rename
							</ContextMenuItem>
						</>
					)}
				</ContextMenuContent>
			</ContextMenu>

			{/* Children rendered outside ContextMenu so right-click doesn't bubble */}
			{hasChildren && open && (
				<div>
					{node.children.map((child) => (
						<PageNodeRow
							key={child.path}
							node={child}
							depth={depth + 1}
							editingPages={editingPages}
							onNewSubPage={onNewSubPage}
							onMove={onMove}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function Sidebar({ tree, onNewPage, onNewSubPage, editingPages }: SidebarProps) {
	const pages = buildPageTree(tree);
	const [moveDialog, setMoveDialog] = useState<MoveDialogState>({
		open: false,
		from: '',
		to: '',
	});
	const [moving, setMoving] = useState(false);

	const openMove = (path: string) => {
		setMoveDialog({ open: true, from: path, to: path });
	};

	const handleMove = async () => {
		const raw = moveDialog.to.trim();
		if (!raw || raw === moveDialog.from) {
			setMoveDialog((d) => ({ ...d, open: false }));
			return;
		}
		const toPath = raw.endsWith('.md') ? raw : `${raw}.md`;
		setMoving(true);
		try {
			const res = await fetch('/api/file/rename', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ from: moveDialog.from, to: toPath }),
			});
			if (res.ok) {
				toast.success('Page moved');
			} else {
				toast.error('Move failed');
			}
		} catch {
			toast.error('Move failed');
		}
		setMoving(false);
		setMoveDialog((d) => ({ ...d, open: false }));
	};

	return (
		<>
			<aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col h-full">
				<ScrollArea className="flex-1 px-1 py-2">
					{pages.length === 0 ? (
						<div className="px-3 py-4 text-xs text-muted-foreground text-center">
							No pages yet.
							<br />
							Create your first page below.
						</div>
					) : (
						pages.map((node) => (
							<PageNodeRow
								key={node.path}
								node={node}
								depth={0}
								editingPages={editingPages}
								onNewSubPage={onNewSubPage}
								onMove={openMove}
							/>
						))
					)}
				</ScrollArea>

				<div className="p-2 border-t border-border shrink-0">
					<Button
						variant="ghost"
						size="sm"
						className="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
						onClick={onNewPage}
					>
						<AddRegular className="w-3.5 h-3.5" />
						New page
					</Button>
				</div>
			</aside>

			<Dialog
				open={moveDialog.open}
				onOpenChange={(v) => {
					if (!v) setMoveDialog((d) => ({ ...d, open: false }));
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Move / Rename page</DialogTitle>
						<DialogDescription>
							Enter the new file path (relative to repo root).
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-1.5">
						<Label>New path</Label>
						<Input
							value={moveDialog.to}
							onChange={(e) => {
								setMoveDialog((d) => ({ ...d, to: e.target.value }));
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !moving) {
									handleMove().catch((err: unknown) => {
										console.error('Move failed:', err);
									});
								}
							}}
							placeholder="docs/new-name.md"
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setMoveDialog((d) => ({ ...d, open: false }));
							}}
						>
							Cancel
						</Button>
						<Button
							disabled={moving}
							onClick={() => {
								handleMove().catch((err: unknown) => {
									console.error('Move failed:', err);
								});
							}}
						>
							{moving ? 'Moving…' : 'Move'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
