import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import { displayColumnId, approvalFileType } from "@/lib/board";
import type { TicketComment, TicketApproval, TimelineEntry, BoardColumn } from "@/lib/board";
import MarkdownViewer from "@/components/editor/markdown/viewer";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import InlineEditor from "@/components/editor/markdown/inline-editor";
import { useState } from "react";
import type { JSX } from "react";

interface TimelineProps {
  comments: TicketComment[];
  approvals: TicketApproval[];
  timeline: TimelineEntry[];
  showAddComment: boolean;
  commentBody: string;
  onCommentChange: (value: string) => void;
  onCommentKeyDown: (ev: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCommentSubmit: () => void;
  onCommentClear: () => void;
  columns: BoardColumn[];
  currentUser?: string;
  onCommentEdit?: (index: number, newMessage: string) => void;
}

interface TimelineItem {
  type: "comment" | "approval" | "status";
  timestamp: string;
  data: TicketComment | TicketApproval | TimelineEntry;
  dataIndex: number;
}

interface EditCommentFormProps {
  initialMessage: string;
  onSave: (newMessage: string) => void;
  onCancel: () => void;
}

function EditCommentForm({ initialMessage, onSave, onCancel }: EditCommentFormProps): JSX.Element {
  const [value, setValue] = useState(initialMessage);

  return (
    <div>
      <InlineEditor
        border={false}
        value={value}
        onChange={setValue}
        placeholder="Edit comment..."
        minHeight="min-h-[80px]"
      />
      <div className="flex justify-end gap-2 mt-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            onSave(value);
          }}
          disabled={value.trim() === ""}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function renderTimelineItem(
  item: TimelineItem,
  columnColor: (id: string) => string,
  currentUser?: string,
  editingIndex?: number,
  onStartEdit?: (index: number) => void,
  onSaveEdit?: (index: number, newMessage: string) => void,
  onCancelEdit?: () => void,
): JSX.Element {
  switch (item.type) {
    case "comment": {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const cmt = item.data as TicketComment;
      const isOwn = currentUser !== undefined && cmt.user === currentUser;
      const isEditing = editingIndex === item.dataIndex;

      if (isEditing) {
        return (
          <div className="border rounded-md p-3 bg-background">
            <div className="flex items-center gap-2 mb-2">
              <UserAvatar name={emailToDisplayName(cmt.user)} email={cmt.user} size="xs" />
              <span className="font-bold">{cmt.user}</span>
              <span className="text-xs ml-auto">{relativeTime(item.timestamp)}</span>
            </div>
            <EditCommentForm
              initialMessage={cmt.message}
              onSave={(newMsg) => {
                onSaveEdit?.(item.dataIndex, newMsg);
              }}
              onCancel={() => {
                onCancelEdit?.();
              }}
            />
          </div>
        );
      }

      return (
        <div className="border rounded-md p-3 bg-background">
          <div className="flex items-center gap-2 mb-2">
            <UserAvatar name={emailToDisplayName(cmt.user)} email={cmt.user} size="xs" />
            <span className="font-bold">{cmt.user}</span>
            <span className="text-xs ml-auto">{relativeTime(item.timestamp)}</span>
            {isOwn && (
              <button
                type="button"
                onClick={() => {
                  onStartEdit?.(item.dataIndex);
                }}
                title="Edit comment"
              >
                <EmojiIcon fileType="edit" size={16} />
              </button>
            )}
          </div>
          <MarkdownViewer value={cmt.message} className="px-3 py-2" />
        </div>
      );
    }
    case "status": {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const entry = item.data as TimelineEntry;
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
              style={{ backgroundColor: columnColor(entry.from ?? "") }}
            >
              {displayColumnId(entry.from ?? "")}
            </Badge>
            {" to "}
            <Badge
              className="font-bold text-background"
              style={{ backgroundColor: columnColor(entry.to ?? "") }}
            >
              {displayColumnId(entry.to ?? "")}
            </Badge>
          </span>
          <span className="ml-auto shrink-0">{relativeTime(item.timestamp)}</span>
        </div>
      );
    }
    case "approval": {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const appr = item.data as TicketApproval;
      const isRejected = appr.status === "rejected";
      // oxlint-disable-next-line typescript/strict-boolean-expressions
      const outdated = appr.outdated;
      return (
        <div className="flex items-center gap-2 py-1">
          <EmojiIcon fileType={approvalFileType(appr)} size={24} />
          <UserAvatar
            name={emailToDisplayName(appr.user)}
            email={appr.user}
            outline={false}
            size="sm"
          />
          <span className="text-sm text-foreground flex items-center gap-2">
            <span className="font-bold">{appr.user}</span>
            {isRejected ? (
              <span className="font-bold text-destructive">rejected</span>
            ) : (
              <span className={outdated === true ? "font-bold text-amber" : "font-bold text-green"}>
                approved
              </span>
            )}
            {outdated === true && <span>(outdated)</span>}
          </span>
          <span className="ml-auto shrink-0">{relativeTime(item.timestamp)}</span>
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
  timeline,
  showAddComment,
  commentBody,
  onCommentChange,
  onCommentKeyDown,
  onCommentSubmit,
  onCommentClear,
  columns,
  currentUser,
  onCommentEdit,
}: TimelineProps): JSX.Element {
  const [editingIndex, setEditingIndex] = useState(-1);

  const items: TimelineItem[] = [
    ...comments.map((cmt, idx) => ({
      data: cmt,
      dataIndex: idx,
      timestamp: cmt.timestamp,
      type: "comment" as const,
    })),
    ...approvals.map((appr) => ({
      data: appr,
      dataIndex: -1,
      timestamp: appr.timestamp,
      type: "approval" as const,
    })),
    ...timeline
      .filter((tl) => tl.type === "status")
      .map((entry) => ({
        data: entry,
        dataIndex: -1,
        timestamp: entry.timestamp,
        type: "status" as const,
      })),
  ].toSorted(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );

  if (items.length === 0 && !showAddComment) {
    return (
      <p className="text-muted-foreground py-4 text-center bg-background rounded-md border">
        No activity yet.
      </p>
    );
  }

  const columnColor = (id: string): string =>
    columns.find((col) => col.id === id)?.color ?? "#6b7280";

  return (
    <div className="space-y-0">
      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx}>
              {renderTimelineItem(
                item,
                columnColor,
                currentUser,
                editingIndex,
                (index) => {
                  setEditingIndex(index);
                },
                (index, newMessage) => {
                  setEditingIndex(-1);
                  onCommentEdit?.(index, newMessage);
                },
                () => {
                  setEditingIndex(-1);
                },
              )}
            </div>
          ))}
        </div>
      )}

      {showAddComment && (
        <div className="mt-4">
          <h4 className="font-bold text-foreground mb-2">Add Comment</h4>
          <div className="border rounded-md overflow-hidden bg-background">
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
