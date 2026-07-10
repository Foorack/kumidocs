import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";
import type { CommitEntry } from "@/lib/types";

interface VersionControlTabProps {
  commits: CommitEntry[];
  commitsLoading: boolean;
  onCommitClick: (sha: string) => void;
}

export default function VersionControlTab({
  commits,
  commitsLoading,
  onCommitClick,
}: VersionControlTabProps): JSX.Element {
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
          aria-label={`View diff for commit ${commit.sha.slice(0, 7)}`}
          className="w-full text-left flex items-start gap-3 py-1.5 border-b border-border last:border-0 hover:bg-accent/40 group transition-colors rounded"
        >
          <UserAvatar
            name={emailToDisplayName(commit.author)}
            email={commit.authorEmail}
            size="xs"
            className="shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <p className="text-foreground line-clamp-2 group-hover:underline">{commit.message}</p>
            <div className="flex items-center gap-3 mt-0.5">
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
