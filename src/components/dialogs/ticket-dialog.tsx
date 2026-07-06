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
import { createFile, getFile, getTree, putFile } from "@/lib/api";
import { parseTicketYaml, ticketToYaml } from "@/lib/board";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toaster";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface TicketDialogProps {
  open: boolean;
  onClose: () => void;
  /** All known boards: slug -> display name. Used in create mode. */
  boards: Map<string, string>;
  /** Board to preselect in create mode. */
  initialBoardSlug?: string;
  /** When set, dialog opens in edit mode with existing ticket data. */
  ticket?: {
    boardSlug: string;
    ticketId: string;
    title: string;
    body: string;
    column: string;
  };
  onCreated?: () => void;
  onSaved?: () => void;
}

export default function TicketDialog({
  open,
  onClose,
  boards,
  initialBoardSlug,
  ticket,
  onCreated,
  onSaved,
}: TicketDialogProps): JSX.Element {
  const navigate = useNavigate();
  const isEdit = ticket !== undefined;

  const [boardSlug, setBoardSlug] = useState(initialBoardSlug ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [column, setColumn] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  const prevOpenRef = useRef(false);
  if (open && !prevOpenRef.current) {
    prevOpenRef.current = true;
    if (ticket) {
      setBoardSlug(ticket.boardSlug);
      setTitle(ticket.title);
      setBody(ticket.body);
      setColumn(ticket.column);
    } else {
      setBoardSlug(initialBoardSlug ?? "");
      setTitle("");
      setBody("");
      setColumn("");
    }
    setSaving(false);
  }
  if (!open) {
    prevOpenRef.current = false;
  }

  // Reload ticket content when dialog opens in edit mode (catches external changes)
  useEffect(() => {
    if (!open || !ticket) {
      return;
    }
    const reload = async (): Promise<void> => {
      try {
        const resp = await getFile(`${ticket.boardSlug}/${ticket.ticketId}.yaml`);
        const data = await parseTicketYaml(resp.content, ticket.boardSlug, ticket.ticketId);
        setTitle(data.title);
        setBody("");
        setColumn(data.column);
      } catch {
        // keep current values
      }
    };
    void reload();
    // Only re-fetch when dialog opens
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const boardNames = [...boards.entries()].toSorted(([, nameA], [, nameB]) =>
    nameA.localeCompare(nameB),
  );

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      return;
    }

    if (isEdit) {
      // --- Edit mode: save to existing file ---
      setSaving(true);
      try {
        const path = `${ticket.boardSlug}/${ticket.ticketId}.yaml`;
        const yaml = ticketToYaml({
          body: body.trim(),
          column,
          title: title.trim(),
        });
        await putFile(path, yaml);
        toast.success("Ticket saved");
        onSaved?.();
        onClose();
      } catch {
        toast.error("Failed to save ticket");
      } finally {
        setSaving(false);
      }
      return;
    }

    // --- Create mode: find next ID and create ---
    const slug = boardSlug.trim();
    if (!slug) {
      return;
    }
    setSaving(true);
    try {
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
      setSaving(false);
    }
  }, [boardSlug, title, body, column, isEdit, ticket, navigate, onCreated, onClose, onSaved]);

  const handleKeyDown = async (ev: React.KeyboardEvent): Promise<void> => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter" && !saving && title.trim()) {
      ev.preventDefault();
      await handleSave();
    }
  };

  const buttonLabel = ((): string => {
    if (saving) {
      return isEdit ? "Saving..." : "Creating...";
    }
    return isEdit ? "Save" : "Create ticket";
  })();

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
          <DialogTitle>{isEdit ? "Edit ticket" : "New ticket"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Editing ${ticket.boardSlug.toUpperCase()}-${ticket.ticketId}`
              : "Create a new ticket in a board."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* Board selector (create only) */}
          {!isEdit && (
            <div className="grid gap-1.5">
              <Label htmlFor="td-board">Board</Label>
              <select
                id="td-board"
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
          )}

          {/* Read-only board display (edit mode) */}
          {isEdit && (
            <div className="grid gap-1.5">
              <Label>Board</Label>
              <p className="h-9 text-sm flex items-center px-3 rounded-md border border-input bg-muted/50 text-muted-foreground">
                {boards.get(ticket.boardSlug) ?? ticket.boardSlug}
              </p>
            </div>
          )}

          {/* Title */}
          <div className="grid gap-1.5">
            <Label htmlFor="td-title">Title</Label>
            <Input
              id="td-title"
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
            <Label htmlFor="td-body">Description</Label>
            <Textarea
              id="td-body"
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
            <Kbd>Esc</Kbd>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !title.trim() || (!isEdit && !boardSlug.trim())}
          >
            {buttonLabel}
            <Kbd>Ctrl+Enter</Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
