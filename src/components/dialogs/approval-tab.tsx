import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import type { TicketApproval } from "@/lib/board";

interface ApprovalTabProps {
  approvals: TicketApproval[];
  showEditControls: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export default function ApprovalTab({
  approvals,
  showEditControls,
  onApprove,
  onReject,
}: ApprovalTabProps): JSX.Element {
  return (
    <div className="space-y-3">
      {approvals.length > 0 && (
        <div className="space-y-2">
          {approvals.map((appr, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <UserAvatar
                name={emailToDisplayName(appr.user)}
                email={appr.user}
                size="xs"
                outline={false}
              />
              <span className="font-bold">{appr.user}</span>
              <span className={appr.status === "rejected" ? "text-destructive" : "text-green"}>
                {appr.status === "rejected" ? "rejected" : "approved"}
              </span>
              <span className="text-muted-foreground text-xs">{relativeTime(appr.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button size="sm" variant="outline" onClick={onApprove} disabled={!showEditControls}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={!showEditControls}>
          Reject
        </Button>
      </div>
    </div>
  );
}
