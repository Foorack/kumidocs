import "react-diff-view/style/index.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import { Button } from "@/components/ui/button";
import type { DiffData } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CommitDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diffData: DiffData | undefined;
  diffLoading: boolean;
}

export default function CommitDiffDialog({
  open,
  onOpenChange,
  diffData,
  diffLoading,
}: CommitDiffDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] sm:w-[80vw] sm:max-w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="font-semibold">
            {diffData ? (
              <>
                <span className="font-mono mr-2">{diffData.sha}</span>
                {diffData.message}
              </>
            ) : (
              "Loading diff…"
            )}
          </DialogTitle>
          {diffData && (
            <p>
              {diffData.author} \u00b7{" "}
              {new Date(diffData.date).toLocaleString(undefined, {
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            {diffLoading && <p className="py-4 text-center">Loading diff…</p>}
            {!diffLoading &&
              diffData &&
              (() => {
                if (!diffData.unifiedDiff.trim()) {
                  return <p className="py-4 text-center">No changes in this commit.</p>;
                }
                let files;
                try {
                  files = parseDiff(diffData.unifiedDiff);
                } catch {
                  return (
                    <p className="text-sm text-foreground py-4 text-center">
                      No changes in this commit.
                    </p>
                  );
                }
                if (files.length === 0) {
                  return <p className="py-4 text-center">No changes in this commit.</p>;
                }
                return files.map((file) => {
                  // parseDiff may return undefined hunks for binary/empty files
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  const hunks = file.hunks ?? [];
                  return (
                    <Diff
                      key={`${file.oldRevision}-${file.newRevision}`}
                      viewType="unified"
                      diffType={file.type}
                      hunks={hunks}
                    >
                      {(hunkList) =>
                        hunkList.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
                      }
                    </Diff>
                  );
                });
              })()}
            {!diffLoading && !diffData && (
              <p className="text-destructive py-4 text-center">Failed to load diff.</p>
            )}
          </div>
        </ScrollArea>
        <div className="px-4 py-2 border-t border-border shrink-0 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
