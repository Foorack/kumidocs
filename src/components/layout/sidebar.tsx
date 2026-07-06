import { BookOpen, FileText, Image, Layers, MoreHorizontal, Plus } from "lucide-react";
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
import { Kbd } from "@/components/ui/kbd";
import type { PresenceUser, TreeNode } from "@/lib/types";
import buildPageTree from "@/lib/page-tree";
import { Button } from "@/components/ui/button";
import PageNodeRow from "./sidebar-page-node";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import usePageActions from "@/hooks/use-page-actions";
import { useUser } from "@/store/user";
import { getFile } from "@/lib/api";
import type { BoardColumn, BoardConfig, TicketData } from "@/lib/board";
import { displayColumnId, parseTicketYaml, yamlToBoard } from "@/lib/board";
import TicketDialog from "@/components/dialogs/ticket-dialog";

interface BoardSidebarContentProps {
  boardConfigs: Map<string, BoardConfig>;
  boardLoading: boolean;
  boardEntries: { slug: string; config: BoardConfig }[];
  sortedTickets: TicketData[];
  selectedBoardSlug: string | undefined;
  setSelectedBoardSlug: (slug: string | undefined) => void;
  // oxlint-disable-next-line typescript/prefer-parameter-properties
  navigate: (path: string) => void;
  location: { pathname: string };
}

function BoardSidebarContent({
  boardConfigs,
  boardLoading,
  boardEntries,
  sortedTickets,
  selectedBoardSlug,
  setSelectedBoardSlug,
  navigate,
  location,
}: BoardSidebarContentProps): JSX.Element {
  let body: JSX.Element;
  if (boardLoading) {
    body = <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading...</div>;
  } else if (boardEntries.length === 0) {
    body = <div className="px-3 py-4 text-xs text-foreground text-center">No boards yet.</div>;
  } else if (sortedTickets.length === 0) {
    body = (
      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
        {selectedBoardSlug === undefined ? "No tickets yet." : "No tickets in this board."}
      </div>
    );
  } else {
    body = (
      <div className="space-y-0.5">
        {sortedTickets.map((ticket) => {
          const config = boardConfigs.get(ticket.boardSlug);
          const prefix = config?.prefix ?? ticket.boardSlug.toUpperCase();
          const label = `${prefix}-${ticket.id}`;
          const isActive = location.pathname === `/b/${ticket.boardSlug}/${ticket.id}`;
          const columnColor =
            ticket.column === ""
              ? undefined
              : (config?.columns.find(
                  (col) =>
                    col.id === ticket.column ||
                    displayColumnId(col.id) === displayColumnId(ticket.column),
                )?.color ?? undefined);

          return (
            <button
              key={`${ticket.boardSlug}/${ticket.id}`}
              type="button"
              onClick={() => {
                navigate(`/b/${ticket.boardSlug}/${ticket.id}`);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-2 ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {columnColor === undefined ? undefined : (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: columnColor }}
                />
              )}
              <span className="font-medium shrink-0">{label}</span>
              <span className="truncate min-w-0">{ticket.title}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 py-2 space-y-0.5">
      {/* Board selector */}
      <div className="px-2 pb-2">
        <select
          className="w-full h-8 text-xs rounded border border-border bg-transparent text-foreground px-1.5 appearance-none cursor-pointer"
          value={selectedBoardSlug ?? ""}
          onChange={(ev) => {
            const val = ev.target.value;
            if (val === "") {
              setSelectedBoardSlug(undefined);
              navigate("/b/");
            } else {
              setSelectedBoardSlug(val);
              navigate(`/b/${val}`);
            }
          }}
        >
          <option value="">All boards</option>
          {boardEntries.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.config.name}
            </option>
          ))}
        </select>
      </div>

      {body}
    </div>
  );
}

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
  const { user: currentUser, sidebarDefaultDepth, mode } = useUser();
  const navigate = useNavigate();
  const { openMove, openDelete, dialogs: pageActionDialogs } = usePageActions(reloadTree);

  const handleOpenMove = useCallback(
    async (path: string): Promise<void> => {
      try {
        await openMove(path);
      } catch (error: unknown) {
        console.error("Failed to open move dialog:", error);
      }
    },
    [openMove],
  );

  // Board mode state
  const location = useLocation();
  const [boardConfigs, setBoardConfigs] = useState<Map<string, BoardConfig>>(new Map());
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  // Derive current board from URL path
  const currentBoardSlug = useMemo<string | undefined>(() => {
    const re = /^\/b\/(?<slug>[^/]+)/u;
    const result = re.exec(location.pathname);
    return result?.groups?.slug ?? undefined;
  }, [location.pathname]);

  // Selected board in the sidebar dropdown
  const [selectedBoardSlug, setSelectedBoardSlug] = useState<string | undefined>(undefined);

  // Sync dropdown selection with URL navigation
  useEffect(() => {
    setSelectedBoardSlug(currentBoardSlug);
  }, [currentBoardSlug]);

  // Load boards and tickets from tree whenever it changes (board mode only)
  useEffect(() => {
    if (mode !== "board") {
      return;
    }

    const loadData = async (): Promise<void> => {
      setBoardLoading(true);
      const boardYamlNodes = tree.filter(
        (node) => node.type === "file" && node.path.endsWith(".yaml") && !node.path.includes("/"),
      );

      // Load board configs in parallel
      const configs = new Map<string, BoardConfig>();
      const boardResults = await Promise.all(
        boardYamlNodes.map(async (node) => {
          const slug = node.path.replace(/\.yaml$/u, "");
          try {
            const resp = await getFile(node.path);
            const config = await yamlToBoard(resp.content);
            if (config) {
              return { config, slug } as const;
            }
          } catch {
            // skip invalid yaml
          }
          return undefined;
        }),
      );
      for (const result of boardResults) {
        if (result) {
          configs.set(result.slug, result.config);
        }
      }
      setBoardConfigs(configs);

      // Load tickets from board directories in parallel
      const allTickets: TicketData[] = [];
      const boardDirs = tree.filter((node) => node.type === "dir");
      const ticketResults = await Promise.all(
        boardDirs.flatMap((dir) => {
          const boardSlug = dir.name;
          if (!configs.has(boardSlug)) {
            return [];
          }
          const ticketNodes =
            dir.children?.filter(
              (child) => child.type === "file" && child.path.endsWith(".yaml"),
            ) ?? [];
          return ticketNodes.map(async (ticketNode) => {
            const ticketId = ticketNode.name.replace(/\.yaml$/u, "");
            try {
              const resp = await getFile(ticketNode.path);
              const data = await parseTicketYaml(resp.content, boardSlug, ticketId);
              return data;
            } catch {
              return { boardSlug, column: "", id: ticketId, title: ticketId };
            }
          });
        }),
      );
      allTickets.push(...ticketResults);
      setTickets(allTickets);
      setBoardLoading(false);
    };

    void loadData();
  }, [tree, mode]);

  // Filter tickets based on selected board
  const visibleTickets = useMemo<TicketData[]>(() => {
    if (selectedBoardSlug === undefined) {
      return tickets;
    }
    return tickets.filter((ticket) => ticket.boardSlug === selectedBoardSlug);
  }, [tickets, selectedBoardSlug]);

  // Sort tickets by id (numeric)
  const sortedTickets = useMemo<TicketData[]>(
    () =>
      visibleTickets.toSorted((left, right) => {
        const an = Number(left.id);
        const bn = Number(right.id);
        if (!Number.isNaN(an) && !Number.isNaN(bn)) {
          return an - bn;
        }
        return left.id.localeCompare(right.id);
      }),
    [visibleTickets],
  );

  // Sorted board entries for the dropdown
  const boardEntries = useMemo<{ slug: string; config: BoardConfig }[]>(
    () =>
      [...boardConfigs.entries()]
        .map(([slug, config]) => ({ config, slug }))
        .toSorted((left, right) => left.config.name.localeCompare(right.config.name)),
    [boardConfigs],
  );

  // Board name map for the new ticket dialog
  const boardNameMap = useMemo<Map<string, string>>(
    () => new Map([...boardConfigs.entries()].map(([slug, config]) => [slug, config.name])),
    [boardConfigs],
  );

  // Board columns map for the ticket dialog status picker
  const boardColumnsMap = useMemo<Map<string, BoardColumn[]>>(
    () => new Map([...boardConfigs.entries()].map(([slug, config]) => [slug, config.columns])),
    [boardConfigs],
  );

  // Default board for new ticket dialog: selected > localStorage > first alphabetically
  const defaultNewTicketBoard = useMemo<string | undefined>(() => {
    if (selectedBoardSlug !== undefined) {
      return selectedBoardSlug;
    }
    const stored = ((): string | undefined => {
      try {
        const val = localStorage.getItem("kumidocs:last-ticket-board");
        return val ?? undefined;
      } catch {
        return undefined;
      }
    })();
    if (stored !== undefined && boardConfigs.has(stored)) {
      return stored;
    }
    if (boardEntries.length > 0) {
      const firstEntry = boardEntries[0];
      if (firstEntry !== undefined) {
        return firstEntry.slug;
      }
      return undefined;
    }
    return undefined;
  }, [selectedBoardSlug, boardConfigs, boardEntries]);

  // Persist selected board to localStorage when it changes
  useEffect(() => {
    if (selectedBoardSlug !== undefined) {
      try {
        localStorage.setItem("kumidocs:last-ticket-board", selectedBoardSlug);
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [selectedBoardSlug]);

  // n key opens new ticket dialog (board mode only, not when typing in an input)
  useEffect(() => {
    if (mode !== "board" || boardEntries.length === 0) {
      return undefined;
    }
    const handler = (ev: KeyboardEvent): void => {
      if (ev.key === "n" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        const target = ev.target;
        const tag = target instanceof Element ? target.tagName : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
          return;
        }
        ev.preventDefault();
        setNewTicketOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return (): void => {
      window.removeEventListener("keydown", handler);
    };
  }, [mode, boardEntries.length]);

  return (
    <>
      <aside
        className="shrink-0 border-r border-border bg-sidebar flex flex-col h-full overflow-hidden"
        style={{ width }}
      >
        {/* Pages header */}
        <div className="flex items-center px-3 py-2.5 border-b border-border shrink-0">
          <span className="flex-1 text-sm pt-1 font-semibold text-foreground uppercase tracking-wide select-none">
            {mode === "board" ? "Boards" : "Pages"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                title="Options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {mode === "board" ? (
                <DropdownMenuItem
                  onClick={() => {
                    void navigate("/bm");
                  }}
                >
                  <Layers className="mr-2 w-4 h-4" />
                  Board manager
                </DropdownMenuItem>
              ) : (
                <>
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
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {mode === "board" ? (
          <BoardSidebarContent
            boardConfigs={boardConfigs}
            boardLoading={boardLoading}
            boardEntries={boardEntries}
            sortedTickets={sortedTickets}
            selectedBoardSlug={selectedBoardSlug}
            setSelectedBoardSlug={setSelectedBoardSlug}
            navigate={navigate}
            location={location}
          />
        ) : (
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
        )}

        {mode === "board" && boardEntries.length > 0 && (
          <div className="p-2 border-t border-border shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
              onClick={() => {
                setNewTicketOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">New ticket</span>
              <Kbd>n</Kbd>
            </Button>
          </div>
        )}
        {mode === "docs" && (
          <div className="p-2 border-t border-border shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
              onClick={() => {
                onNewPage();
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              New page
            </Button>
          </div>
        )}
      </aside>

      {pageActionDialogs}

      <TicketDialog
        open={newTicketOpen}
        onClose={() => {
          setNewTicketOpen(false);
        }}
        boards={boardNameMap}
        boardColumns={boardColumnsMap}
        initialBoardSlug={defaultNewTicketBoard}
        onCreated={reloadTree}
      />
    </>
  );
}
