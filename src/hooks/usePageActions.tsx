import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../components/ui/select';

// Sentinel used in the Select so we never pass value="" to SelectItem (Radix throws)
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
	const [moveDirs, setMoveDirs] = useState<string[]>([]);

	const openMove = useCallback(async (filePath: string) => {
		const parts = filePath.replace(/\.md$/, '').split('/');
		const slug = parts.pop() ?? '';
		const parent = parts.join('/');
		setMoveFrom(filePath);
		setMoveSlug(slug);
		setMoveParent(parent || ROOT);
		try {
			const res = await fetch('/api/tree');
			const entries = (await res.json()) as { path: string; type: string }[];
			const dirs = new Set<string>();
			entries.forEach(({ path, type }) => {
				if (type === 'dir') {
					dirs.add(path);
				} else {
					const segs = path.split('/');
					for (let i = 1; i < segs.length; i++) {
						dirs.add(segs.slice(0, i).join('/'));
					}
				}
			});
			setMoveDirs(Array.from(dirs).sort());
		} catch {
			setMoveDirs([]);
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
							<Select value={moveParent} onValueChange={setMoveParent}>
								<SelectTrigger>
									<SelectValue placeholder="(root)" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ROOT}>(root)</SelectItem>
									{moveDirs.map((dir) => (
										<SelectItem key={dir} value={dir}>
											{dir}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
