import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import MarkdownViewer from "@/components/editor/markdown/viewer";
import type { TicketComment } from "@/lib/board";

interface CommentProps {
  comment: TicketComment;
}

export default function Comment({ comment }: CommentProps): JSX.Element {
  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center gap-2 mb-2">
        <UserAvatar name={emailToDisplayName(comment.user)} email={comment.user} size="xs" />
        <span className="font-medium">{comment.user}</span>
        <span className="text-muted-foreground/60 text-xs">{relativeTime(comment.timestamp)}</span>
      </div>
      <MarkdownViewer value={comment.message} className="px-3 py-2" />
    </div>
  );
}
