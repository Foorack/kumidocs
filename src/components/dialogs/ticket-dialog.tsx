// oxlint-disable complexity
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import { createFile, getFile, getTree, putFile } from "@/lib/api";
import { displayColumnId, parseTicketYaml, ticketToYaml } from "@/lib/board";
import type { BoardColumn } from "@/lib/board";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toaster";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { COMPONENTS_DOC, REHYPE_PLUGINS } from "@/components/editor/markdown/streamdown-components";

interface TicketDialogProps {
  open: boolean;
  onClose: () => void;
  /** All known boards: slug -> display name. Used in create mode. */
  boards: Map<string, string>;
  /** Columns for each board: slug -> column definitions. */
  boardColumns: Map<string, BoardColumn[]>;
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
  boardColumns,
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
  const [editing, setEditing] = useState(false);

  // Reset form when dialog opens
  const prevOpenRef = useRef(false);
  if (open && !prevOpenRef.current) {
    prevOpenRef.current = true;
    if (ticket) {
      setBoardSlug(ticket.boardSlug);
      setTitle(ticket.title);
      setBody(ticket.body);
      setColumn(ticket.column);
      setEditing(false);
    } else {
      setBoardSlug(initialBoardSlug ?? "");
      setTitle("");
      setBody("");
      setColumn("");
      setEditing(true);
    }
    setSaving(false);
  }
  if (!open) {
    prevOpenRef.current = false;
  }

  // Reload ticket content when dialog opens in edit mode
  useEffect(() => {
    if (!open || !ticket) {
      return;
    }
    const reload = async (): Promise<void> => {
      try {
        const resp = await getFile(`${ticket.boardSlug}/${ticket.ticketId}.yaml`);
        const data = await parseTicketYaml(resp.content, ticket.boardSlug, ticket.ticketId);
        setTitle(data.title);
        // Parse body from raw YAML (TicketData doesn't carry body)
        const { load } = await import("js-yaml");
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const parsed = load(resp.content) as Record<string, unknown> | null;
        setBody(typeof parsed?.body === "string" ? parsed.body : "");
        setColumn(data.column);
      } catch {
        // keep current values
      }
    };
    void reload();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const boardNames = [...boards.entries()].toSorted(([, nameA], [, nameB]) =>
    nameA.localeCompare(nameB),
  );

  // Columns for the current board
  const currentColumns = boardColumns.get(boardSlug) ?? [];
  const columnColor =
    currentColumns.find((col) => col.id === column)?.color ??
    currentColumns.find((col) => col.default === true)?.color ??
    "#6b7280";
  const showEditControls = editing || !isEdit;

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      return;
    }

    if (isEdit) {
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
    const wantsEdit = ev.key === "e" && !editing && isEdit;
    const wantsSave =
      (ev.ctrlKey || ev.metaKey) &&
      (ev.key === "Enter" || ev.key === "s") &&
      editing &&
      !saving &&
      title.trim() !== "";
    if (wantsEdit) {
      ev.preventDefault();
      setEditing(true);
    }
    if (wantsSave) {
      ev.preventDefault();
      await handleSave();
    }
  };

  const buttonLabel = ((): string => {
    if (!editing && isEdit) {
      return "Edit";
    }
    if (saving && isEdit) {
      return "Saving...";
    }
    if (saving) {
      return "Creating...";
    }
    if (isEdit) {
      return "Save";
    }
    return "Create";
  })();

  const titleContent = editing ? (
    <Input
      autoFocus
      value={title}
      onChange={(ev) => {
        setTitle(ev.target.value);
      }}
      placeholder="Title"
      className="text-lg font-semibold h-auto py-2 px-3"
    />
  ) : (
    <h1 className="text-lg font-semibold text-foreground px-0.5">{title}</h1>
  );

  const canSave = !saving && title.trim() !== "";

  const bodyContent = editing ? (
    <Textarea
      value={body}
      onChange={(ev) => {
        setBody(ev.target.value);
      }}
      placeholder="Add description..."
      className="min-h-[300px] resize-y"
    />
  ) : (
    <div className="prose prose-table:my-0 prose-img:my-0 prose-pre:my-0 prose-pre:bg-transparent prose-pre:text-foreground dark:prose-invert max-w-none">
      <Streamdown
        mode="streaming"
        plugins={{ cjk, code, math, mermaid }}
        shikiTheme={["github-light", "github-dark"]}
        linkSafety={{ enabled: false }}
        components={COMPONENTS_DOC}
        rehypePlugins={REHYPE_PLUGINS}
      >
        {body || "*No description.*"}
      </Streamdown>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-3xl p-0 gap-0 border-5"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        style={{ borderColor: columnColor }}
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b" style={{ borderColor: columnColor }}>
          <div
            className="flex items-center px-5 h-full"
            style={{
              backgroundColor: columnColor,
              outline: `1px solid ${columnColor}`,
            }}
          >
            <span className="font-semibold text-base">
              {isEdit
                ? `${boards.get(boardSlug) ?? ""} | ${ticket.boardSlug.toUpperCase()}-${ticket.ticketId}`
                : "New ticket"}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
              <Kbd>Esc</Kbd>
            </Button>
            {showEditControls ? (
              <Button size="sm" onClick={handleSave} disabled={!canSave}>
                {buttonLabel}
                <Kbd>⌘S</Kbd>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {buttonLabel}
                <Kbd>E</Kbd>
              </Button>
            )}
          </div>
        </div>

        {/* Body: main content + status sidebar */}
        <div className="flex gap-0">
          {/* Left: main content */}
          <div className="flex-1 p-5 space-y-4 min-w-0">
            {/* Board selector (create only) */}
            {!isEdit && (
              <select
                value={boardSlug}
                onChange={(ev) => {
                  setBoardSlug(ev.target.value);
                  setColumn("");
                }}
                className="w-full h-9 text-sm rounded-md border border-input bg-transparent text-foreground px-3"
              >
                <option value="" disabled>
                  Select a board
                </option>
                {boardNames.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            )}

            {/* Title */}
            {titleContent}

            {/* Description */}
            {bodyContent}
          </div>

          {/* Right: status sidebar */}
          <div
            className="w-52 shrink-0 border-l p-4 space-y-3"
            style={{ borderColor: columnColor }}
          >
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Status
            </h3>
            <div className="space-y-1">
              {currentColumns.length === 0 && (
                <p className="text-xs text-muted-foreground">No columns</p>
              )}
              {(showEditControls
                ? currentColumns
                : currentColumns.filter((col) => col.id === column)
              ).map((col) => {
                const isActive = column === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      setColumn(col.id);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/10"
                      style={{ backgroundColor: col.color }}
                    />
                    <span>{displayColumnId(col.id)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
