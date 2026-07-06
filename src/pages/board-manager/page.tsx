import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import useMountEffect from "@/hooks/use-mount-effect";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { createFile, getFile, getTree } from "@/lib/api";
import { defaultBoardConfig, displayColumnId, yamlToBoard } from "@/lib/board";
import type { BoardConfig } from "@/lib/board";
import { Plus, Settings } from "lucide-react";
import type { ChangeEvent, JSX } from "react";

function renderContent(
  loading: boolean,
  boards: BoardEntry[],
  navigate: (path: string) => void,
): JSX.Element {
  if (loading) {
    return <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>;
  }
  if (boards.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No boards yet. Create your first board.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {boards.map((board) => (
        <button
          key={board.slug}
          type="button"
          className="flex items-start gap-3 rounded-lg border border-border p-4 text-left hover:bg-accent/50 transition-colors"
          onClick={(): void => {
            navigate(`/bm/${board.slug}`);
          }}
        >
          <Settings className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{board.config.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {board.config.prefix} &middot; {board.config.columns.length} columns
            </p>
            <div className="flex gap-1 mt-2">
              {board.config.columns.map((col, colIdx) => (
                <span
                  key={colIdx}
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: col.color }}
                  title={displayColumnId(col.id)}
                />
              ))}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

interface OutletCtx {
  instanceName: string;
}

interface BoardEntry {
  slug: string;
  config: BoardConfig;
}

function BoardManagerPage(): JSX.Element {
  const { instanceName } = useOutletContext<OutletCtx>();

  useMountEffect(() => {
    document.title = `Board Manager | ${instanceName}`;
  });
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [creating, setCreating] = useState(false);

  const loadBoards = useCallback(async () => {
    setLoading(true);
    try {
      const tree = await getTree();

      const yamlNodes = tree.filter((node) => node.type === "file" && node.path.endsWith(".yaml"));
      const results = await Promise.all(
        yamlNodes.map(async (node) => {
          const slug = node.path.replace(/\.yaml$/u, "");
          try {
            const resp = await getFile(node.path);
            const config = await yamlToBoard(resp.content);
            if (config) {
              return { config, slug } as BoardEntry;
            }
          } catch {
            // skip invalid yaml
          }
          return undefined;
        }),
      );
      setBoards(results.filter((entry): entry is BoardEntry => entry !== undefined));
    } catch {
      toast.error("Failed to load boards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const handleCreate = useCallback(async () => {
    const slug = newPrefix.toLowerCase().trim();
    if (!slug || !newName.trim()) {
      return;
    }
    setCreating(true);
    try {
      const config = defaultBoardConfig(newName.trim(), newPrefix.trim().toUpperCase());
      const yaml = `# ${config.name}\n---\n`;
      await createFile(`${slug}.yaml`, yaml);

      // Now overwrite with the actual config
      // Use putFile via the API directly
      const { putFile } = await import("@/lib/api");
      const { boardToYaml } = await import("@/lib/board");
      await putFile(`${slug}.yaml`, boardToYaml(config));

      toast.success("Board created");
      setShowCreate(false);
      setNewName("");
      setNewPrefix("");
      void loadBoards();
    } catch {
      toast.error("Failed to create board");
    } finally {
      setCreating(false);
    }
  }, [newName, newPrefix, loadBoards]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Board Manager</h1>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              setShowCreate(true);
            }}
          >
            <Plus className="w-4 h-4" />
            New board
          </Button>
        </div>

        {renderContent(loading, boards, navigate)}
      </div>

      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreate(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New board</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="nb-name">Board name</Label>
              <Input
                id="nb-name"
                value={newName}
                onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                  setNewName(ev.target.value);
                }}
                placeholder="My Board"
                className="h-8 text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nb-prefix">Ticket prefix</Label>
              <Input
                id="nb-prefix"
                value={newPrefix}
                onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                  setNewPrefix(ev.target.value.replaceAll(/[^a-zA-Z]/gu, "").toUpperCase());
                }}
                placeholder="PROJ"
                className="h-8 text-sm w-32 font-mono uppercase"
                maxLength={10}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCreate(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newPrefix.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BoardManagerPage;
