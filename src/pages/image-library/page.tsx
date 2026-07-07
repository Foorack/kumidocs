import { ApiError, deleteImage, getImages } from "@/lib/api";
import { Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImageEntry } from "@/lib/api";
import type { ReactNode } from "react";
import { toast } from "@/components/ui/toaster";
import useMountEffect from "@/hooks/use-mount-effect";
import { useUser } from "@/store/user";

interface OutletCtx {
  instanceName: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Image Detail Panel

function ImageDetailPanel({
  image,
  onDeleted,
}: {
  image: ImageEntry;
  onDeleted: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const { user } = useUser();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const handleDelete = useCallback(async () => {
    setConfirmOpen(false);
    setDeleteError(undefined);
    try {
      await deleteImage(image.filename);
      toast.success("Image deleted");
      onDeleted();
      void navigate("/i", { replace: true });
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const body = error.body as { error?: string; usedIn?: string[] } | undefined;
        if (body?.usedIn && body.usedIn.length > 0) {
          setDeleteError(`In use by: ${body.usedIn.join(", ")}`);
        } else {
          setDeleteError(body?.error ?? "Delete failed");
        }
      } else {
        setDeleteError("Delete failed");
      }
    }
  }, [image.filename, onDeleted, navigate]);

  return (
    <div className="w-72 border-l border-border bg-background flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="flex-1 text-sm font-medium truncate" title={image.filename}>
          {image.filename}
        </span>
        <Link to="/i" replace>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <X className="w-4 h-4" />
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
          <p className="text-xs text-muted-foreground mb-0.5">Direct URL</p>
          <code className="text-xs break-all bg-muted px-1 py-0.5 rounded">{image.url}</code>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Used in</p>
          {image.usedIn.length === 0 ? (
            <p className="text-foreground italic">Not used in any page</p>
          ) : (
            <ul className="space-y-1">
              {image.usedIn.map((pagePath) => (
                <li key={pagePath}>
                  <Link
                    to={`/p/${pagePath}`}
                    className="text-primary hover:underline text-xs break-all"
                  >
                    {pagePath}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Delete error banner */}
      {deleteError !== undefined && deleteError !== "" && (
        <div className="px-4 py-2 bg-red/20 border-t border-red/30">
          <p className="text-red">{deleteError}</p>
        </div>
      )}

      {/* Actions */}
      {user?.canEdit === true && (
        <div className="px-4 py-3 border-t border-border">
          {image.usedIn.length > 0 && (
            <p className="text-destructive mb-2">
              Cannot delete: referenced by {image.usedIn.length}{" "}
              {image.usedIn.length === 1 ? "page" : "pages"}. Remove all references first.
            </p>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="w-full gap-1.5"
            disabled={image.usedIn.length > 0}
            title={
              image.usedIn.length > 0 ? "Cannot delete: image is still in use" : "Delete image"
            }
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete image?</DialogTitle>
                <DialogDescription>
                  This will permanently delete <strong>{image.filename}</strong> from the
                  repository. This action cannot be undone.
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
                <Button variant="destructive" onClick={() => void handleDelete()}>
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

// Image Library Page

export default function ImageLibraryPage(): JSX.Element {
  const { filename } = useParams<{ filename?: string }>();
  const navigate = useNavigate();
  const { instanceName } = useOutletContext<OutletCtx>();
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageLoadError, setImageLoadError] = useState<string | undefined>();

  useMountEffect(() => {
    document.title = `Image Library | ${instanceName}`;
  });

  const fetchImages = useCallback(async () => {
    setImageLoadError(undefined);
    try {
      const data = await getImages();
      setImages(data);
      setLoading(false);
    } catch {
      setImageLoadError("Failed to load images");
      setLoading(false);
    }
  }, []);

  useMountEffect(() => {
    void fetchImages();
  });

  const selectedImage =
    filename !== undefined && filename !== ""
      ? images.find((img) => img.filename === filename)
      : undefined;

  let imageGridContent: ReactNode;
  if (loading) {
    imageGridContent = <div className="text-sm text-muted-foreground">Loading…</div>;
  } else if (images.length === 0) {
    imageGridContent = (
      <div className="text-sm text-muted-foreground">
        No images yet. Drag an image into the editor or use the toolbar button to upload one.
      </div>
    );
  } else {
    imageGridContent = (
      <div className="grid grid-cols-[repeat(auto-fill,160px)] gap-4">
        {images.map((img) => (
          <button
            key={img.filename}
            className={`group relative rounded-lg border overflow-hidden text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filename === img.filename
                ? "border-primary ring-1 ring-primary"
                : "border-border hover:border-primary/60"
            }`}
            onClick={() => {
              void navigate(
                filename === img.filename ? "/i" : `/i/${encodeURIComponent(img.filename)}`,
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
              <p className="text-xs font-mono truncate text-foreground" title={img.filename}>
                {img.filename}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground">{formatBytes(img.size)}</span>
                {img.usedIn.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                    {img.usedIn.length}
                  </Badge>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold flex-1">Image Library</h1>
        <span className="text-sm text-muted-foreground">
          {images.length} {images.length === 1 ? "image" : "images"}
        </span>
      </div>

      {/* Error banner */}
      {imageLoadError !== undefined && imageLoadError !== "" && (
        <div className="bg-red/20 border-b border-red/30 px-4 py-2 flex items-center gap-2 text-red shrink-0">
          <span className="flex-1">{imageLoadError}</span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Grid */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">{imageGridContent}</div>

        {/* Detail panel */}
        <div className={`shrink-0 overflow-hidden ${selectedImage ? "w-72" : "hidden"}`}>
          {selectedImage && <ImageDetailPanel image={selectedImage} onDeleted={fetchImages} />}
        </div>
      </div>
    </div>
  );
}
