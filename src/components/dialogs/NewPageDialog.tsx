import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';

interface NewPageDialogProps {
	open: boolean;
	onClose: () => void;
	/** When set, the new page is placed under this directory (e.g. "docs/api"). */
	parentDir?: string;
	onCreated?: () => void;
}

type PageType = 'markdown' | 'slides';

function slugify(title: string): string {
	return title
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-_]/g, '')
		.replace(/--+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function NewPageDialog({ open, onClose, parentDir, onCreated }: NewPageDialogProps) {
	const navigate = useNavigate();

	const [title, setTitle] = useState('');
	const [slug, setSlug] = useState('');
	const [slugEdited, setSlugEdited] = useState(false);
	const [pageType, setPageType] = useState<PageType>('markdown');
	const [creating, setCreating] = useState(false);

	// Auto-derive slug from title unless user has manually edited it (derived state, no effect needed)
	const effectiveSlug = slugEdited ? slug : slugify(title);

	const finalPath = effectiveSlug ? `${parentDir ? parentDir + '/' : ''}${effectiveSlug}.md` : '';

	const handleCreate = useCallback(async () => {
		const resolvedSlug = slugEdited ? slug : slugify(title);
		if (!title.trim() || !resolvedSlug) return;
		setCreating(true);

		const marpHeader = pageType === 'slides' ? '---\nmarp: true\n---\n\n' : '';
		const stub = `${marpHeader}# ${title.trim()}\n`;

		const res = await fetch('/api/file', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: finalPath, content: stub }),
		});

		setCreating(false);

		if (res.ok) {
			toast.success('Page created');
			onCreated?.();
			onClose();
			navigate(`/p/${finalPath}`)?.catch((err: unknown) => {
				console.error('Navigation failed:', err);
			});
		} else if (res.status === 409) {
			toast.error('A page at that path already exists.');
		} else {
			toast.error('Failed to create page');
		}
	}, [title, slug, slugEdited, pageType, finalPath, navigate, onCreated, onClose]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !creating && title.trim() && effectiveSlug) {
			handleCreate().catch((err: unknown) => {
				console.error('Failed to create page:', err);
			});
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (v) {
					setTitle('');
					setSlug('');
					setSlugEdited(false);
					setPageType('markdown');
					setCreating(false);
				} else {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
				<DialogHeader>
					<DialogTitle>New page</DialogTitle>
					<DialogDescription>
						{parentDir
							? `Create a sub-page under "${parentDir}"`
							: 'Create a new page at the root of the repository'}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-1">
					{/* Page type selector */}
					<div className="grid gap-1.5">
						<Label>Type</Label>
						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant={pageType === 'markdown' ? 'default' : 'outline'}
								className="flex-1 h-8 text-xs"
								onClick={() => {
									setPageType('markdown');
								}}
							>
								📄 Markdown
							</Button>
							<Button
								type="button"
								size="sm"
								variant={pageType === 'slides' ? 'default' : 'outline'}
								className="flex-1 h-8 text-xs"
								onClick={() => {
									setPageType('slides');
								}}
							>
								🎞 Marp Slides
							</Button>
						</div>
					</div>

					{/* Title */}
					<div className="grid gap-1.5">
						<Label htmlFor="np-title">Title</Label>
						<Input
							id="np-title"
							autoFocus
							value={title}
							onChange={(e) => {
								setTitle(e.target.value);
							}}
							placeholder="My new page"
						/>
					</div>

					{/* Slug (editable) */}
					<div className="grid gap-1.5">
						<Label htmlFor="np-slug">Filename slug</Label>
						<Input
							id="np-slug"
							value={effectiveSlug}
							onChange={(e) => {
								setSlug(e.target.value);
								setSlugEdited(e.target.value !== '');
							}}
							placeholder="my-new-page"
						/>
					</div>

					{/* Path preview */}
					{finalPath && (
						<p className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1.5 truncate">
							{finalPath}
						</p>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={creating}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							handleCreate().catch((err: unknown) => {
								console.error('Failed to create page:', err);
							});
						}}
						disabled={creating || !title.trim() || !effectiveSlug}
					>
						{creating ? 'Creating…' : 'Create'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
