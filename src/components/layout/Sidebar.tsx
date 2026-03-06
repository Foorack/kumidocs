import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
	AddRegular,
	ChevronRightRegular,
	ChevronDownRegular,
	CircleFilled,
	FolderRegular,
	FolderOpenRegular,
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
import type { TreeNode, PresenceUser } from '../../lib/types';

interface SidebarProps {
	tree: TreeNode[];
	onNewPage: () => void;
	onNewSubPage: (parentDir: string) => void;
	editingPages: Map<string, PresenceUser>;
}

/** Sort: README.md first, then dirs alphabetically, then files alphabetically. */
function sortNodes(nodes: TreeNode[]): TreeNode[] {
	return [...nodes].sort((a, b) => {
		if (a.name === 'README.md') return -1;
		if (b.name === 'README.md') return 1;
		if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	});
}

function FileIcon({ node }: { node: TreeNode }) {
	return <KumiIcon emoji={node.fileEntry?.emoji} fileType={node.fileEntry?.type} size={18} />;
}

function TreeNodeRow({
	node,
	depth,
	editingPages,
	onNewSubPage,
}: {
	node: TreeNode;
	depth: number;
	editingPages: Map<string, PresenceUser>;
	onNewSubPage: (parentDir: string) => void;
}) {
	const location = useLocation();
	const [open, setOpen] = useState(node.name === 'README.md' || depth === 0);

	if (node.type === 'dir') {
		return (
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div>
						<div
							className="flex items-center gap-1 px-2 py-[3px] rounded text-sm cursor-pointer select-none hover:bg-accent/50 text-muted-foreground hover:text-foreground"
							style={{ paddingLeft: `${String(8 + depth * 12)}px` }}
							onClick={() => {
								setOpen((o) => !o);
							}}
						>
							{open ? (
								<ChevronDownRegular className="w-3 h-3 shrink-0" />
							) : (
								<ChevronRightRegular className="w-3 h-3 shrink-0" />
							)}
							{open ? (
								<FolderOpenRegular className="w-4 h-4 shrink-0 text-amber-500" />
							) : (
								<FolderRegular className="w-4 h-4 shrink-0 text-amber-500" />
							)}
							<span className="truncate flex-1 min-w-0 font-medium text-foreground/80">
								{node.name}
							</span>
						</div>
						{open && (
							<div>
								{sortNodes(node.children ?? []).map((child) => (
									<TreeNodeRow
										key={child.path}
										node={child}
										depth={depth + 1}
										editingPages={editingPages}
										onNewSubPage={onNewSubPage}
									/>
								))}
							</div>
						)}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem
						onClick={() => {
							onNewSubPage(node.path);
						}}
					>
						<AddRegular className="mr-2 w-4 h-4" />
						New page in this folder
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		);
	}

	// File node
	const href =
		node.fileEntry?.type === 'code'
			? `/code/${node.path}`
			: node.fileEntry?.type === 'slide'
				? `/p/${node.path}`
				: `/p/${node.path}`;

	const isActive =
		location.pathname === href ||
		location.pathname === `/p/${node.path}` ||
		location.pathname === `/slides/${node.path}`;

	const beingEdited = editingPages.get(node.path);
	const displayTitle = node.fileEntry?.title ?? node.name.replace(/\.[^.]+$/, '');

	const rowContent = (
		<div
			className={`flex items-center gap-1.5 px-2 py-[3px] rounded text-sm select-none ${
				isActive
					? 'bg-accent text-accent-foreground font-medium'
					: 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
			}`}
			style={{ paddingLeft: `${String(8 + depth * 12 + 12)}px` }}
		>
			<FileIcon node={node} />
			<Link to={href} className="truncate flex-1 min-w-0" title={displayTitle}>
				{displayTitle}
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
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem
					onClick={() => {
						// Parent dir: strip filename from path
						const dir = node.path.includes('/')
							? node.path.substring(0, node.path.lastIndexOf('/'))
							: '';
						onNewSubPage(dir);
					}}
				>
					<AddRegular className="mr-2 w-4 h-4" />
					Create page alongside
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

// Files to hide from the sidebar (legacy / internal)
const HIDDEN_NAMES = new Set(['_sidebar.md']);

function filterTree(nodes: TreeNode[]): TreeNode[] {
	return nodes
		.filter((n) => !HIDDEN_NAMES.has(n.name))
		.map((n) =>
			n.type === 'dir' && n.children ? { ...n, children: filterTree(n.children) } : n,
		);
}

export function Sidebar({ tree, onNewPage, onNewSubPage, editingPages }: SidebarProps) {
	const visible = filterTree(sortNodes(tree));

	return (
		<aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col h-full">
			<ScrollArea className="flex-1 px-1 py-2">
				{visible.length === 0 ? (
					<div className="px-3 py-4 text-xs text-muted-foreground text-center">
						No pages yet.
						<br />
						Create your first page below.
					</div>
				) : (
					visible.map((node) => (
						<TreeNodeRow
							key={node.path}
							node={node}
							depth={0}
							editingPages={editingPages}
							onNewSubPage={onNewSubPage}
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
	);
}
