// oxlint-disable complexity
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import { Copy, History, MessageSquare, ThumbsUp } from "lucide-react";
import { createFile, getFile, getFileDiff, getFileHistory, getTree, putFile } from "@/lib/api";
import type { DiffData } from "@/lib/api";
import { parseTicketYaml, serializeTicket } from "@/lib/board";
import { load } from "js-yaml";
import type { BoardColumn, TicketComment, TicketApproval, TimelineEntry } from "@/lib/board";
import { sha256 } from "@noble/hashes/sha2.js";
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
import ApprovalTab from "./approval-tab";
import TicketSidebar from "./ticket-sidebar";

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
    bookmarks?: string[];
    column: string;
    golden?: boolean;
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
  const [golden, setGolden] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"activity" | "vc" | "approval">("activity");
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
      setGolden(ticket.golden ?? false);
      setBookmarks(ticket.bookmarks ?? []);
      setTimeline([]);
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
      setGolden(false);
      setBookmarks([]);
      setTimeline([]);
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
        setBookmarks(data.bookmarks ?? []);
        setTimeline(data.timeline ?? []);
        // Parse body from raw YAML (TicketData doesn't carry body)
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const parsed = load(resp.content) as Record<string, unknown>;
        const parsedBody = typeof parsed.body === "string" ? parsed.body : "";
        setBody(parsedBody);

        // Mark approvals as outdated if their hash doesn't match current content
        const updatedApprovals = (data.approvals ?? []).map((appr) => {
          const expectedHash = sha256(
            new TextEncoder().encode(
              `${appr.user.toLowerCase()}${data.id}${data.title}${parsedBody}`,
            ),
          );
          const expectedHex = [...expectedHash]
            // oxlint-disable-next-line id-length
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (appr.hash !== expectedHex) {
            appr.outdated = true;
            return appr;
          }
          return appr;
        });
        setApprovals(updatedApprovals);
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
        const now = new Date().toISOString();
        const userEmail = user?.email ?? user?.name ?? "unknown";
        let updatedTimeline = timeline;
        if (column !== ticket.column) {
          updatedTimeline = [
            ...updatedTimeline,
            {
              from: ticket.column,
              timestamp: now,
              to: column,
              type: "status" as const,
              user: userEmail,
            },
          ];
        }
        if (golden !== (ticket.golden ?? false)) {
          updatedTimeline = [
            ...updatedTimeline,
            {
              golden,
              timestamp: now,
              type: "golden" as const,
              user: userEmail,
            },
          ];
        }
        const path = `${ticket.boardSlug}/${ticket.ticketId}.yaml`;
        const yaml = serializeTicket({
          approvals: approvals.length > 0 ? approvals : undefined,
          assignee: assignee.trim() || undefined,
          body: body.trim(),
          bookmarks: bookmarks.length > 0 ? bookmarks : undefined,
          column,
          comments: comments.length > 0 ? comments : undefined,
          golden: golden || undefined,
          reporter: reporter.trim() || undefined,
          timeline: updatedTimeline.length > 0 ? updatedTimeline : undefined,
          title: title.trim(),
        });
        setTimeline(updatedTimeline);
        await putFile(path, yaml);
        toast.success("Ticket saved");
        onSaved?.();
        setEditing(false);
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
      const yaml = serializeTicket({
        approvals: approvals.length > 0 ? approvals : undefined,
        assignee: assignee.trim() || undefined,
        body: body.trim(),
        bookmarks: bookmarks.length > 0 ? bookmarks : undefined,
        column,
        comments: comments.length > 0 ? comments : undefined,
        golden: golden || undefined,
        reporter: reporter.trim() || undefined,
        timeline: timeline.length > 0 ? timeline : undefined,
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
    golden,
    isEdit,
    ticket,
    navigate,
    onCreated,
    onClose,
    onSaved,
    reporter,
    timeline,
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

  const bookmarksChanged =
    isEdit &&
    (bookmarks.length !== (ticket.bookmarks ?? []).length ||
      !bookmarks.every((bm) => (ticket.bookmarks ?? []).includes(bm)));

  const canSave =
    !saving &&
    title.trim() !== "" &&
    (!isEdit ||
      title !== ticket.title ||
      body !== ticket.body ||
      column !== ticket.column ||
      golden !== (ticket.golden ?? false) ||
      assignee !== (ticket.assignee ?? "") ||
      bookmarksChanged);

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
      const yaml = serializeTicket({
        approvals: approvals.length > 0 ? approvals : undefined,
        assignee: assignee.trim() || undefined,
        body: body.trim(),
        bookmarks: bookmarks.length > 0 ? bookmarks : undefined,
        column,
        comments: updatedComments,
        golden: golden || undefined,
        reporter: reporter.trim() || undefined,
        timeline: timeline.length > 0 ? timeline : undefined,
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
    bookmarks,
    column,
    golden,
    reporter,
    timeline,
    title,
  ]);

  const handleCommentEdit = useCallback(
    async (commentIndex: number, newMessage: string): Promise<void> => {
      if (!ticket) {
        return;
      }
      const updatedComments: TicketComment[] = comments.map((cmt, idx) =>
        idx === commentIndex ? { ...cmt, message: newMessage } : cmt,
      );
      setComments(updatedComments);

      try {
        const path = `${ticket.boardSlug}/${ticket.ticketId}.yaml`;
        const yaml = serializeTicket({
          approvals: approvals.length > 0 ? approvals : undefined,
          assignee: assignee.trim() || undefined,
          body: body.trim(),
          bookmarks: bookmarks.length > 0 ? bookmarks : undefined,
          column,
          comments: updatedComments,
          golden: golden || undefined,
          reporter: reporter.trim() || undefined,
          timeline: timeline.length > 0 ? timeline : undefined,
          title: title.trim(),
        });
        await putFile(path, yaml);
        toast.success("Comment updated");
      } catch {
        toast.error("Failed to update comment");
        setComments(comments);
      }
    },
    [
      ticket,
      comments,
      approvals,
      assignee,
      body,
      bookmarks,
      column,
      golden,
      reporter,
      timeline,
      title,
    ],
  );

  const handleApproval = useCallback(
    async (status: "approved" | "rejected"): Promise<void> => {
      if (!ticket) {
        return;
      }
      const now = new Date().toISOString();
      const userEmail = user?.email ?? user?.name ?? "unknown";
      const hashInput = `${userEmail.toLowerCase()}${ticket.ticketId}${title}${body}`;
      const hashBytes = sha256(new TextEncoder().encode(hashInput));
      // oxlint-disable-next-line id-length
      const hashHex = [...hashBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      const entry: TicketApproval = {
        hash: hashHex,
        status,
        timestamp: now,
        user: userEmail,
      };
      const updatedApprovals = [...approvals, entry];
      setApprovals(updatedApprovals);

      try {
        const path = `${ticket.boardSlug}/${ticket.ticketId}.yaml`;
        const yaml = serializeTicket({
          approvals: updatedApprovals,
          assignee: assignee.trim() || undefined,
          body: body.trim(),
          bookmarks: bookmarks.length > 0 ? bookmarks : undefined,
          column,
          comments: comments.length > 0 ? comments : undefined,
          golden: golden || undefined,
          reporter: reporter.trim() || undefined,
          timeline: timeline.length > 0 ? timeline : undefined,
          title: title.trim(),
        });
        await putFile(path, yaml);
        toast.success(status === "approved" ? "Approved" : "Rejected");
      } catch {
        toast.error("Failed to record approval");
        setApprovals(approvals);
      }
    },
    [
      ticket,
      user,
      approvals,
      assignee,
      body,
      bookmarks,
      column,
      comments,
      golden,
      reporter,
      timeline,
      title,
    ],
  );
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
    <div className="bg-background rounded-md border">
      <InlineEditor
        value={body}
        onChange={setBody}
        placeholder="Add description..."
        minHeight="min-h-[260px]"
      />
    </div>
  ) : (
    <div className="border rounded-md overflow-hidden bg-background">
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
          className="sm:max-w-5xl p-0 gap-0 border-5 grid-rows-[auto_minmax(0,1fr)]"
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
          <div className="grid grid-cols-[1fr_auto] min-h-0 overflow-hidden">
            {/* Left: main content */}
            <div
              className={`overflow-y-auto p-5 space-y-4 min-w-0 ${golden ? "ticket-golden-body" : ""}`}
            >
              {/* Board selector (create only) */}
              {!isEdit && (
                <select
                  aria-label="Select a board"
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
                    {reporter || "Unknown"}
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
                          className="text-primary hover:text-foreground underline underline-offset-2 whitespace-nowrap"
                        >
                          Assign to me
                        </button>
                      </>
                    ) : (
                      assignee || "Unassigned"
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
                  <div className="flex border border-border mb-3 bg-background rounded-t-md">
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
                        setActiveTab("approval");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
                        activeTab === "approval"
                          ? "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      Approval
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
                      timeline={timeline}
                      columns={currentColumns}
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
                      currentUser={user?.email}
                      onCommentEdit={(index, newMessage) => {
                        void handleCommentEdit(index, newMessage);
                      }}
                    />
                  )}

                  {activeTab === "approval" && (
                    <ApprovalTab
                      approvals={approvals}
                      showActions={!editing && isEdit}
                      currentUser={user?.email}
                      onApprove={() => {
                        void handleApproval("approved");
                      }}
                      onReject={() => {
                        void handleApproval("rejected");
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

            <TicketSidebar
              columns={currentColumns}
              activeColumn={activeColumn}
              showEditControls={showEditControls}
              onColumnChange={setColumn}
              columnColor={columnColor}
              golden={golden}
              onGoldenToggle={() => {
                setGolden(!golden);
              }}
              bookmarked={bookmarks.includes(user?.email ?? user?.name ?? "")}
              onBookmarkToggle={() => {
                const email = user?.email ?? user?.name ?? "";
                setBookmarks((prev) =>
                  prev.includes(email) ? prev.filter((entry) => entry !== email) : [...prev, email],
                );
              }}
            />
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
