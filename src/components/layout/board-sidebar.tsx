import { Plus } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import type { TreeNode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useMountEffect from "@/hooks/use-mount-effect";
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
    body = <div className="px-3 py-4 text-center">Loading...</div>;
  } else if (boardEntries.length === 0) {
    body = <div className="px-3 py-4 text-center">No boards yet.</div>;
  } else if (sortedTickets.length === 0) {
    body = (
      <div className="px-3 py-4 text-center">
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
              className={`w-full text-left px-3 py-1.5 rounded transition-colors flex items-center gap-2 ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "hover:text-foreground hover:bg-accent/50"
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
      {boardEntries.length > 0 && (
        <div className="px-2 pb-2">
          <Select
            value={selectedBoardSlug ?? ""}
            onValueChange={(val: string) => {
              if (val === "") {
                setSelectedBoardSlug(undefined);
                navigate("/b/");
              } else {
                setSelectedBoardSlug(val);
                navigate(`/b/${val}`);
                try {
                  localStorage.setItem("kumidocs:last-ticket-board", val);
                } catch {
                  // localStorage may be unavailable
                }
              }
            }}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="All boards" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All boards</SelectItem>
              {boardEntries.map((entry) => (
                <SelectItem key={entry.slug} value={entry.slug}>
                  {entry.config.icon !== undefined && entry.config.icon !== ""
                    ? `${entry.config.icon} `
                    : ""}
                  {entry.config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {body}
    </div>
  );
}

interface BoardSidebarProps {
  tree: TreeNode[];
  reloadTree: () => void;
}

export default function BoardSidebar({ tree, reloadTree }: BoardSidebarProps): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [boardConfigs, setBoardConfigs] = useState<Map<string, BoardConfig>>(new Map());
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const currentBoardSlug = useMemo<string | undefined>(() => {
    const re = /^\/b\/(?<slug>[^/]+)/u;
    const result = re.exec(location.pathname);
    return result?.groups?.slug ?? undefined;
  }, [location.pathname]);

  const [selectedBoardSlug, setSelectedBoardSlug] = useState<string | undefined>(currentBoardSlug);
  const effectiveBoardSlug = selectedBoardSlug ?? currentBoardSlug;

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      setBoardLoading(true);
      const boardYamlNodes = tree.filter(
        (node) => node.type === "file" && node.path.endsWith(".yaml") && !node.path.includes("/"),
      );

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
  }, [tree]);

  const visibleTickets = useMemo<TicketData[]>(() => {
    if (effectiveBoardSlug === undefined) {
      return tickets;
    }
    return tickets.filter((ticket) => ticket.boardSlug === effectiveBoardSlug);
  }, [tickets, effectiveBoardSlug]);

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

  const boardEntries = useMemo<{ slug: string; config: BoardConfig }[]>(
    () =>
      [...boardConfigs.entries()]
        .map(([slug, config]) => ({ config, slug }))
        .toSorted((left, right) => left.config.name.localeCompare(right.config.name)),
    [boardConfigs],
  );

  const boardNameMap = useMemo<Map<string, string>>(
    () => new Map([...boardConfigs.entries()].map(([slug, config]) => [slug, config.name])),
    [boardConfigs],
  );

  const boardColumnsMap = useMemo<Map<string, BoardColumn[]>>(
    () => new Map([...boardConfigs.entries()].map(([slug, config]) => [slug, config.columns])),
    [boardConfigs],
  );

  const defaultNewTicketBoard = useMemo<string | undefined>(() => {
    if (effectiveBoardSlug !== undefined) {
      return effectiveBoardSlug;
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
  }, [effectiveBoardSlug, boardConfigs, boardEntries]);

  const hasTickets = boardEntries.length > 0;
  const hasTicketsRef = useRef(hasTickets);
  hasTicketsRef.current = hasTickets;

  useMountEffect(() => {
    const handler = (ev: KeyboardEvent): void => {
      if (!hasTicketsRef.current) {
        return;
      }
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
  });

  return (
    <>
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

      {hasTickets && (
        <div className="p-2 border-t border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5 hover:text-foreground h-7"
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
