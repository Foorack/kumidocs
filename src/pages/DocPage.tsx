import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import matter from 'gray-matter';
import {
	EditRegular,
	CheckmarkRegular,
	DeleteRegular,
	RenameRegular,
	MoreHorizontalRegular,
	SaveRegular,
} from '@fluentui/react-icons';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { ScrollArea } from '../components/ui/scroll-area';
import { MarkdownEditor } from '../components/editor/MarkdownEditor';
import { DocViewer } from '../components/editor/DocViewer';
import { wsClient, useWsListener } from '../store/ws';
import { useUser } from '../store/user';
import type { PresenceUser } from '../lib/types';

interface OutletCtx {
	reloadTree: () => void;
}

// Derive a nice title from the file path
function pathToTitle(path: string): string {
	return (path.split('/').pop() ?? path)
		.replace(/\.md$/, '')
		.replace(/[-_]/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface DocMeta {
	title?: string;
	emoji?: string;
	description?: string;
	marp?: boolean;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

const AUTO_SAVE_DELAY = 5000;

export default function DocPage() {
	const { '*': rawPath = '' } = useParams();
	const filePath = rawPath.endsWith('.md') ? rawPath : `${rawPath}.md`;
	const navigate = useNavigate();
	const { reloadTree } = useOutletContext<OutletCtx>();
	const { user } = useUser();

	const [content, setContent] = useState('');
	const [savedContent, setSavedContent] = useState('');
	const [originalFrontmatter, setOriginalFrontmatter] = useState<Record<string, unknown>>({});
	const [meta, setMeta] = useState<DocMeta>({});
	const [editMode, setEditMode] = useState(false);
	const [editLocked, setEditLocked] = useState<PresenceUser | null>(null);
	const [viewers, setViewers] = useState<PresenceUser[]>([]);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
	const [lastSha, setLastSha] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);

	// Modals
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);
	const [newName, setNewName] = useState('');
	const [newPageOpen, setNewPageOpen] = useState(false);
	const [newPagePath, setNewPagePath] = useState('');
	const [newPageTitle, setNewPageTitle] = useState('');
	const [remoteBanner, setRemoteBanner] = useState<string | null>(null);

	const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isDirty = content !== savedContent;

	// Load document
	const loadDoc = useCallback(async (path: string) => {
		setLoading(true);
		setNotFound(false);
		try {
			const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
			if (res.status === 404) {
				setNotFound(true);
				setLoading(false);
				return;
			}
			const data = (await res.json()) as {
				content: string;
				body: string;
				frontmatter: DocMeta & Record<string, unknown>;
				sha: string;
			};
			// Store frontmatter separately, show only body in editor
			setOriginalFrontmatter(data.frontmatter);
			setContent(data.body);
			setSavedContent(data.body);
			setMeta(data.frontmatter);
			setLastSha(data.sha);
			setSaveStatus('saved');
			setEditMode(false);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadDoc(filePath);
	}, [filePath, loadDoc]);

	// Tell server which page we're on
	useEffect(() => {
		if (user) wsClient.joinPage(filePath);
		return () => {
			if (editMode) wsClient.stopEditing(filePath);
		};
	}, [filePath, user]);

	// WS events
	useWsListener((msg) => {
		if (msg.type === 'presence_update' && msg.pageId === filePath) {
			setViewers(msg.viewers);
			setEditLocked(msg.editor);
		}
		if (msg.type === 'page_changed' && msg.pageId === filePath) {
			if (!isDirty) {
				loadDoc(filePath);
				toast.info(`Page updated by ${msg.changedByName}`);
			} else {
				setRemoteBanner(`${msg.changedByName} saved this page remotely`);
			}
		}
		if (msg.type === 'page_deleted' && msg.pageId === filePath) {
			toast.warning('This page was deleted');
			navigate('/p/README.md');
		}
		if (msg.type === 'save_conflict_lost' && msg.pageId === filePath) {
			toast.error('Your changes were lost due to a remote conflict.');
			loadDoc(filePath);
		}
	});

	// Save function
	const doSave = useCallback(
		async (currentContent: string) => {
			if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
			setSaveStatus('saving');
			try {
				// Reconstruct full content with frontmatter
				const fullContent =
					Object.keys(originalFrontmatter).length > 0
						? matter.stringify(currentContent, originalFrontmatter)
						: currentContent;

				const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content: fullContent }),
				});
				if (res.ok) {
					const data = (await res.json()) as { sha: string };
					setSavedContent(currentContent);
					setSaveStatus('saved');
					setLastSha(data.sha);
					reloadTree();
				} else if (res.status === 409) {
					setSaveStatus('error');
					toast.error('Conflict: changes were reverted by a remote update.');
					loadDoc(filePath);
				} else {
					setSaveStatus('error');
					toast.error('Save failed.');
				}
			} catch {
				setSaveStatus('error');
				toast.error('Save failed — network error.');
			}
		},
		[filePath, reloadTree, loadDoc, originalFrontmatter],
	);

	// Handle content changes
	const handleChange = useCallback(
		(val: string) => {
			setContent(val);
			setSaveStatus('unsaved');
			if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
			autoSaveTimer.current = setTimeout(() => doSave(val), AUTO_SAVE_DELAY);
		},
		[doSave],
	);

	// Ctrl+S
	const handleSave = useCallback(() => {
		doSave(content);
	}, [doSave, content]);

	// Edit mode toggle
	const enterEdit = useCallback(() => {
		if (!user?.canEdit) return;
		if (editLocked && editLocked.id !== user.id) {
			toast.warning(`${editLocked.name} is currently editing this page.`);
			return;
		}
		wsClient.startEditing(filePath);
		setEditMode(true);
	}, [user, editLocked, filePath]);

	const exitEdit = useCallback(async () => {
		if (isDirty) await doSave(content);
		wsClient.stopEditing(filePath);
		setEditMode(false);
	}, [isDirty, content, doSave, filePath]);

	// Delete
	const handleDelete = useCallback(async () => {
		const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, {
			method: 'DELETE',
		});
		if (res.ok) {
			toast.success('Page deleted');
			reloadTree();
			navigate('/p/README.md');
		} else {
			toast.error('Delete failed');
		}
		setDeleteOpen(false);
	}, [filePath, navigate, reloadTree]);

	// Rename
	const handleRename = useCallback(async () => {
		if (!newName.trim()) return;
		const toPath = newName.trim().endsWith('.md') ? newName.trim() : `${newName.trim()}.md`;
		const res = await fetch('/api/file/rename', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: filePath, to: toPath }),
		});
		if (res.ok) {
			toast.success('Page renamed');
			reloadTree();
			navigate(`/p/${toPath}`);
		} else {
			toast.error('Rename failed');
		}
		setRenameOpen(false);
	}, [filePath, newName, navigate, reloadTree]);

	// Create new page
	const handleNewPage = useCallback(async () => {
		if (!newPagePath.trim()) return;
		const p = newPagePath.trim().endsWith('.md')
			? newPagePath.trim()
			: `${newPagePath.trim()}.md`;
		const stub = `---\ntitle: ${newPageTitle || pathToTitle(p)}\n---\n\n# ${newPageTitle || pathToTitle(p)}\n`;
		const res = await fetch('/api/file', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: p, content: stub }),
		});
		if (res.ok) {
			toast.success('Page created');
			reloadTree();
			navigate(`/p/${p}`);
		} else if (res.status === 409) {
			toast.error('A page at that path already exists.');
		} else {
			toast.error('Create failed');
		}
		setNewPageOpen(false);
		setNewPagePath('');
		setNewPageTitle('');
	}, [newPagePath, newPageTitle, navigate, reloadTree]);

	const title = meta.title ?? pathToTitle(filePath);
	const emoji = meta.emoji;

	// Breadcrumb
	const breadcrumb = filePath.replace(/\.md$/, '').split('/').slice(0, -1);

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				Loading…
			</div>
		);
	}

	if (notFound) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-4">
				<div className="text-4xl">📄</div>
				<div className="text-lg font-medium">Page not found</div>
				<div className="text-sm text-muted-foreground">
					<code className="font-mono bg-muted px-1 rounded">{filePath}</code> doesn't
					exist yet.
				</div>
				{user?.canEdit && (
					<Button
						onClick={() => {
							setNewPageOpen(true);
						}}
					>
						Create this page
					</Button>
				)}
				{/* New page dialog */}
				<Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create page</DialogTitle>
							<DialogDescription>
								Enter the path and title for the new page.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-3">
							<div>
								<Label>Path</Label>
								<Input
									value={newPagePath || filePath}
									onChange={(e) => {
										setNewPagePath(e.target.value);
									}}
									placeholder="docs/my-page.md"
								/>
							</div>
							<div>
								<Label>Title</Label>
								<Input
									value={newPageTitle}
									onChange={(e) => {
										setNewPageTitle(e.target.value);
									}}
									placeholder={pathToTitle(filePath)}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => {
									setNewPageOpen(false);
								}}
							>
								Cancel
							</Button>
							<Button onClick={handleNewPage}>Create</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Remote change banner */}
			{remoteBanner && (
				<div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
					<span className="flex-1">{remoteBanner} while you have unsaved changes.</span>
					<Button
						size="sm"
						variant="outline"
						className="h-6 text-xs"
						onClick={() => {
							loadDoc(filePath);
							setRemoteBanner(null);
						}}
					>
						Reload
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 text-xs"
						onClick={() => {
							setRemoteBanner(null);
						}}
					>
						Dismiss
					</Button>
				</div>
			)}

			{/* Page header */}
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
				<span className="text-xl">{emoji ?? '📄'}</span>
				<h1 className="font-semibold text-base flex-1 truncate">{title}</h1>

				{/* Viewers */}
				<div className="flex -space-x-1">
					{viewers.slice(0, 5).map((v) => (
						<Tooltip key={v.id}>
							<TooltipTrigger asChild>
								<Avatar className="h-6 w-6 border border-background ring-1 ring-border">
									<AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
										{v.initials}
									</AvatarFallback>
								</Avatar>
							</TooltipTrigger>
							<TooltipContent>{v.name}</TooltipContent>
						</Tooltip>
					))}
				</div>

				{/* Save status (in edit mode) */}
				{editMode && (
					<Badge
						variant={
							saveStatus === 'saved'
								? 'secondary'
								: saveStatus === 'saving'
									? 'outline'
									: saveStatus === 'error'
										? 'destructive'
										: 'outline'
						}
						className="text-xs h-5 shrink-0"
					>
						{saveStatus === 'saved' && 'Saved'}
						{saveStatus === 'saving' && 'Saving…'}
						{saveStatus === 'unsaved' && 'Unsaved'}
						{saveStatus === 'error' && 'Error'}
					</Badge>
				)}

				{editMode ? (
					<Button size="sm" className="h-7 gap-1 text-xs" onClick={exitEdit}>
						<CheckmarkRegular className="w-3.5 h-3.5" />
						Done
					</Button>
				) : (
					user?.canEdit && (
						<Button
							size="sm"
							variant="outline"
							className="h-7 gap-1 text-xs"
							onClick={enterEdit}
							disabled={!!(editLocked && editLocked.id !== user?.id)}
							title={
								editLocked && editLocked.id !== user?.id
									? `${editLocked.name} is editing`
									: undefined
							}
						>
							<EditRegular className="w-3.5 h-3.5" />
							{editLocked && editLocked.id !== user?.id
								? `${editLocked.name} editing…`
								: 'Edit'}
						</Button>
					)
				)}

				{user?.canEdit && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="icon" variant="ghost" className="h-7 w-7">
								<MoreHorizontalRegular className="w-4 h-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() => {
									setNewName(filePath);
									setRenameOpen(true);
								}}
							>
								<RenameRegular className="mr-2 w-4 h-4" />
								Rename / Move
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => {
									setDeleteOpen(true);
								}}
							>
								<DeleteRegular className="mr-2 w-4 h-4" />
								Delete page
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{/* Breadcrumb */}
			{breadcrumb.length > 0 && (
				<div className="px-4 py-0.5 text-xs text-muted-foreground border-b border-border shrink-0">
					{breadcrumb.join(' / ')}
				</div>
			)}

			{/* Content area */}
			<div className="flex-1 overflow-auto">
				{editMode ? (
					<MarkdownEditor value={content} onChange={handleChange} onSave={handleSave} />
				) : (
					<ScrollArea className="h-full">
						<DocViewer value={content} />
					</ScrollArea>
				)}
			</div>

			{/* Footer */}
			{lastSha && (
				<div className="px-4 py-1 border-t border-border text-xs text-muted-foreground shrink-0 flex items-center gap-2">
					<SaveRegular className="w-3 h-3" />
					<span>
						Last saved · <code className="font-mono">{lastSha}</code>
					</span>
				</div>
			)}

			{/* Delete confirmation */}
			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete "{title}"?</DialogTitle>
						<DialogDescription>
							This will permanently delete{' '}
							<code className="font-mono">{filePath}</code> and commit the change to
							git. This cannot be undone from the UI.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setDeleteOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleDelete}>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Rename dialog */}
			<Dialog open={renameOpen} onOpenChange={setRenameOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename / Move page</DialogTitle>
						<DialogDescription>
							Enter the new file path (relative to repo root).
						</DialogDescription>
					</DialogHeader>
					<div>
						<Label>New path</Label>
						<Input
							value={newName}
							onChange={(e) => {
								setNewName(e.target.value);
							}}
							placeholder="docs/new-name.md"
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setRenameOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button onClick={handleRename}>Rename</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
