import { BookOpen, FileText, Image, MoreHorizontal, Plus } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PresenceUser, TreeNode } from "@/lib/types";
import buildPageTree from "@/lib/page-tree";
import { Button } from "@/components/ui/button";
import PageNodeRow from "./sidebar-page-node";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import usePageActions from "@/hooks/use-page-actions";
import { useUser } from "@/store/user";

interface SidebarProps {
  tree: TreeNode[];
  width: number;
  onNewPage: () => void;
  onNewSubPage: (parentDir: string) => void;
  presenceByPage: Map<string, PresenceUser[]>;
  reloadTree: () => void;
}

export default function Sidebar({
  tree,
  width,
  onNewPage,
  onNewSubPage,
  presenceByPage,
  reloadTree,
}: SidebarProps): JSX.Element {
  const pages = useMemo(() => buildPageTree(tree), [tree]);
  const { user: currentUser, sidebarDefaultDepth } = useUser();
  const navigate = useNavigate();
  const { openMove, openDelete, dialogs: pageActionDialogs } = usePageActions(reloadTree);

  const handleOpenMove = async (path: string): Promise<void> => {
    try {
      await openMove(path);
    } catch (error: unknown) {
      console.error("Failed to open move dialog:", error);
    }
  };

  return (
    <>
      <aside
        className="shrink-0 border-r border-border bg-sidebar flex flex-col h-full overflow-hidden"
        style={{ width }}
      >
        {/* Pages header */}
        <div className="flex items-center px-3 py-2.5 border-b border-border shrink-0">
          <span className="flex-1 text-sm pt-1 font-semibold text-foreground uppercase tracking-wide select-none">
            Pages
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                title="Wiki options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  void navigate("/i");
                }}
              >
                <Image className="mr-2 w-4 h-4" />
                Image library
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigate("/s");
                }}
              >
                <BookOpen className="mr-2 w-4 h-4" />
                Slide themes
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigate("/p");
                }}
              >
                <FileText className="mr-2 w-4 h-4" />
                Page themes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 py-2">
              {pages.length === 0 ? (
                <div className="px-3 py-4 text-xs text-foreground text-center">
                  No pages yet.
                  <br />
                  Create your first page below.
                </div>
              ) : (
                pages.map((node) => (
                  <PageNodeRow
                    key={`${node.path}-d${sidebarDefaultDepth}`}
                    node={node}
                    depth={0}
                    defaultDepth={sidebarDefaultDepth}
                    presenceByPage={presenceByPage}
                    currentUser={currentUser}
                    onNewSubPage={onNewSubPage}
                    onMove={handleOpenMove}
                    onDelete={openDelete}
                  />
                ))
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={onNewPage}>
              <Plus className="mr-2 w-4 h-4" />
              Create page
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <div className="p-2 border-t border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
            onClick={onNewPage}
          >
            <Plus className="w-3.5 h-3.5" />
            New page
          </Button>
        </div>
      </aside>

      {pageActionDialogs}
    </>
  );
}
