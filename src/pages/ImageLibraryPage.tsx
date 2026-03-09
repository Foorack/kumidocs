import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { DeleteRegular, DismissRegular } from '@fluentui/react-icons';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { useUser } from '@/store/user';

interface ImageEntry {
	filename: string;
	path: string;
	url: string;
	size: number;
	usedIn: string[];
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return String(bytes) + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Image Detail Panel ────────────────────────────────────────────────────────

function ImageDetailPanel({
	image,
	onDeleted,
}: {
	image: ImageEntry;
	onDeleted: () => void;
}) {
	const navigate = useNavigate();
	const { user } = useUser();
	const [confirmOpen, setConfirmOpen] = useState(false);

	const handleDelete = useCallback(async () => {
		const res = await fetch(`/api/images/${encodeURIComponent(image.filename)}`, {
			method: 'DELETE',
		});
		setConfirmOpen(false);
		if (res.ok) {
			toast.success('Image deleted');
			onDeleted();
			void navigate('/images', { replace: true });
		} else {
			const err = (await res.json().catch(() => ({ error: 'Delete failed' }))) as {
				error: string;
				usedIn?: string[];
			};
			if (err.usedIn && err.usedIn.length > 0) {
				toast.error(`In use by: ${err.usedIn.join(', ')}`);
			} else {
				toast.error(err.error);
			}
		}
	}, [image.filename, onDeleted, navigate]);

	return (
		<div className="w-72 shrink-0 border-l border-border bg-background flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center gap-2 px-4 py-3 border-b border-border">
				<span className="flex-1 text-sm font-medium truncate" title={image.filename}>
					{image.filename}
				</span>
				<Link to="/images" replace>
					<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
						<DismissRegular className="w-4 h-4" />
					</Button>
				</Link>
			</div>

			{/* Preview */}
			<div className="p-4 border-b border-border flex justify-center bg-muted/30">
				<img
					src={image.url}
					alt={image.filename}
					className="max-w-full max-h-48 object-contain rounded"
				/>
			</div>

			{/* Metadata */}
			<div className="px-4 py-3 space-y-3 flex-1 overflow-y-auto text-sm">
				<div>
					<p className="text-xs text-muted-foreground mb-0.5">Size</p>
					<p>{formatBytes(image.size)}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground mb-1">Used in</p>
					{image.usedIn.length === 0 ? (
						<p className="text-muted-foreground italic">Not used in any page</p>
					) : (
						<ul className="space-y-1">
							{image.usedIn.map((p) => (
								<li key={p}>
									<Link
										to={`/p/${p}`}
										className="text-primary hover:underline text-xs break-all"
									>
										{p}
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
				<div>
					<p className="text-xs text-muted-foreground mb-0.5">Direct URL</p>
					<code className="text-xs break-all bg-muted px-1 py-0.5 rounded">
						{image.url}
					</code>
				</div>
			</div>

			{/* Actions */}
			{user?.canEdit && (
				<div className="px-4 py-3 border-t border-border">
					<Button
						variant="destructive"
						size="sm"
						className="w-full gap-1.5"
						disabled={image.usedIn.length > 0}
						title={
							image.usedIn.length > 0
								? 'Cannot delete — image is still in use'
								: 'Delete image'
						}
						onClick={() => {
							setConfirmOpen(true);
						}}
					>
						<DeleteRegular className="w-4 h-4" />
						Delete
					</Button>

					<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete image?</DialogTitle>
								<DialogDescription>
									This will permanently delete{' '}
									<strong>{image.filename}</strong> from the repository. This
									action cannot be undone.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button
									variant="outline"
									onClick={() => {
										setConfirmOpen(false);
									}}
								>
									Cancel
								</Button>
								<Button
									variant="destructive"
									onClick={() => void handleDelete()}
								>
									Delete
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			)}
		</div>
	);
}

// ── Image Library Page ────────────────────────────────────────────────────────

export default function ImageLibraryPage() {
	const { filename } = useParams<{ filename?: string }>();
	const navigate = useNavigate();
	const [images, setImages] = useState<ImageEntry[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchImages = useCallback(() => {
		fetch('/api/images')
			.then((r) => r.json() as Promise<ImageEntry[]>)
			.then((data) => {
				setImages(data);
				setLoading(false);
			})
			.catch(() => {
				toast.error('Failed to load images');
				setLoading(false);
			});
	}, []);

	useEffect(() => {
		fetchImages();
	}, [fetchImages]);

	const selectedImage = filename ? images.find((img) => img.filename === filename) : undefined;

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
				<h1 className="text-xl font-semibold flex-1">Image Library</h1>
				<span className="text-sm text-muted-foreground">
					{images.length} {images.length === 1 ? 'image' : 'images'}
				</span>
			</div>

			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Grid */}
				<div className="flex-1 overflow-y-auto p-6">
					{loading ? (
						<div className="text-sm text-muted-foreground">Loading…</div>
					) : images.length === 0 ? (
						<div className="text-sm text-muted-foreground">
							No images yet. Drag an image into the editor or use the toolbar button
							to upload one.
						</div>
					) : (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
							{images.map((img) => (
								<button
									key={img.filename}
									className={`group relative rounded-lg border overflow-hidden text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
										filename === img.filename
											? 'border-primary ring-1 ring-primary'
											: 'border-border hover:border-primary/60'
									}`}
									onClick={() => {
										void navigate(
											filename === img.filename
												? '/images'
												: `/images/${encodeURIComponent(img.filename)}`,
											{ replace: true },
										);
									}}
								>
									{/* Thumbnail */}
									<div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
										<img
											src={img.url}
											alt={img.filename}
											className="w-full h-full object-cover"
											loading="lazy"
										/>
									</div>

									{/* Footer */}
									<div className="px-2 py-1.5 bg-background">
										<p
											className="text-xs font-mono truncate text-foreground"
											title={img.filename}
										>
											{img.filename}
										</p>
										<div className="flex items-center gap-1 mt-0.5">
											<span className="text-xs text-muted-foreground">
												{formatBytes(img.size)}
											</span>
											{img.usedIn.length > 0 && (
												<Badge
													variant="secondary"
													className="text-xs px-1 py-0 h-4"
												>
													{img.usedIn.length}
												</Badge>
											)}
										</div>
									</div>
								</button>
							))}
						</div>
					)}
				</div>

				{/* Detail panel */}
				{selectedImage && (
					<ImageDetailPanel image={selectedImage} onDeleted={fetchImages} />
				)}
			</div>
		</div>
	);
}
