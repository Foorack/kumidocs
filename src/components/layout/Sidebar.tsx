import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
	AddRegular,
	ChevronRightRegular,
	ChevronDownRegular,
	ImageRegular,
	MoreHorizontalRegular,
	MoreHorizontalFilled,
} from '@fluentui/react-icons';
import { PageMenuItems } from '../ui/PageMenuItems';
import { EmojiIcon, TitleWithEmoji } from '../ui/EmojiIcon';
import { UserAvatar } from '../ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from '../ui/context-menu';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { toast } from 'sonner';
import { usePageActions } from '../../hooks/usePageActions';
import { useUser } from '../../store/user';
import type { TreeNode, FileEntry, PresenceUser, User } from '../../lib/types';

interface SidebarProps {
	tree: TreeNode[];
	width: number;
	onNewPage: () => void;
	onNewSubPage: (parentDir: string) => void;
	presenceByPage: Map<string, PresenceUser[]>;
	reloadTree: () => void;
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
	presenceByPage,
	currentUser,
	onNewSubPage,
	onMove,
	onDelete,
}: {
	node: PageNode;
	depth: number;
	presenceByPage: Map<string, PresenceUser[]>;
	currentUser: User | null;
	onNewSubPage: (parentDir: string) => void;
	onMove: (path: string) => void;
	onDelete: (path: string, title: string) => void;
}) {
	const location = useLocation();
	const navigate = useNavigate();
	const hasChildren = node.children.length > 0;
	const [open, setOpen] = useState(depth === 0);
	const [dotsHovered, setDotsHovered] = useState(false);
	const [dotsOpen, setDotsOpen] = useState(false);

	const href = `/p/${node.path}`.replace(/\.md$/i, '');
	const isActive = location.pathname === href;
	const othersOnPage = presenceByPage.get(node.path) ?? [];
	const presenceUsers =
		isActive && currentUser
			? [
					{ id: currentUser.id, name: currentUser.displayName, email: currentUser.email },
					...othersOnPage,
				]
			: othersOnPage;
	const indent = 8 + depth * 14;
	const parentDir = node.path.includes('/')
		? node.path.substring(0, node.path.lastIndexOf('/'))
		: '';

	const handleDuplicate = async () => {
		try {
			const res = await fetch(`/api/file?path=${encodeURIComponent(node.path)}`);
			if (!res.ok) {
				toast.error('Duplicate failed');
				return;
			}
			const data = (await res.json()) as { content: string };
			const base = node.path.replace(/\.md$/i, '');
			const newPath = `${base}-copy.md`;
			const saveRes = await fetch('/api/file', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: newPath, content: data.content }),
			});
			if (saveRes.ok) {
				toast.success('Page duplicated');
				void navigate(`/p/${newPath}`);
			} else if (saveRes.status === 409) {
				toast.error('A copy already exists at that path');
			} else {
				toast.error('Duplicate failed');
			}
		} catch {
			toast.error('Duplicate failed');
		}
	};

	return (
		<div className="w-full">
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className={`group flex items-center gap-1 px-2 py-[3px] rounded text-sm select-none min-w-0 ${
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
						<span
							className={`flex items-center justify-center ${node.isVirtual ? 'opacity-40 shrink-0' : 'shrink-0'}`}
						>
							<EmojiIcon
								emoji={node.fileEntry?.emoji}
								fileType={node.fileEntry?.type ?? 'doc'}
								size={24}
							/>
						</span>

						{/* Title navigates on click */}
						<Link
							to={href}
							className={`truncate flex-1 min-w-0 ${node.isVirtual ? 'italic opacity-50' : ''}`}
							title={node.displayTitle}
						>
							<TitleWithEmoji title={node.displayTitle} />
						</Link>

						{/* Presence avatars — users currently on this page */}
						{presenceUsers.length > 0 && (
							<div className="flex items-center shrink-0 -space-x-1">
								{presenceUsers.slice(0, 3).map((u) => (
									<Tooltip key={u.id}>
										<TooltipTrigger asChild>
											<UserAvatar
												name={u.name}
												email={u.email}
												size="xs"
												className="ring-1 ring-sidebar cursor-default"
											/>
										</TooltipTrigger>
										<TooltipContent>
											{u.id === currentUser?.id ? 'You' : u.name}
										</TooltipContent>
									</Tooltip>
								))}
								{presenceUsers.length > 3 && (
									<div className="w-[18px] h-[18px] rounded-full bg-muted flex items-center justify-center text-[7px] font-bold ring-1 ring-sidebar text-muted-foreground cursor-default shrink-0">
										+{presenceUsers.length - 3}
									</div>
								)}
							</div>
						)}

						{/* 3-dot menu — visible on hover, same actions as right-click */}
						<DropdownMenu onOpenChange={setDotsOpen}>
							<DropdownMenuTrigger asChild>
								<button
									className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-current transition-opacity"
									onClick={(e) => {
										e.stopPropagation();
									}}
									onMouseEnter={() => {
										setDotsHovered(true);
									}}
									onMouseLeave={() => {
										setDotsHovered(false);
									}}
								>
									{dotsHovered || dotsOpen ? (
										<MoreHorizontalFilled className="w-4 h-4" />
									) : (
										<MoreHorizontalRegular className="w-4 h-4" />
									)}
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent side="right" align="start">
								<PageMenuItems
									variant="dropdown"
									href={href}
									path={node.path}
									displayTitle={node.displayTitle}
									isVirtual={node.isVirtual}
									parentDir={parentDir}
									onNewSubPage={onNewSubPage}
									onNewPage={onNewSubPage}
									onDuplicate={() => {
										void handleDuplicate();
									}}
									onMove={onMove}
									onDelete={onDelete}
								/>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</ContextMenuTrigger>

				<ContextMenuContent>
					<PageMenuItems
						variant="context"
						href={href}
						path={node.path}
						displayTitle={node.displayTitle}
						isVirtual={node.isVirtual}
						parentDir={parentDir}
						onNewSubPage={onNewSubPage}
						onNewPage={onNewSubPage}
						onDuplicate={() => {
							void handleDuplicate();
						}}
						onMove={onMove}
						onDelete={onDelete}
					/>
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
							presenceByPage={presenceByPage}
							currentUser={currentUser}
							onNewSubPage={onNewSubPage}
							onMove={onMove}
							onDelete={onDelete}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function Sidebar({
	tree,
	width,
	onNewPage,
	onNewSubPage,
	presenceByPage,
	reloadTree,
}: SidebarProps) {
	const pages = buildPageTree(tree);
	const { user: currentUser } = useUser();
	const navigate = useNavigate();
	const { openMove, openDelete, dialogs: pageActionDialogs } = usePageActions(reloadTree);

	const handleOpenMove = (path: string) => {
		openMove(path).catch((err: unknown) => {
			console.error('Failed to open move dialog:', err);
		});
	};

	return (
		<>
			<aside
				className="shrink-0 border-r border-border bg-sidebar flex flex-col h-full overflow-hidden"
				style={{ width }}
			>
				{/* ── Pages header ── */}
				<div className="flex items-center px-3 py-1.5 border-b border-border shrink-0">
					<span className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none">
						Pages
					</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
								title="Wiki options"
							>
								<MoreHorizontalRegular className="w-4 h-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() => {
									void navigate('/i');
								}}
							>
								<ImageRegular className="mr-2 w-4 h-4" />
								Image library
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 py-2">
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
										presenceByPage={presenceByPage}
										currentUser={currentUser}
										onNewSubPage={onNewSubPage}
										onMove={handleOpenMove}
										onDelete={openDelete}
									/>
								))
							)}
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem onClick={onNewPage}>
							<AddRegular className="mr-2 w-4 h-4" />
							Create page
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>

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

			{pageActionDialogs}
		</>
	);
}
