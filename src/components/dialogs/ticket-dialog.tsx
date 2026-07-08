// oxlint-disable complexity
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import { Copy } from "lucide-react";
import { createFile, getFile, getTree, putFile } from "@/lib/api";
import { displayColumnId, parseTicketYaml, ticketToYaml } from "@/lib/board";
import type { BoardColumn } from "@/lib/board";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toaster";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/store/user";
import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";
import MarkdownToolbar from "@/components/editor/markdown/toolbar";
import MarkdownViewer from "@/components/editor/markdown/viewer";
import {
  insertWrap,
  setLinePrefix,
  toggleListPrefix,
  insertLink,
  HEADING_OPTIONS,
} from "@/components/editor/markdown/editor-utils";

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
    assignee?: string;
    boardSlug: string;
    body: string;
    column: string;
    reporter?: string;
    ticketId: string;
    title: string;
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
  const { user } = useUser();
  const isEdit = ticket !== undefined;

  const [boardSlug, setBoardSlug] = useState(initialBoardSlug ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [column, setColumn] = useState("");
  const [reporter, setReporter] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // Columns for the current board
  const currentColumns = boardColumns.get(boardSlug) ?? [];
  const defaultColumnId = currentColumns.find((col) => col.default === true)?.id ?? "";

  // Reset form when dialog opens
  const prevOpenRef = useRef(false);
  if (open && !prevOpenRef.current) {
    prevOpenRef.current = true;
    if (ticket) {
      setBoardSlug(ticket.boardSlug);
      setTitle(ticket.title);
      setBody(ticket.body);
      setColumn(ticket.column);
      setReporter(ticket.reporter ?? "");
      setAssignee(ticket.assignee ?? "");
      setEditing(false);
    } else {
      setBoardSlug(initialBoardSlug ?? "");
      setTitle("");
      setBody("");
      setColumn(defaultColumnId);
      setReporter(user?.email ?? user?.name ?? "");
      setAssignee("");
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
        const data = await parseTicketYaml(
          resp.content,
          ticket.boardSlug,
          ticket.ticketId,
          defaultColumnId,
        );
        setTitle(data.title);
        setReporter(data.reporter ?? "");
        setAssignee(data.assignee ?? "");
        // Parse body from raw YAML (TicketData doesn't carry body)
        const { load } = await import("js-yaml");
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const parsed = load(resp.content) as Record<string, unknown>;
        setBody(typeof parsed.body === "string" ? parsed.body : "");
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

  const activeColumn = column === "" ? defaultColumnId : column;
  const columnColor = currentColumns.find((col) => col.id === activeColumn)?.color ?? "#6b7280";
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
          assignee: assignee.trim() || undefined,
          body: body.trim(),
          column,
          reporter: reporter.trim() || undefined,
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
        assignee: assignee.trim() || undefined,
        body: body.trim(),
        column,
        reporter: reporter.trim() || undefined,
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
  }, [
    assignee,
    boardSlug,
    title,
    body,
    column,
    isEdit,
    ticket,
    navigate,
    onCreated,
    onClose,
    onSaved,
    reporter,
  ]);

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
      className="text-lg font-bold h-auto py-2 px-3"
    />
  ) : (
    <h1 className="text-lg font-bold text-foreground px-0.5">{title}</h1>
  );

  const canSave =
    !saving &&
    title.trim() !== "" &&
    (!isEdit ||
      title !== ticket.title ||
      body !== ticket.body ||
      column !== ticket.column ||
      assignee !== (ticket.assignee ?? ""));

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [headingValue, setHeadingValue] = useState("normal");

  const saveBodySelection = useCallback((): void => {
    bodyRef.current?.focus();
  }, []);

  const handleBodyBold = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    insertWrap(ta, "**", "**");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyItalic = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    insertWrap(ta, "*", "*");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyStrikethrough = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    insertWrap(ta, "~~", "~~");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyCode = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    insertWrap(ta, "`", "`");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyHeading = useCallback((val: string): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    setHeadingValue(val);
    const prefix = HEADING_OPTIONS.find((opt) => opt.value === val)?.prefix ?? "";
    setLinePrefix(ta, prefix);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyQuote = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    setLinePrefix(ta, "> ");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyUnordered = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    toggleListPrefix(ta, "- ");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyNumbered = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    toggleListPrefix(ta, "1. ");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyTask = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    toggleListPrefix(ta, "- [ ] ");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyLink = useCallback((): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    insertLink(ta);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleBodyEmoji = useCallback((emoji: string): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.setRangeText(emoji, start, end, "preserve");
    ta.setSelectionRange(start + emoji.length, start + emoji.length);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  }, []);

  const handleBodyKeyDown = useCallback((ev: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const ta = bodyRef.current;
    if (!ta) {
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "b") {
      ev.preventDefault();
      insertWrap(ta, "**", "**");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "i") {
      ev.preventDefault();
      insertWrap(ta, "*", "*");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bodyContent = editing ? (
    <div className="flex flex-col min-h-[300px] border rounded-md overflow-hidden">
      <MarkdownToolbar
        editorOnly
        disabled={false}
        headingValue={headingValue}
        showPreview={false}
        handleHeading={handleBodyHeading}
        handleBold={handleBodyBold}
        handleEmoji={handleBodyEmoji}
        handleItalic={handleBodyItalic}
        handleStrikethrough={handleBodyStrikethrough}
        handleCode={handleBodyCode}
        handleLink={handleBodyLink}
        handleQuote={handleBodyQuote}
        handleUnordered={handleBodyUnordered}
        handleNumbered={handleBodyNumbered}
        handleTask={handleBodyTask}
        fileInputRef={fileInputRef}
        handlePropsOpen={(_open: boolean): void => {
          /* no props dialog in ticket editor */
        }}
        setShowPreview={(_val: boolean | ((prev: boolean) => boolean)): void => {
          /* no preview toggle in ticket editor */
        }}
      />
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(ev) => {
          setBody(ev.target.value);
        }}
        onKeyDown={handleBodyKeyDown}
        onSelect={saveBodySelection}
        onClick={saveBodySelection}
        placeholder="Add description..."
        className="flex-1 p-3 resize-none outline-none font-mono text-sm leading-relaxed min-h-[260px]"
      />
    </div>
  ) : (
    <div className="border rounded-md overflow-hidden">
      <MarkdownViewer value={body || "*No description.*"} />
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
        className="sm:max-w-5xl p-0 gap-0 border-5"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        style={{ borderColor: columnColor }}
      >
        {/* Top bar */}
        <div
          className="flex items-center gap-3 border-b"
          style={{ borderColor: columnColor, marginTop: "-1px" }}
        >
          <div
            className="flex items-center ps-3 pe-5 h-full"
            style={{
              backgroundColor: columnColor,
              outline: `1px solid ${columnColor}`,
            }}
          >
            <span className="font-bold text-background">
              {isEdit ? (
                <>
                  <span>{boards.get(boardSlug) ?? ""}</span>
                  <span className="px-3"> | </span>
                  <span className="inline-flex items-center gap-1">
                    {ticket.boardSlug.toUpperCase()}-{ticket.ticketId}
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${ticket.boardSlug.toUpperCase()}-${ticket.ticketId}`,
                        );
                        toast.success(
                          `Copied ${ticket.boardSlug.toUpperCase()}-${ticket.ticketId}`,
                        );
                      }}
                      className="ms-3 opacity-80 hover:opacity-60"
                      title="Copy ticket number"
                      tabIndex={-1}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </span>
                </>
              ) : (
                <span>New ticket</span>
              )}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-end gap-0">
            <Button
              variant="ghost"
              className="rounded-none px-7 hover:bg-transparent items-end"
              onClick={onClose}
            >
              <span className="leading-[1.2]">Cancel</span>
              <Kbd>Esc</Kbd>
            </Button>
            {showEditControls ? (
              <Button
                className="rounded-none px-7 text-background items-end"
                onClick={handleSave}
                disabled={!canSave}
                style={{ backgroundColor: columnColor }}
              >
                <span className="leading-[1.2]">{buttonLabel}</span>
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>S</Kbd>
                </KbdGroup>
              </Button>
            ) : (
              <Button
                className="rounded-none px-7 text-background items-end"
                onClick={() => {
                  setEditing(true);
                }}
                style={{ backgroundColor: columnColor }}
              >
                <span className="leading-[1.2]">{buttonLabel}</span>
                <Kbd>E</Kbd>
              </Button>
            )}
          </div>
        </div>

        {/* Body: main content + status sidebar */}
        <div className="flex gap-0 min-h-120">
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

            {/* Reporter + Assignee row */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground shrink-0">Reporter:</span>
                <span className="flex items-center gap-3 text-foreground">
                  {reporter === "" ? (
                    "Unknown"
                  ) : (
                    <>
                      <UserAvatar name={emailToDisplayName(reporter)} email={reporter} size="xs" />
                      {emailToDisplayName(reporter)}
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground shrink-0">Assignee:</span>
                {showEditControls ? (
                  <div className="flex items-center gap-3">
                    {assignee !== "" && (
                      <UserAvatar name={emailToDisplayName(assignee)} email={assignee} size="xs" />
                    )}
                    <input
                      value={assignee}
                      onChange={(ev) => {
                        setAssignee(ev.target.value);
                      }}
                      placeholder="Unassigned"
                      className="h-7 w-40 rounded border border-input bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAssignee(user?.email ?? user?.name ?? "");
                      }}
                      className="ms-3 text-primary hover:text-foreground underline underline-offset-2 whitespace-nowrap"
                    >
                      Assign to me
                    </button>
                  </div>
                ) : (
                  <span className="flex items-center gap-3 text-foreground">
                    {assignee === "" ? (
                      "Unassigned"
                    ) : (
                      <>
                        <UserAvatar
                          name={emailToDisplayName(assignee)}
                          email={assignee}
                          size="xs"
                        />
                        {emailToDisplayName(assignee)}
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {bodyContent}
          </div>

          {/* Right: status sidebar */}
          <div
            className="w-52 shrink-0 border-l p-3 space-y-2"
            style={{ borderColor: columnColor }}
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide select-none">Status</h3>
            <div className="space-y-0.5">
              {currentColumns.length === 0 && <p>No columns</p>}
              {(showEditControls
                ? currentColumns
                : currentColumns.filter((col) => col.id === activeColumn)
              ).map((col) => {
                const isActive = activeColumn === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      setColumn(col.id);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-[3px] rounded text-sm transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:text-foreground hover:bg-accent/50"
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
