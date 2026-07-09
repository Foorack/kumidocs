import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import { displayColumnId } from "@/lib/board";
import type { TicketComment, TicketApproval, StatusEntry, BoardColumn } from "@/lib/board";
import MarkdownViewer from "@/components/editor/markdown/viewer";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import InlineEditor from "@/components/editor/markdown/inline-editor";

interface TimelineProps {
  comments: TicketComment[];
  approvals: TicketApproval[];
  statusHistory: StatusEntry[];
  showAddComment: boolean;
  commentBody: string;
  onCommentChange: (value: string) => void;
  onCommentKeyDown: (ev: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCommentSubmit: () => void;
  onCommentClear: () => void;
  columns: BoardColumn[];
}

interface TimelineItem {
  type: "comment" | "approval" | "status";
  timestamp: string;
  data: TicketComment | TicketApproval | StatusEntry;
}

function renderTimelineItem(item: TimelineItem, columnColor: (id: string) => string): JSX.Element {
  switch (item.type) {
    case "comment": {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const cmt = item.data as TicketComment;
      return (
        <div className="border rounded-md p-3">
          <div className="flex items-center gap-2 mb-2">
            <UserAvatar name={emailToDisplayName(cmt.user)} email={cmt.user} size="xs" />
            <span className="font-bold">{cmt.user}</span>
            <span className="text-muted-foreground text-xs ml-auto">
              {relativeTime(item.timestamp)}
            </span>
          </div>
          <MarkdownViewer value={cmt.message} className="px-3 py-2" />
        </div>
      );
    }
    case "status": {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const entry = item.data as StatusEntry;
      return (
        <div className="flex items-center gap-2 py-1">
          <EmojiIcon fileType="status" size={24} />
          <UserAvatar
            name={emailToDisplayName(entry.user)}
            email={entry.user}
            outline={false}
            size="sm"
          />
          <span className="text-sm text-foreground flex items-center gap-2">
            <span className="font-bold">{entry.user}</span>
            {" moved from "}
            <Badge
              className="font-bold text-background"
              style={{ backgroundColor: columnColor(entry.from) }}
            >
              {displayColumnId(entry.from)}
            </Badge>
            {" to "}
            <Badge
              className="font-bold text-background"
              style={{ backgroundColor: columnColor(entry.to) }}
            >
              {displayColumnId(entry.to)}
            </Badge>
          </span>
          <span className="text-muted-foreground/60 ml-auto shrink-0">
            {relativeTime(item.timestamp)}
          </span>
        </div>
      );
    }
    case "approval": {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const appr = item.data as TicketApproval;
      const apprType = appr.status ?? "approved";
      return (
        <div className="flex items-center gap-2 py-1">
          <EmojiIcon fileType={apprType as "approve" | "reject" | "outdated"} size={24} />
          <UserAvatar
            name={emailToDisplayName(appr.user)}
            email={appr.user}
            outline={false}
            size="sm"
          />
          <span className="text-sm text-foreground flex items-center gap-2">
            <span className="font-bold">{appr.user}</span>
            {apprType === "approved"
              ? " approved"
              : apprType === "rejected"
                ? " rejected"
                : " marked outdated"}
          </span>
          <span className="text-muted-foreground/60 ml-auto shrink-0">
            {relativeTime(item.timestamp)}
          </span>
        </div>
      );
    }
    default: {
      return <div />;
    }
  }
}

export default function Timeline({
  comments,
  approvals,
  statusHistory,
  showAddComment,
  commentBody,
  onCommentChange,
  onCommentKeyDown,
  onCommentSubmit,
  onCommentClear,
  columns,
}: TimelineProps): JSX.Element {
  const items: TimelineItem[] = [
    ...comments.map((cmt) => ({ data: cmt, timestamp: cmt.timestamp, type: "comment" as const })),
    ...approvals.map((appr) => ({
      data: appr,
      timestamp: appr.timestamp,
      type: "approval" as const,
    })),
    ...statusHistory.map((entry) => ({
      data: entry,
      timestamp: entry.timestamp,
      type: "status" as const,
    })),
  ].toSorted(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );

  if (items.length === 0 && !showAddComment) {
    return <p className="text-muted-foreground py-4 text-center">No activity yet.</p>;
  }

  const columnColor = (id: string): string =>
    columns.find((col) => col.id === id)?.color ?? "#6b7280";

  return (
    <div className="space-y-0">
      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx}>{renderTimelineItem(item, columnColor)}</div>
          ))}
        </div>
      )}

      {showAddComment && (
        <div className="mt-4">
          <h4 className="font-bold text-foreground mb-2">Add Comment</h4>
          <div className="border rounded-md overflow-hidden">
            <InlineEditor
              border={false}
              value={commentBody}
              onChange={onCommentChange}
              onKeyDown={onCommentKeyDown}
              placeholder="Write a comment... (Ctrl+Enter to submit)"
              minHeight="min-h-[100px]"
            />
            <div className="flex justify-end gap-2 px-3 py-2 border-t border-border">
              <Button
                size="sm"
                variant="ghost"
                onClick={onCommentClear}
                disabled={commentBody.trim() === ""}
              >
                Clear
              </Button>
              <Button size="sm" onClick={onCommentSubmit} disabled={commentBody.trim() === ""}>
                Add comment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
