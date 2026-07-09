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
import type { CommitEntry } from "@/lib/types";
import CommitDiffDialog from "@/components/layout/commit-diff-dialog";
import MarkdownViewer from "@/components/editor/markdown/viewer";
import InlineEditor from "@/components/editor/markdown/inline-editor";
import VersionControlTab from "./version-control-tab";
import Timeline from "./timeline";

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
    // Don't capture keyboard shortcuts when typing in an input/textarea
    const target = ev.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
    }

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

  const [commentBody, setCommentBody] = useState("");

  const handleCommentSubmit = useCallback(async (): Promise<void> => {
    const trimmed = commentBody.trim();
    if (!trimmed || !ticket) {
      return;
    }
    const comment: TicketComment = {
      message: trimmed,
      timestamp: new Date().toISOString(),
      user: user?.email ?? user?.name ?? "unknown",
    };
    const updatedComments = [...comments, comment];
    setComments(updatedComments);
    setCommentBody("");

    try {
      const path = `${ticket.boardSlug}/${ticket.ticketId}.yaml`;
      const yaml = ticketToYaml({
        approvals: approvals.length > 0 ? approvals : undefined,
        assignee: assignee.trim() || undefined,
        body: body.trim(),
        column,
        comments: updatedComments,
        reporter: reporter.trim() || undefined,
        statusHistory: statusHistory.length > 0 ? statusHistory : undefined,
        title: title.trim(),
      });
      await putFile(path, yaml);
      toast.success("Comment added");
    } catch {
      toast.error("Failed to add comment");
      // Roll back on failure
      setComments(comments);
    }
  }, [
    commentBody,
    ticket,
    user,
    comments,
    approvals,
    assignee,
    body,
    column,
    reporter,
    statusHistory,
    title,
  ]);

  const handleCommentKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
        ev.preventDefault();
        void handleCommentSubmit();
      }
    },
    [handleCommentSubmit],
  );

  const bodyContent = editing ? (
    <InlineEditor
      value={body}
      onChange={setBody}
      placeholder="Add description..."
      minHeight="min-h-[260px]"
    />
  ) : (
    <div className="border rounded-md overflow-hidden">
      <MarkdownViewer value={body || "*No description.*"} className="px-5 py-4" />
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
                  <span className="flex items-center gap-3 text-foreground">
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
                  <div className="flex items-center gap-3 text-foreground">
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
                    <Timeline
                      comments={comments}
                      approvals={approvals}
                      statusHistory={statusHistory}
                      showAddComment={!showEditControls}
                      commentBody={commentBody}
                      onCommentChange={setCommentBody}
                      onCommentKeyDown={handleCommentKeyDown}
                      onCommentSubmit={() => {
                        void handleCommentSubmit();
                      }}
                      onCommentClear={() => {
                        setCommentBody("");
                      }}
                    />
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
