import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import { displayColumnId } from "@/lib/board";
import type { TicketComment, TicketApproval, StatusEntry } from "@/lib/board";
import MarkdownViewer from "@/components/editor/markdown/viewer";
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
}

interface TimelineItem {
  type: "comment" | "approval" | "status";
  timestamp: string;
  data: TicketComment | TicketApproval | StatusEntry;
}

function dotColor(type: string): string {
  switch (type) {
    case "status": {
      return "bg-amber-400";
    }
    case "approval": {
      return "bg-green-500";
    }
    default: {
      return "bg-sky-500";
    }
  }
}

function renderTimelineItem(item: TimelineItem, _idx: number): JSX.Element {
  switch (item.type) {
    case "comment": {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const cmt = item.data as TicketComment;
      return (
        <div className="border rounded-md p-3">
          <div className="flex items-center gap-2 mb-2">
            <UserAvatar name={emailToDisplayName(cmt.user)} email={cmt.user} size="xs" />
            <span className="font-medium">{emailToDisplayName(cmt.user)}</span>
            <span className="text-muted-foreground/60 text-xs ml-auto">
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
        <div className="flex items-center gap-2 text-xs py-1">
          <UserAvatar
            name={emailToDisplayName(entry.user)}
            email={entry.user}
            size="xxs"
            outline={false}
          />
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{emailToDisplayName(entry.user)}</span>
            {" moved from "}
            <span className="font-mono">{displayColumnId(entry.from)}</span>
            {" to "}
            <span className="font-mono">{displayColumnId(entry.to)}</span>
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
      return (
        <div className="flex items-center gap-2 text-xs py-1">
          <UserAvatar
            name={emailToDisplayName(appr.user)}
            email={appr.user}
            size="xxs"
            outline={false}
          />
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{emailToDisplayName(appr.user)}</span>
            {" approved"}
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

  return (
    <div className="space-y-0">
      {items.length > 0 && (
        <div className="relative pl-7">
          <div className="absolute left-[9px] top-2 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-[22px] top-1.5 w-[18px] flex justify-center">
                  <div
                    className={`w-2.5 h-2.5 rounded-full border-2 border-background ${dotColor(item.type)}`}
                  />
                </div>
                {renderTimelineItem(item, idx)}
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddComment && (
        <div className="mt-4">
          <h4 className="font-semibold text-muted-foreground mb-2">Add Comment</h4>
          <div className="border rounded-md overflow-hidden">
            <InlineEditor
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
