// oxlint-disable complexity
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import { Copy, History, MessageSquare } from "lucide-react";
import { createFile, getFile, getFileDiff, getFileHistory, getTree, putFile } from "@/lib/api";
import type { DiffData } from "@/lib/api";
import { displayColumnId, parseTicketYaml, ticketToYaml } from "@/lib/board";
import type { BoardColumn, TicketComment, TicketApproval, StatusEntry } from "@/lib/board";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toaster";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/store/user";
import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import type { CommitEntry } from "@/lib/types";
import CommitDiffDialog from "@/components/layout/commit-diff-dialog";
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

function VersionControlTab({
  commits,
  commitsLoading,
  onCommitClick,
}: {
  commits: CommitEntry[];
  commitsLoading: boolean;
  onCommitClick: (sha: string) => void;
}): JSX.Element {
  if (commitsLoading) {
    return <p className="text-muted-foreground py-4 text-center">Loading...</p>;
  }
  if (commits.length === 0) {
    return <p className="text-muted-foreground py-4 text-center">No commits yet.</p>;
  }
  return (
    <div className="space-y-2">
      {commits.map((commit) => (
        <button
          key={commit.sha}
          type="button"
          onClick={() => {
            onCommitClick(commit.sha);
          }}
          className="w-full text-left flex items-start gap-2 py-1.5 border-b border-border last:border-0 hover:bg-accent/40 group transition-colors rounded"
        >
          <UserAvatar
            name={emailToDisplayName(commit.author)}
            email={commit.authorEmail}
            size="xs"
            className="shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <p className="text-foreground line-clamp-2 group-hover:underline">{commit.message}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {emailToDisplayName(commit.author)}
              </span>
              <span className="text-xs text-muted-foreground/60">{relativeTime(commit.date)}</span>
              {(commit.added ?? 0) > 0 && (
                <span className="text-xs text-green font-mono">+{commit.added}</span>
              )}
              {(commit.removed ?? 0) > 0 && (
                <span className="text-xs text-red font-mono">-{commit.removed}</span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function TicketDialog({
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
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [approvals, setApprovals] = useState<TicketApproval[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"activity" | "vc">("activity");
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffData, setDiffData] = useState<DiffData | undefined>();
  const [diffLoading, setDiffLoading] = useState(false);

  // File path for the current ticket (used for diff + git log)
  const ticketFilePath = isEdit ? `${ticket.boardSlug}/${ticket.ticketId}.yaml` : "";

  const openDiff = useCallback(
    async (sha: string): Promise<void> => {
      if (ticketFilePath === "") {
        return;
      }
      setDiffLoading(true);
      setDiffOpen(true);
      setDiffData(undefined);
      try {
        const data = await getFileDiff(ticketFilePath, sha);
        setDiffData(data);
      } catch {
        setDiffData(undefined);
      } finally {
        setDiffLoading(false);
      }
    },
    [ticketFilePath],
  );

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
      setComments([]);
      setApprovals([]);
      setStatusHistory([]);
      setCommits([]);
      setEditing(false);
    } else {
      setBoardSlug(initialBoardSlug ?? "");
      setTitle("");
      setBody("");
      setColumn(defaultColumnId);
      setReporter(user?.email ?? user?.name ?? "");
      setAssignee("");
      setComments([]);
      setApprovals([]);
      setStatusHistory([]);
      setCommits([]);
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
        setComments(data.comments ?? []);
        setApprovals(data.approvals ?? []);
        setStatusHistory(data.statusHistory ?? []);
        // Parse body from raw YAML (TicketData doesn't carry body)
        const { load } = await import("js-yaml");
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const parsed = load(resp.content) as Record<string, unknown>;
        setBody(typeof parsed.body === "string" ? parsed.body : "");
        setColumn(data.column);

        // Fetch git history for Version Control tab
        setCommitsLoading(true);
        try {
          const history = await getFileHistory(`${ticket.boardSlug}/${ticket.ticketId}.yaml`);
          setCommits(history);
        } catch {
          setCommits([]);
        } finally {
          setCommitsLoading(false);
        }
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
          approvals: approvals.length > 0 ? approvals : undefined,
          assignee: assignee.trim() || undefined,
          body: body.trim(),
          column,
          comments: comments.length > 0 ? comments : undefined,
          reporter: reporter.trim() || undefined,
          statusHistory: statusHistory.length > 0 ? statusHistory : undefined,
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
        approvals: approvals.length > 0 ? approvals : undefined,
        assignee: assignee.trim() || undefined,
        body: body.trim(),
        column,
        comments: comments.length > 0 ? comments : undefined,
        reporter: reporter.trim() || undefined,
        statusHistory: statusHistory.length > 0 ? statusHistory : undefined,
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
    approvals,
    assignee,
    boardSlug,
    title,
    body,
    column,
    comments,
    isEdit,
    ticket,
    navigate,
    onCreated,
    onClose,
    onSaved,
    reporter,
    statusHistory,
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
    <h1 className="text-lg font-bold text-foreground mb-2">{title}</h1>
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
    <>
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
                onClick={
                  editing && isEdit
                    ? () => {
                        setEditing(false);
                      }
                    : onClose
                }
              >
                <span className="leading-[1.2]">{editing && isEdit ? "Cancel" : "Close"}</span>
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
                  <span className="flex items-center gap-2 text-foreground">
                    <UserAvatar
                      name={emailToDisplayName(reporter || "Unknown")}
                      email={reporter || "Unknown"}
                      size="xs"
                    />
                    {emailToDisplayName(reporter || "Unknown")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground shrink-0">Assignee:</span>
                  <div className="flex items-center gap-2 text-foreground">
                    <UserAvatar
                      name={emailToDisplayName(assignee || "Unassigned")}
                      email={assignee || "Unassigned"}
                      size="xs"
                    />
                    {showEditControls ? (
                      <>
                        <input
                          value={assignee}
                          onChange={(ev) => {
                            setAssignee(ev.target.value);
                          }}
                          placeholder="Unassigned"
                          className="h-7 w-40 rounded border border-input bg-transparent px-2 text-sm placeholder:text-muted-foreground"
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
                      </>
                    ) : (
                      emailToDisplayName(assignee || "Unassigned")
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {bodyContent}

              {/* Activity / Version Control tabs (edit/view mode only) */}
              {isEdit && (
                <div>
                  {/* Tab headers */}
                  <div className="flex border-b border-border mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("activity");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
                        activeTab === "activity"
                          ? "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Activity
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("vc");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
                        activeTab === "vc"
                          ? "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <History className="w-4 h-4" />
                      Version Control
                    </button>
                  </div>

                  {/* Tab content */}
                  {activeTab === "activity" && (
                    <div className="space-y-4 text-sm">
                      {/* Status history */}
                      {statusHistory.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-muted-foreground mb-2">
                            Status Changes
                          </h4>
                          <div className="space-y-1.5">
                            {[...statusHistory].toReversed().map((entry, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <UserAvatar
                                  name={emailToDisplayName(entry.user)}
                                  email={entry.user}
                                  size="xxs"
                                  outline={false}
                                />
                                <span className="text-muted-foreground">
                                  <span className="text-foreground font-medium">
                                    {emailToDisplayName(entry.user)}
                                  </span>
                                  {" moved from "}
                                  <span className="font-mono">{displayColumnId(entry.from)}</span>
                                  {" to "}
                                  <span className="font-mono">{displayColumnId(entry.to)}</span>
                                </span>
                                <span className="text-muted-foreground/60 ml-auto shrink-0">
                                  {relativeTime(entry.timestamp)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Comments */}
                      {comments.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-muted-foreground mb-2">Comments</h4>
                          <div className="space-y-3">
                            {/* oxlint-disable id-length */}
                            {comments.map((cmt, idx) => (
                              <div key={idx} className="border rounded-md p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <UserAvatar
                                    name={emailToDisplayName(cmt.user)}
                                    email={cmt.user}
                                    size="xs"
                                  />
                                  <span className="font-medium">
                                    {emailToDisplayName(cmt.user)}
                                  </span>
                                  <span className="text-muted-foreground/60 text-xs">
                                    {relativeTime(cmt.timestamp)}
                                  </span>
                                </div>
                                <MarkdownViewer value={cmt.message} />
                              </div>
                            ))}
                            {/* oxlint-enable id-length */}
                          </div>
                        </div>
                      )}

                      {/* Approvals */}
                      {approvals.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-muted-foreground mb-2">Approvals</h4>
                          <div className="space-y-1.5">
                            {/* oxlint-disable id-length */}
                            {approvals.map((appr, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <UserAvatar
                                  name={emailToDisplayName(appr.user)}
                                  email={appr.user}
                                  size="xxs"
                                  outline={false}
                                />
                                <span className="text-muted-foreground">
                                  <span className="text-foreground font-medium">
                                    {emailToDisplayName(appr.user)}
                                  </span>
                                </span>
                                <span className="text-muted-foreground/60 ml-auto shrink-0">
                                  {relativeTime(appr.timestamp)}
                                </span>
                              </div>
                            ))}
                            {/* oxlint-enable id-length */}
                          </div>
                        </div>
                      )}

                      {/* Add comment (view mode only) */}
                      {!showEditControls && isEdit && (
                        <div>
                          <h4 className="font-semibold text-muted-foreground mb-2">Add Comment</h4>
                          <div className="border rounded-md overflow-hidden">
                            <div className="flex flex-col">
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
                                  /* no props dialog */
                                }}
                                setShowPreview={(_val: boolean | ((prev: boolean) => boolean)): void => {
                                  /* no preview toggle */
                                }}
                              />
                              <textarea
                                value={commentBody}
                                onChange={(ev) => {
                                  setCommentBody(ev.target.value);
                                }}
                                onKeyDown={handleCommentKeyDown}
                                placeholder="Write a comment... (Ctrl+Enter to submit)"
                                className="w-full p-3 resize-none outline-none font-mono text-sm leading-relaxed min-h-[100px]"
                              />
                            </div>
                            <div className="flex justify-end gap-2 px-3 py-2 border-t border-border">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setCommentBody("");
                                }}
                                disabled={commentBody.trim() === ""}
                              >
                                Clear
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleCommentSubmit}
                                disabled={commentBody.trim() === ""}
                              >
                                Add comment
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {comments.length === 0 &&
                        statusHistory.length === 0 &&
                        approvals.length === 0 && (
                          <p className="text-muted-foreground py-4 text-center">No activity yet.</p>
                        )}
                    </div>
                  )}

                  {activeTab === "vc" && (
                    <VersionControlTab
                      commits={commits}
                      commitsLoading={commitsLoading}
                      onCommitClick={openDiff}
                    />
                  )}
                </div>
              )}
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

      <CommitDiffDialog
        open={diffOpen}
        onOpenChange={(isOpen) => {
          setDiffOpen(isOpen);
          if (!isOpen) {
            setDiffData(undefined);
          }
        }}
        diffData={diffData}
        diffLoading={diffLoading}
      />
    </>
  );
}

export default TicketDialog;
