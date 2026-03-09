import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { MoreHorizontalRegular, SaveRegular, InfoRegular } from '@fluentui/react-icons';
import { EmojiPickerPopover } from '../components/ui/EmojiPickerPopover';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { PageMenuItems } from '../components/ui/PageMenuItems';
import { usePageActions } from '../hooks/usePageActions';
import { UserAvatar } from '../components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { ScrollArea } from '../components/ui/scroll-area';
import { MarkdownEditor } from '../components/editor/MarkdownEditor';
import { MarkdownViewer } from '../components/editor/MarkdownViewer';
import { SlideViewer } from '../components/editor/SlideViewer';
import { PageInfoPanel } from '../components/layout/PageInfoPanel';
import { wsClient, useWsListener } from '../store/ws';
import { useUser } from '../store/user';
import type { PresenceUser } from '../lib/types';
import NotFound from './NotFound';
import { extensionToType, pathExtension } from '@/lib/filetypes';

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
	emoji?: string;
	slides?: boolean;
}

/**
 * Parse only the whitelisted frontmatter fields (emoji, marp) from a raw markdown string.
 * Any other YAML fields are intentionally discarded — KumiDocs only manages its own
 * metadata and does not attempt to round-trip arbitrary frontmatter.
 */
function parseFrontmatter(raw: string): { data: DocMeta; content: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { data: {}, content: raw };
	const block = match[1] ?? '';
	const content = raw.slice(match[0].length);
	const data: DocMeta = {};
	for (const line of block.split('\n')) {
		const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
		if (!kv) continue;
		const [, key, val = ''] = kv;
		if (key === 'emoji') data.emoji = val.trim();
		if (key === 'slides' && val.trim() === 'true') data.slides = true;
	}
	return { data, content };
}

/** Reconstruct a frontmatter block from only the whitelisted fields (emoji, slides). Unknown fields are not preserved. */
function buildFrontmatter(meta: DocMeta): string {
	const lines: string[] = [];
	if (meta.emoji) lines.push(`emoji: ${meta.emoji}`);
	if (meta.slides) lines.push('slides: true');
	if (lines.length === 0) return '';
	return `---\n${lines.join('\n')}\n---\n`;
}

/** Return the text of the first `# Heading` line in a markdown body, or null. */
function extractHeadingTitle(body: string): string | null {
	for (const line of body.split('\n')) {
		if (line.startsWith('# ')) return line.slice(2).trim();
	}
	return null;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

const AUTO_SAVE_DELAY = 5000;

export default function FilePage() {
	const { '*': rawPath = '' } = useParams();
	const filePath = !rawPath.includes('.') ? `${rawPath}.md` : rawPath; // default to .md if no extension

	const navigate = useNavigate();
	const { reloadTree } = useOutletContext<OutletCtx>();
	const { user } = useUser();

	const [content, setContent] = useState('');
	const [savedContent, setSavedContent] = useState('');

	const [meta, setMeta] = useState<DocMeta>({});
	const [editMode, setEditMode] = useState(false);
	const [editLocked, setEditLocked] = useState<PresenceUser | null>(null);
	const [viewers, setViewers] = useState<PresenceUser[]>([]);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
	const [lastSha, setLastSha] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);

	// Shared move/delete actions (dialogs rendered at bottom of JSX)
	const { openMove, openDelete, dialogs: pageActionDialogs } = usePageActions(reloadTree);

	// Modals
	const [infoOpen, setInfoOpen] = useState(
		() => localStorage.getItem('kumidocs:info-open') === 'true',
	);
	const [remoteBanner, setRemoteBanner] = useState<string | null>(null);
	const [isPdfExporting, setIsPdfExporting] = useState(false);
	const pdfContentRef = useRef<HTMLDivElement>(null);

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
	// Clear the auto-save timer on unmount to prevent a save firing on a dead component.
	useEffect(() => {
		return () => {
			if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
		};
	}, []);
	// Mutex: chain saves so they never run concurrently (prevents double-commit 409)
	const savePromiseRef = useRef<Promise<void>>(Promise.resolve());
	// Explicit dirty flag — set true on any content change, false when a save succeeds.
	// More reliable than comparing content strings (which can have whitespace/newline
	// differences introduced by matter.stringify round-tripping).
	const isDirtyRef = useRef(false);
	// Keep a ref to latest content so exitEdit/auto-save always read the latest value
	const contentRef = useRef(content);
	contentRef.current = content;
	const savedContentRef = useRef(savedContent);
	savedContentRef.current = savedContent;
	// Keep a ref to latest meta so doSave always writes the current emoji/marp flag
	const metaRef = useRef(meta);
	metaRef.current = meta;

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
				sha: string;
			};
			const parsed = parseFrontmatter(data.content);
			setContent(parsed.content);
			setSavedContent(parsed.content);
			isDirtyRef.current = false;
			setMeta(parsed.data);
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

	// Tell server which page we're on; clean up presence when navigating away or unmounting.
	useEffect(() => {
		if (user) wsClient.joinPage(filePath);
		return () => {
			if (editModeRef.current) wsClient.stopEditing(filePath);
			wsClient.leavePage();
		};
	}, [filePath, user]);

	// WS events
	useWsListener((msg) => {
		if (msg.type === 'presence_update' && msg.pageId === filePath) {
			setViewers(msg.viewers);
			setEditLocked(msg.editor);
		}
		if (msg.type === 'page_changed' && msg.pageId === filePath) {
			// Ignore echoes of our own saves — the server broadcasts to all
			// clients including the sender, but we've already applied the change.
			if (msg.changedBy === user?.id) return;
			if (!isDirtyRef.current) {
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

				// Reconstruct frontmatter from whitelisted fields only (emoji, marp).
				const fullContent = buildFrontmatter(metaRef.current) + currentContent;

				try {
					const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ content: fullContent }),
					});
					if (res.ok) {
						const data = (await res.json()) as { sha: string };
						setSavedContent(currentContent);
						savedContentRef.current = currentContent;
						isDirtyRef.current = false; // mark clean immediately
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
		[filePath, reloadTree, loadDoc],
	);

	// Handle content changes
	const handleChange = useCallback(
		(val: string) => {
			setContent(val);
			setSaveStatus('unsaved');
			isDirtyRef.current = true; // mark dirty immediately
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

	// Emoji change (edit mode only) — update meta and persist immediately
	const handleEmojiChange = useCallback(
		(newEmoji: string) => {
			// Update the ref synchronously so the save below picks up the new emoji.
			metaRef.current = { ...metaRef.current, emoji: newEmoji };
			setMeta((prev) => ({ ...prev, emoji: newEmoji }));
			// Persist the emoji change immediately (chains behind any in-flight save).
			doSave(contentRef.current).catch((err: unknown) => {
				console.error('Emoji save failed:', err);
			});
		},
		[doSave],
	);

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
		// Drain any in-flight save first, then check the explicit dirty flag.
		// isDirtyRef is set true on every keystroke and false immediately when a save
		// succeeds — so it's always accurate regardless of React render scheduling.
		await savePromiseRef.current;
		if (isDirtyRef.current) {
			await doSave(contentRef.current);
		}
		wsClient.stopEditing(filePath);
		setEditMode(false);
	}, [doSave, filePath]);

	const rawExt = pathExtension(filePath);
	let fileType = extensionToType(rawExt);
	if (fileType === 'doc' && meta.slides) fileType = 'slide';
	const title =
		fileType === 'doc' || fileType === 'slide'
			? (extractHeadingTitle(content) ?? pathToTitle(filePath))
			: (filePath.split('/').pop() ?? filePath);

	const handlePageDuplicate = useCallback(async () => {
		try {
			const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
			if (!res.ok) {
				toast.error('Duplicate failed');
				return;
			}
			const data = (await res.json()) as { content: string };
			const newPath = `${filePath.replace(/\.md$/i, '')}-copy.md`;
			const saveRes = await fetch('/api/file', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: newPath, content: data.content }),
			});
			if (saveRes.ok) {
				reloadTree();
				toast.success('Page duplicated');
				navigate(`/p/${newPath}`)?.catch((err: unknown) => {
					console.error('Navigation failed:', err);
				});
			} else if (saveRes.status === 409) {
				toast.error('A copy already exists at that path');
			} else {
				toast.error('Duplicate failed');
			}
		} catch {
			toast.error('Duplicate failed');
		}
	}, [filePath, navigate, reloadTree]);

	const exportPagePdf = useCallback(async () => {
		if (isPdfExporting) return;
		setIsPdfExporting(true);
		try {
			const el = pdfContentRef.current;
			if (!el) return;
			const { default: html2canvas } = await import('html2canvas-pro');
			const { jsPDF } = await import('jspdf');
			const RENDER_W = 800;
			const SCALE = 1.5;
			const PAGE_H_PX = Math.floor((RENDER_W * 297) / 210); // A4 portrait ratio ≈ 1131px
			const canvas = await html2canvas(el, {
				width: RENDER_W,
				scale: SCALE,
				useCORS: true,
				logging: false,
			});
			const pdf = new jsPDF({
				orientation: 'portrait',
				unit: 'px',
				format: [RENDER_W, PAGE_H_PX],
			});
			const totalH = canvas.height;
			const scaledPageH = PAGE_H_PX * SCALE;
			let yOffset = 0;
			while (yOffset < totalH) {
				const sliceH = Math.min(scaledPageH, totalH - yOffset);
				const sliceCanvas = document.createElement('canvas');
				sliceCanvas.width = canvas.width;
				sliceCanvas.height = Math.ceil(sliceH);
				const ctx = sliceCanvas.getContext('2d');
				if (ctx) ctx.drawImage(canvas, 0, -yOffset);
				if (yOffset > 0) pdf.addPage();
				pdf.addImage(
					sliceCanvas.toDataURL('image/png'),
					'PNG',
					0,
					0,
					RENDER_W,
					sliceH / SCALE,
				);
				yOffset += scaledPageH;
			}
			pdf.save(`${title}.pdf`);
		} finally {
			setIsPdfExporting(false);
		}
	}, [isPdfExporting, title]);

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
		return <NotFound />;
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
					<EmojiPickerPopover
						emoji={meta.emoji}
						fileType={fileType}
						size={24}
						editable={editMode}
						onSelect={handleEmojiChange}
					/>
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

				{/* Save status – inline next to Edit button */}
				{editMode && (
					<Badge
						variant="outline"
						className={`text-xs h-5 shrink-0${
							saveStatus === 'saved'
								? ' border-green-600 text-green-600 dark:border-green-500 dark:text-green-500'
								: saveStatus === 'error'
									? ' border-destructive text-destructive'
									: ''
						}`}
					>
						{saveStatus === 'saved' && 'Saved'}
						{saveStatus === 'saving' && 'Saving…'}
						{saveStatus === 'unsaved' && 'Unsaved'}
						{saveStatus === 'error' && 'Error'}
					</Badge>
				)}

				{/* Right: viewers + info + dropdown */}
				<div className="flex items-center gap-2 flex-1 justify-end min-w-0">
					{/* Viewers — deduplicated by id (same user may have multiple tabs open) */}
					<div className="flex -space-x-1">
						{[...new Map(viewers.map((v) => [v.id, v])).values()]
							.slice(0, 5)
							.map((v) => (
								<Tooltip key={v.id}>
									<TooltipTrigger asChild>
										<UserAvatar
											name={v.name}
											email={v.email}
											size="sm"
											className="border border-background ring-1 ring-border"
										/>
									</TooltipTrigger>
									<TooltipContent>{v.name}</TooltipContent>
								</Tooltip>
							))}
					</div>

					{/* Dedicated info button */}
					<Button
						size="sm"
						variant={infoOpen && !editMode ? 'secondary' : 'ghost'}
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
								<PageMenuItems
									variant="dropdown"
									href={`/p/${rawPath}`}
									path={filePath}
									displayTitle={title}
									onDuplicate={() => {
										void handlePageDuplicate();
									}}
									onExportPdf={
										fileType === 'doc' && !editMode
											? () => {
													void exportPagePdf();
												}
											: undefined
									}
									onMove={(p) => {
										openMove(p).catch((err: unknown) => {
											console.error('Failed to open move dialog:', err);
										});
									}}
									onDelete={openDelete}
								/>
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
				<div className="flex-1 overflow-hidden flex flex-col">
					{editMode ? (
						<MarkdownEditor
							value={content}
							onChange={handleChange}
							onSave={handleSave}
						/>
					) : fileType === 'slide' ? (
						<SlideViewer value={content} filename={title} />
					) : (
						<ScrollArea className="h-full">
							<MarkdownViewer
								value={
									fileType === 'code'
										? `\`\`\`${rawExt}\n${content}\n\`\`\``
										: content
								}
							/>
						</ScrollArea>
					)}
				</div>
				{infoOpen && !editMode && (
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

			{/* Off-screen render container for PDF export */}
			{fileType === 'doc' && (
				<div
					ref={pdfContentRef}
					aria-hidden="true"
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						width: 800,
						zIndex: -9999,
						pointerEvents: 'none',
					}}
				>
					<MarkdownViewer value={content} />
				</div>
			)}

			{/* Move + Delete dialogs (shared hook) */}
			{pageActionDialogs}
		</div>
	);
}
