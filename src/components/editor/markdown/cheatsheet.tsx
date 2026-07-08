import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CHEATSHEET_ROWS } from "./editor-utils";
import { FileQuestionMark } from "lucide-react";

function MarkdownCheatsheet(): JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Markdown cheatsheet">
          <span className="text-muted-foreground">
            <FileQuestionMark />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Markdown Cheatsheet</DialogTitle>
        </DialogHeader>
        <div className="text-xs space-y-1 mt-2">
          {CHEATSHEET_ROWS.map(([syntax, label]) => (
            <div
              key={label}
              className="flex items-start gap-3 py-1 border-b border-border/50 last:border-0"
            >
              <code className="flex-1 font-mono text-muted-foreground whitespace-pre-wrap">
                {syntax}
              </code>
              <span className="text-foreground shrink-0 w-28 text-right">{label}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MarkdownCheatsheet;
