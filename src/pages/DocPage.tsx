import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import matter from 'gray-matter';
import {
	DeleteRegular,
	MoreHorizontalRegular,
	SaveRegular,
	InfoRegular,
} from '@fluentui/react-icons';
import { KumiIcon } from '../components/ui/KumiIcon';
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
import { UserAvatar } from '../components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { ScrollArea } from '../components/ui/scroll-area';
import { MarkdownEditor } from '../components/editor/MarkdownEditor';
import { DocViewer } from '../components/editor/DocViewer';
import { PageInfoPanel } from '../components/layout/PageInfoPanel';
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
	const [infoOpen, setInfoOpen] = useState(
		() => localStorage.getItem('kumidocs:info-open') === 'true',
	);
	const [remoteBanner, setRemoteBanner] = useState<string | null>(null);

	// Toggle info panel from sidebar context menu (same-tab custom event)
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<string>).detail;
			if (detail === filePath) {
				setInfoOpen((v) => {
					const next = !v;
					if (next) localStorage.setItem('kumidocs:info-open', 'true');
					else localStorage.removeItem('kumidocs:info-open');
					return next;
				});
			}
		};
		window.addEventListener('kumidocs:open-info', handler);
		return () => {
			window.removeEventListener('kumidocs:open-info', handler);
		};
	}, [filePath]);

	const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Mutex: chain saves so they never run concurrently (prevents double-commit 409)
	const savePromiseRef = useRef<Promise<void>>(Promise.resolve());
	const isDirty = content !== savedContent;
	// Keep refs to latest content/savedContent so exitEdit can read them without stale closures
	const contentRef = useRef(content);
	contentRef.current = content;
	const savedContentRef = useRef(savedContent);
	savedContentRef.current = savedContent;

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
		loadDoc(filePath).catch((err: unknown) => {
			console.error('Failed to load document:', err);
		});
	}, [filePath, loadDoc]);

	// Track editMode in a ref so the cleanup can read the latest value
	// without adding editMode to the effect deps (which would re-run joinPage on every keystroke).
	const editModeRef = useRef(editMode);
	editModeRef.current = editMode;

	// Tell server which page we're on
	useEffect(() => {
		if (user) wsClient.joinPage(filePath);
		return () => {
			if (editModeRef.current) wsClient.stopEditing(filePath);
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
				loadDoc(filePath).catch((err: unknown) => {
					console.error('Failed to reload document after remote change:', err);
				});
				toast.info(`Page updated by ${msg.changedByName}`);
			} else {
				setRemoteBanner(`${msg.changedByName} saved this page remotely`);
			}
		}
		if (msg.type === 'page_deleted' && msg.pageId === filePath) {
			toast.warning('This page was deleted');
			navigate('/p/README.md')?.catch((err: unknown) => {
				console.error('Navigation failed:', err);
			});
		}
		if (msg.type === 'save_conflict_lost' && msg.pageId === filePath) {
			toast.error('Your changes were lost due to a remote conflict.');
			loadDoc(filePath).catch((err: unknown) => {
				console.error('Failed to reload document after conflict:', err);
			});
		}
	});

	// Save function — serialised via savePromiseRef so two saves never run concurrently.
	// Concurrent saves (e.g. auto-save fires + user presses Done simultaneously) would
	// produce two git commits on the same file, causing the second one to 409-conflict.
	const doSave = useCallback(
		(currentContent: string): Promise<void> => {
			if (autoSaveTimer.current) {
				clearTimeout(autoSaveTimer.current);
				autoSaveTimer.current = null;
			}
			// Chain behind any in-flight save
			const next = savePromiseRef.current.then(async () => {
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
						loadDoc(filePath).catch((err: unknown) => {
							console.error('Failed to reload document after conflict:', err);
						});
					} else {
						setSaveStatus('error');
						toast.error('Save failed.');
					}
				} catch {
					setSaveStatus('error');
					toast.error('Save failed — network error.');
				}
			});
			savePromiseRef.current = next;
			return next;
		},
		[filePath, reloadTree, loadDoc, originalFrontmatter],
	);

	// Handle content changes
	const handleChange = useCallback(
		(val: string) => {
			setContent(val);
			setSaveStatus('unsaved');
			if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
			autoSaveTimer.current = setTimeout(() => {
				doSave(val).catch((err: unknown) => {
					console.error('Auto-save failed:', err);
				});
			}, AUTO_SAVE_DELAY);
		},
		[doSave],
	);

	// Ctrl+S
	const handleSave = useCallback(() => {
		doSave(content).catch((err: unknown) => {
			console.error('Manual save failed:', err);
		});
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
		// Use refs to always read the latest content/savedContent values regardless of
		// when React last re-rendered — eliminates the stale-closure 409 race where
		// clicking Read before the post-Ctrl+S render would see stale savedContent and
		// incorrectly trigger a second save of already-committed content.
		const latestContent = contentRef.current;
		const latestIsDirty = latestContent !== savedContentRef.current;
		if (latestIsDirty) {
			await doSave(latestContent);
		} else {
			// Even if not dirty, wait for any in-flight auto-save to finish
			await savePromiseRef.current;
		}
		wsClient.stopEditing(filePath);
		setEditMode(false);
	}, [doSave, filePath]);

	// Delete
	const handleDelete = useCallback(async () => {
		const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, {
			method: 'DELETE',
		});
		if (res.ok) {
			toast.success('Page deleted');
			reloadTree();
			navigate('/p/README.md')?.catch((err: unknown) => {
				console.error('Navigation failed after delete:', err);
			});
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
			navigate(`/p/${toPath}`)?.catch((err: unknown) => {
				console.error('Navigation failed after rename:', err);
			});
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
			navigate(`/p/${p}`)?.catch((err: unknown) => {
				console.error('Navigation failed after page creation:', err);
			});
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
	const fileType = meta.marp ? 'slide' : 'doc';

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
							<Button
								onClick={() => {
									handleNewPage().catch((err: unknown) => {
										console.error('Failed to create page:', err);
									});
								}}
							>
								Create
							</Button>
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
							loadDoc(filePath).catch((err: unknown) => {
								console.error('Failed to reload document:', err);
							});
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
				{/* Left: icon + title */}
				<div className="flex items-center gap-2 flex-1 min-w-0">
					<KumiIcon emoji={emoji} fileType={fileType} size={24} />
					<h1 className="font-semibold text-base truncate">{title}</h1>
				</div>

				{/* Center: Read/Edit segmented switch */}
				{user?.canEdit && (
					<div
						className="flex items-center rounded-md border border-border bg-muted h-7 p-0.5 gap-0.5 shrink-0"
						title={
							editLocked && editLocked.id !== user.id
								? `${editLocked.name} is editing`
								: undefined
						}
					>
						<button
							className={`h-6 px-2.5 rounded text-xs transition-colors select-none ${!editMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground cursor-pointer'}`}
							onClick={() => {
								if (editMode)
									exitEdit().catch((err: unknown) => {
										console.error('Failed to exit edit mode:', err);
									});
							}}
						>
							Read
						</button>
						<button
							className={`h-6 px-2.5 rounded text-xs transition-colors select-none ${editMode ? 'bg-background text-foreground shadow-sm' : editLocked && editLocked.id !== user.id ? 'text-muted-foreground opacity-40 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground cursor-pointer'}`}
							onClick={() => {
								if (!editMode && !(editLocked && editLocked.id !== user.id))
									enterEdit();
							}}
							disabled={editMode || !!(editLocked && editLocked.id !== user.id)}
						>
							Edit
						</button>
					</div>
				)}

				{/* Right: viewers + save status + info + dropdown */}
				<div className="flex items-center gap-2 flex-1 justify-end min-w-0">
					{/* Viewers */}
					<div className="flex -space-x-1">
						{viewers.slice(0, 5).map((v) => (
							<Tooltip key={v.id}>
								<TooltipTrigger asChild>
									<UserAvatar
										name={v.name}

										size="sm"
										className="border border-background ring-1 ring-border"
									/>
								</TooltipTrigger>
								<TooltipContent>{v.name}</TooltipContent>
							</Tooltip>
						))}
					</div>

					{/* Save status (in edit mode) */}
					{editMode && (
						<Badge
							variant={
								saveStatus === 'saving'
									? 'outline'
									: saveStatus === 'error'
										? 'destructive'
										: 'outline'
								}
							className={`text-xs h-5 shrink-0${
								saveStatus === 'saved'
									? ' border-green-600 text-green-600 dark:border-green-500 dark:text-green-500'
									: ''
							}`}
						>
							{saveStatus === 'saved' && 'Saved'}
							{saveStatus === 'saving' && 'Saving…'}
							{saveStatus === 'unsaved' && 'Unsaved'}
							{saveStatus === 'error' && 'Error'}
						</Badge>
					)}

					{/* Dedicated info button */}
					<Button
						size="sm"
						variant={infoOpen ? 'secondary' : 'ghost'}
						className="h-7 gap-1 text-xs px-2"
						onClick={() => {
							setInfoOpen((v) => {
								const next = !v;
								if (next) localStorage.setItem('kumidocs:info-open', 'true');
								else localStorage.removeItem('kumidocs:info-open');
								return next;
							});
						}}
					>
						<InfoRegular className="w-4 h-4" />
						Info
					</Button>

					{/* Advanced / dangerous actions only */}
					{user?.canEdit && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button size="icon" variant="ghost" className="h-7 w-7">
									<MoreHorizontalRegular className="w-4 h-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
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
			</div>

			{/* Breadcrumb */}
			{breadcrumb.length > 0 && (
				<div className="px-4 py-0.5 text-xs text-muted-foreground border-b border-border shrink-0">
					{breadcrumb.join(' / ')}
				</div>
			)}

			{/* Content area */}
			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 overflow-auto">
					{editMode ? (
						<MarkdownEditor
							value={content}
							onChange={handleChange}
							onSave={handleSave}
						/>
					) : (
						<ScrollArea className="h-full">
							<DocViewer value={content} />
						</ScrollArea>
					)}
				</div>
				{infoOpen && (
					<PageInfoPanel
						key={filePath}
						filePath={filePath}
						title={title}
						onClose={() => {
							setInfoOpen(false);
							localStorage.removeItem('kumidocs:info-open');
						}}
					/>
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
						<Button
							variant="destructive"
							onClick={() => {
								handleDelete().catch((err: unknown) => {
									console.error('Failed to delete page:', err);
								});
							}}
						>
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
						<Button
							onClick={() => {
								handleRename().catch((err: unknown) => {
									console.error('Failed to rename page:', err);
								});
							}}
						>
							Rename
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
