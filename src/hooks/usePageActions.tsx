import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '../components/ui/command';

interface PageOption {
	path: string; // full path e.g. "docs/api.md"
	dir: string; // path without .md — used as the parent dir value
	title: string;
}

// Sentinel for "place at repo root (no parent folder)"
const ROOT = '__root__';

/**
 * Shared hook for Move + Delete page actions.
 * Manages all dialog state internally; returns open-functions and dialog JSX.
 *
 * Usage:
 *   const { openMove, openDelete, dialogs } = usePageActions(reloadTree);
 *   // ... render {dialogs} somewhere in the component tree
 */
export function usePageActions(reloadTree: () => void) {
	const navigate = useNavigate();

	// ── Move dialog ──────────────────────────────────────────────────────────
	const [moveOpen, setMoveOpen] = useState(false);
	const [moveFrom, setMoveFrom] = useState('');
	const [moveParent, setMoveParent] = useState(ROOT); // sentinel = root
	const [moveSlug, setMoveSlug] = useState('');
	const [movePages, setMovePages] = useState<PageOption[]>([]);
	const [parentOpen, setParentOpen] = useState(false);
	const [parentSearch, setParentSearch] = useState('');
	const comboboxRef = useRef<HTMLDivElement>(null);

	// Close the parent combobox dropdown when clicking outside
	useEffect(() => {
		if (!parentOpen) return;
		const handler = (e: MouseEvent) => {
			if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
				setParentOpen(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [parentOpen]);

	const openMove = useCallback(async (filePath: string) => {
		const parts = filePath.replace(/\.md$/, '').split('/');
		const slug = parts.pop() ?? '';
		const parent = parts.join('/');
		setMoveFrom(filePath);
		setMoveSlug(slug);
		setParentSearch('');
		try {
			const res = await fetch('/api/tree');
			type RawNode = {
				path: string;
				type: string;
				fileEntry?: { title?: string };
				children?: RawNode[];
			};
			const tree = (await res.json()) as RawNode[];
			// Flatten the nested tree into a flat list of file nodes
			const flatten = (nodes: RawNode[]): RawNode[] =>
				nodes.flatMap((n) => (n.type === 'dir' ? flatten(n.children ?? []) : [n]));
			const pages: PageOption[] = flatten(tree)
				.filter(({ path: p }) => p.endsWith('.md') && p !== filePath)
				.map(({ path: p, fileEntry }) => ({
					path: p,
					dir: p.replace(/\.md$/i, ''),
					title: fileEntry?.title ?? p.replace(/\.md$/i, ''),
				}))
				.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
			setMovePages(pages);
			const parentPageExists = pages.some((pg) => pg.dir === parent);
			setMoveParent(parent && parentPageExists ? parent : ROOT);
		} catch {
			setMovePages([]);
			setMoveParent(ROOT);
		}
		setMoveOpen(true);
	}, []);

	const confirmMove = useCallback(async () => {
		const slug = moveSlug.trim().replace(/\.md$/, '');
		if (!slug) return;
		const parent = moveParent === ROOT ? '' : moveParent;
		const toPath = parent ? `${parent}/${slug}.md` : `${slug}.md`;
		const res = await fetch('/api/file/rename', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: moveFrom, to: toPath }),
		});
		if (res.ok) {
			toast.success('Page moved');
			reloadTree();
			navigate(`/p/${toPath}`)?.catch((err: unknown) => {
				console.error('Navigation failed after move:', err);
			});
		} else {
			toast.error('Move failed');
		}
		setMoveOpen(false);
	}, [moveFrom, moveParent, moveSlug, navigate, reloadTree]);

	// ── Delete dialog ─────────────────────────────────────────────────────────
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState('');
	const [deleteTitle, setDeleteTitle] = useState('');

	const openDelete = useCallback((filePath: string, title?: string) => {
		setDeleteTarget(filePath);
		setDeleteTitle(title ?? filePath);
		setDeleteOpen(true);
	}, []);

	const confirmDelete = useCallback(async () => {
		const res = await fetch(`/api/file?path=${encodeURIComponent(deleteTarget)}`, {
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
	}, [deleteTarget, navigate, reloadTree]);

	// ── Preview path ──────────────────────────────────────────────────────────
	const previewParent = moveParent === ROOT ? '' : moveParent;
	const previewSlug = moveSlug || 'page-name';
	const previewPath = previewParent ? `${previewParent}/${previewSlug}.md` : `${previewSlug}.md`;

	// ── Dialog JSX ────────────────────────────────────────────────────────────
	const dialogs = (
		<>
			{/* Move dialog */}
			<Dialog open={moveOpen} onOpenChange={setMoveOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Move page</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label>Parent</Label>
							{/* Searchable combobox */}
							<div ref={comboboxRef} className="relative">
								<button
									type="button"
									className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
									onClick={() => {
										setParentOpen((o) => !o);
									}}
								>
									<span className="truncate text-left">
										{moveParent === ROOT
											? '(root)'
											: (movePages.find((pg) => pg.dir === moveParent)
													?.title ?? moveParent)}
									</span>
									<ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
								</button>
								{parentOpen && (
									<div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
										<Command shouldFilter={false}>
											<CommandInput
												autoFocus
												placeholder="Search pages…"
												value={parentSearch}
												onValueChange={setParentSearch}
											/>
											<CommandList className="max-h-48">
												<CommandEmpty>No pages found.</CommandEmpty>
												<CommandGroup>
													{/* Root option */}
													{'(root)'.includes(
														parentSearch.toLowerCase(),
													) && (
														<CommandItem
															value={ROOT}
															onSelect={() => {
																setMoveParent(ROOT);
																setParentOpen(false);
																setParentSearch('');
															}}
														>
															<CheckIcon
																className={`mr-2 h-4 w-4 ${moveParent === ROOT ? 'opacity-100' : 'opacity-0'}`}
															/>
															(root)
														</CommandItem>
													)}
													{movePages
														.filter((pg) =>
															pg.title
																.toLowerCase()
																.includes(
																	parentSearch.toLowerCase(),
																),
														)
														.map((pg) => (
															<CommandItem
																key={pg.path}
																value={pg.dir}
																onSelect={() => {
																	setMoveParent(pg.dir);
																	setParentOpen(false);
																	setParentSearch('');
																}}
															>
																<CheckIcon
																	className={`mr-2 h-4 w-4 ${moveParent === pg.dir ? 'opacity-100' : 'opacity-0'}`}
																/>
																<span className="truncate">
																	{pg.title}
																</span>
																<span className="ml-auto truncate text-xs text-muted-foreground">
																	{pg.dir}
																</span>
															</CommandItem>
														))}
												</CommandGroup>
											</CommandList>
										</Command>
									</div>
								)}
							</div>
						</div>
						<div className="space-y-1.5">
							<Label>Filename</Label>
							<Input
								value={moveSlug}
								onChange={(e) => {
									setMoveSlug(e.target.value);
								}}
								placeholder="page-name"
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										confirmMove().catch((err: unknown) => {
											console.error('Move failed:', err);
										});
									}
								}}
							/>
							<p className="text-xs text-muted-foreground">→ {previewPath}</p>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setMoveOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								confirmMove().catch((err: unknown) => {
									console.error('Move failed:', err);
								});
							}}
						>
							Move
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete dialog */}
			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete "{deleteTitle}"?</DialogTitle>
						<DialogDescription>
							This will permanently delete{' '}
							<code className="font-mono">{deleteTarget}</code> and commit the change
							to git. This cannot be undone from the UI.
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
								confirmDelete().catch((err: unknown) => {
									console.error('Delete failed:', err);
								});
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);

	return { openMove, openDelete, dialogs };
}
