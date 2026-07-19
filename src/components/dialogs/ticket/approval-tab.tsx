import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import { approvalFileType } from "@/lib/board";
import type { TicketApproval } from "@/lib/board";

interface ApprovalTabProps {
  approvals: TicketApproval[];
  showActions: boolean;
  currentUser?: string;
  onApprove: () => void;
  onReject: () => void;
}

/** Keep only the latest approval per user. */
function latestPerUser(all: TicketApproval[]): TicketApproval[] {
  const latest = new Map<string, TicketApproval>();
  for (const entry of all) {
    latest.set(entry.user, entry);
  }
  return [...latest.values()];
}

export default function ApprovalTab({
  approvals,
  showActions,
  currentUser,
  onApprove,
  onReject,
}: ApprovalTabProps): JSX.Element {
  const latest = latestPerUser(approvals);
  const myLatest =
    currentUser === undefined ? undefined : latest.find((appr) => appr.user === currentUser);

  return (
    <div className="space-y-3 bg-background rounded-md p-3 border">
      {latest.length > 0 && (
        <div className="space-y-2">
          {latest.map((appr, idx) => {
            const ft = approvalFileType(appr);
            const isRejected = appr.status === "rejected";
            // oxlint-disable-next-line typescript/strict-boolean-expressions
            const outdated = appr.outdated;
            return (
              <div key={idx} className="flex items-center gap-2 py-1">
                <EmojiIcon fileType={ft} size={24} />
                <UserAvatar name={emailToDisplayName(appr.user)} email={appr.user} size="xs" />
                <span className="font-bold text-sm">{appr.user}</span>
                {isRejected ? (
                  <span className="text-destructive text-sm font-bold">rejected</span>
                ) : (
                  <span
                    className={
                      outdated === true
                        ? "text-amber text-sm font-bold"
                        : "text-green text-sm font-bold"
                    }
                  >
                    approved
                  </span>
                )}
                {outdated === true && <span className="text-sm">(outdated)</span>}
                <span className="text-muted-foreground text-xs">
                  {relativeTime(appr.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {showActions && (
        <div className="flex gap-3 pt-3 border-t border-border">
          <Button
            size="sm"
            onClick={onApprove}
            disabled={myLatest?.status === "approved" && myLatest.outdated !== true}
            className="bg-green text-white hover:bg-green/90"
          >
            Approve
          </Button>
          <Button
            size="sm"
            onClick={onReject}
            disabled={myLatest?.status === "rejected" && myLatest.outdated !== true}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
