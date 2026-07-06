import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import Textarea from "@/components/ui/textarea";
import { createFile, getTree } from "@/lib/api";
import { ticketToYaml } from "@/lib/board";
import { toast } from "@/components/ui/toaster";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface NewTicketDialogProps {
  open: boolean;
  onClose: () => void;
  /** All known boards: slug -> display name. */
  boards: Map<string, string>;
  /** Board to preselect in the dropdown. */
  initialBoardSlug?: string;
  onCreated?: () => void;
}

export default function NewTicketDialog({
  open,
  onClose,
  boards,
  initialBoardSlug,
  onCreated,
}: NewTicketDialogProps): JSX.Element {
  const navigate = useNavigate();
  const [boardSlug, setBoardSlug] = useState(initialBoardSlug ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset form when dialog opens with fresh initialBoardSlug
  const prevOpenRef = useRef(false);
  if (open && !prevOpenRef.current) {
    prevOpenRef.current = true;
    setBoardSlug(initialBoardSlug ?? "");
    setTitle("");
    setBody("");
    setCreating(false);
  }
  if (!open) {
    prevOpenRef.current = false;
  }

  const boardNames = [...boards.entries()].toSorted(([, nameA], [, nameB]) =>
    nameA.localeCompare(nameB),
  );

  const handleCreate = useCallback(async () => {
    const slug = boardSlug.trim();
    if (!slug || !title.trim()) {
      return;
    }
    setCreating(true);
    try {
      // Find the next available ticket ID
      const tree = await getTree();
      const boardDir = tree.find((node) => node.type === "dir" && node.name === slug);
      const existingIds: number[] = [];
      if (boardDir?.children !== undefined) {
        for (const child of boardDir.children) {
          if (child.type !== "file" || !child.path.endsWith(".yaml")) {
            continue;
          }
          const basename = child.name.replace(/\.yaml$/u, "");
          const num = Number(basename);
          if (!Number.isNaN(num)) {
            existingIds.push(num);
          }
        }
      }
      const nextId = existingIds.length > 0 ? String(Math.max(...existingIds) + 1) : "1";

      const path = `${slug}/${nextId}.yaml`;
      const yaml = ticketToYaml({
        body: body.trim(),
        column: "",
        title: title.trim(),
      });
      await createFile(path, yaml);

      toast.success("Ticket created");
      onCreated?.();
      onClose();
      void navigate(`/b/${slug}/${nextId}`);
    } catch {
      toast.error("Failed to create ticket");
    } finally {
      setCreating(false);
    }
  }, [boardSlug, title, body, navigate, onCreated, onClose]);

  const handleKeyDown = async (ev: React.KeyboardEvent): Promise<void> => {
    if (ev.key === "Enter" && !creating && boardSlug.trim() && title.trim()) {
      await handleCreate();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>Create a new ticket in a board.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* Board selector */}
          <div className="grid gap-1.5">
            <Label htmlFor="nt-board">Board</Label>
            <select
              id="nt-board"
              value={boardSlug}
              onChange={(ev) => {
                setBoardSlug(ev.target.value);
              }}
              className="h-9 text-sm rounded-md border border-input bg-transparent text-foreground px-3"
            >
              {boardNames.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div className="grid gap-1.5">
            <Label htmlFor="nt-title">Title</Label>
            <Input
              id="nt-title"
              autoFocus
              value={title}
              onChange={(ev) => {
                setTitle(ev.target.value);
              }}
              placeholder="What needs to be done?"
            />
          </div>

          {/* Body / description */}
          <div className="grid gap-1.5">
            <Label htmlFor="nt-body">Description (optional)</Label>
            <Textarea
              id="nt-body"
              value={body}
              onChange={(ev) => {
                setBody(ev.target.value);
              }}
              placeholder="Add details about this ticket..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating || !boardSlug.trim() || !title.trim()}
          >
            {creating ? "Creating..." : "Create ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
