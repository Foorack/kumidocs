import { ChevronDown, ChevronRight, X } from "lucide-react";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import { getBacklinks, getFileDiff, getFileHistory } from "@/lib/api";
import { useMemo, useState } from "react";
import type { BacklinkEntry, CommitEntry } from "@/lib/types";
import CommitDiffDialog from "./commit-diff-dialog";
import type { DiffData } from "@/lib/api";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";
import useMountEffect from "@/hooks/use-mount-effect";

interface PageInfoPanelProps {
  filePath: string;
  title: string;
  onClose?: () => void;
}

export default function PageInfoPanel({
  filePath,
  title,
  onClose,
}: PageInfoPanelProps): JSX.Element {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([]);
  const [backlinksLoading, setBacklinksLoading] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffData, setDiffData] = useState<DiffData | undefined>();
  const [diffLoading, setDiffLoading] = useState(false);

  // Group commits by calendar date with human-readable labels
  const commitGroups = useMemo(() => {
    const groups = new Map<string, { label: string; commits: CommitEntry[] }>();
    for (const commit of commits) {
      const date = new Date(commit.date);
      date.setHours(0, 0, 0, 0);
      const key = date.toISOString().slice(0, 10);
      if (!groups.has(key)) {
        const label = date.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        groups.set(key, { commits: [], label });
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we just ensured this
      groups.get(key)!.commits.push(commit);
    }
    return [...groups.entries()];
  }, [commits]);

  const toggleGroup = (key: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useMountEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [history, backlinkData] = await Promise.all([
          getFileHistory(filePath),
          getBacklinks(filePath),
        ]);
        setCommits(history);
        setBacklinks(backlinkData);
      } catch {
        setCommits([]);
        setBacklinks([]);
      } finally {
        setLoading(false);
        setBacklinksLoading(false);
      }
    })();
  });

  const openDiff = async (sha: string): Promise<void> => {
    setDiffLoading(true);
    setDiffOpen(true);
    setDiffData(undefined);
    try {
      const data = await getFileDiff(filePath, sha);
      setDiffData(data);
    } catch {
      setDiffData(undefined);
    } finally {
      setDiffLoading(false);
    }
  };

  let backlinksContent: ReactNode;
  if (backlinksLoading) {
    backlinksContent = <p className="py-2">Loading…</p>;
  } else if (backlinks.length === 0) {
    backlinksContent = <p className="py-2">No backlinks yet.</p>;
  } else {
    backlinksContent = (
      <ul className="space-y-0.5 list-disc list-inside">
        {backlinks.map((bl) => (
          <li key={bl.path}>
            <Link
              to={`/p/${bl.path.replace(/\.md$/u, "")}`}
              className="hover:text-foreground transition-colors"
            >
              {bl.title}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  let commitHistoryContent: ReactNode;
  if (loading) {
    commitHistoryContent = <p className="py-2">Loading…</p>;
  } else if (commits.length === 0) {
    commitHistoryContent = <p className="py-2">No commits yet.</p>;
  } else {
    commitHistoryContent = (
      <div className="space-y-1">
        {commitGroups.map(([key, { label, commits: groupCommits }]) => {
          const isCollapsed = collapsedGroups.has(key);
          return (
            <div key={key}>
              {/* Date group header */}
              <button
                className="w-full flex items-center gap-1 py-1 hover:text-foreground transition-colors rounded hover:bg-accent/40 select-none"
                onClick={() => {
                  toggleGroup(key);
                }}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                )}
                <span className="font-medium">{label}</span>
                <span className="ml-auto text-xs tabular-nums">{groupCommits.length}</span>
              </button>
              {/* Commits */}
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {groupCommits.map((commit) => (
                    <button
                      key={commit.sha}
                      className="w-full text-left rounded py-1.5 hover:bg-accent/60 group flex items-start gap-1.5 transition-colors"
                      onClick={() => {
                        void openDiff(commit.sha);
                      }}
                    >
                      <UserAvatar
                        name={emailToDisplayName(commit.author)}
                        email={commit.authorEmail}
                        size="xs"
                        className="shrink-0 mt-0.5"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-foreground line-clamp-2 block">
                          {commit.message}
                        </span>
                        {(commit.added !== undefined || commit.removed !== undefined) && (
                          <span className="flex gap-1 mt-0.5">
                            {(commit.added ?? 0) > 0 && (
                              <span className="text-green font-mono">+{commit.added}</span>
                            )}
                            {(commit.removed ?? 0) > 0 && (
                              <span className="text-red font-mono">-{commit.removed}</span>
                            )}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-l border-border bg-sidebar flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <EmojiIcon fileType="pageinfo" size={16} />
          <span className="flex-1">Page info</span>
          {onClose && (
            <button
              className="ml-auto p-0 rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {/* Title + path */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider">Title</p>
            <p className="break-words">{title}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider">Path</p>
            <p className="font-mono break-all">{filePath}</p>
          </div>

          {/* Backlinks */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider">Backlinks</p>
            {backlinksContent}
          </div>

          {/* Commit history */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider">Commit history</p>
            {commitHistoryContent}
          </div>
        </div>
      </ScrollArea>

      <CommitDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diffData={diffData}
        diffLoading={diffLoading}
      />
    </div>
  );
}
