import { useCallback, useEffect, useMemo, useState } from "react";
import { getTree, getFile } from "@/lib/api";
import { parseTicketYaml, yamlToBoard } from "@/lib/board";
import type { BoardConfig, TicketData } from "@/lib/board";
import { CardContent } from "@/pages/board/card";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/store/user";
import type { JSX } from "react";

interface BoardInfo {
  config: BoardConfig;
  slug: string;
  tickets: TicketData[];
}

const HOME_COLUMNS = [
  { color: "#1677ff", id: "created-by-me", label: "Created by me" },
  { color: "#52c41a", id: "assigned-to-me", label: "Assigned to me" },
  { color: "#faad14", id: "bookmarked", label: "Bookmarked" },
] as const;

function BoardListPage(): JSX.Element {
  const { user } = useUser();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const userEmail = user?.email ?? user?.name ?? "";

  const loadAllBoards = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const tree = await getTree();
      // Find all board config files (root-level .yaml files, e.g. "my-board.yaml")
      const boardConfigNodes = tree.filter(
        (node) => node.type === "file" && node.path.endsWith(".yaml") && !node.path.includes("/"),
      );

      const boardResults = await Promise.all(
        boardConfigNodes.map(async (configNode) => {
          const slug = configNode.name.replace(/\.yaml$/u, "");
          try {
            const configResp = await getFile(configNode.path);
            const config = await yamlToBoard(configResp.content);
            if (!config) {
              return undefined;
            }

            const boardDir = tree.find(
              (dirNode) => dirNode.type === "dir" && dirNode.name === slug,
            );
            const ticketNodes =
              boardDir?.children?.filter(
                (child) => child.type === "file" && child.path.endsWith(".yaml"),
              ) ?? [];

            const defaultColumnId = config.columns.find((col) => col.default === true)?.id ?? "";
            const tickets = await Promise.all(
              ticketNodes.map(async (node) => {
                const ticketId = node.name.replace(/\.yaml$/u, "");
                try {
                  const fileResp = await getFile(node.path);
                  return await parseTicketYaml(fileResp.content, slug, ticketId, defaultColumnId);
                } catch {
                  return {
                    boardSlug: slug,
                    column: defaultColumnId,
                    id: ticketId,
                    title: ticketId,
                  };
                }
              }),
            );

            return { config, slug, tickets };
          } catch {
            return undefined;
          }
        }),
      );

      setBoards(boardResults.filter((entry): entry is BoardInfo => entry !== undefined));
    } catch {
      setBoards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllBoards();
  }, [loadAllBoards]);

  const columns = useMemo(() => {
    const createdByMe: TicketData[] = [];
    const assignedToMe: TicketData[] = [];
    const bookmarked: TicketData[] = [];

    for (const board of boards) {
      for (const ticket of board.tickets) {
        const enriched = {
          ...ticket,
          boardName: board.config.name,
          boardPrefix: board.config.prefix,
        } as TicketData & { boardName: string; boardPrefix: string };

        if (ticket.reporter === userEmail) {
          createdByMe.push(enriched);
        }
        if (ticket.assignee === userEmail) {
          assignedToMe.push(enriched);
        }
        if (ticket.bookmarks?.includes(userEmail) === true) {
          bookmarked.push(enriched);
        }
      }
    }

    return [
      { column: HOME_COLUMNS[0], tickets: createdByMe },
      { column: HOME_COLUMNS[1], tickets: assignedToMe },
      { column: HOME_COLUMNS[2], tickets: bookmarked },
    ];
  }, [boards, userEmail]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {columns.map(({ column, tickets }) => (
        <div
          key={column.id}
          className="flex flex-col w-72 shrink-0 border-r first:border-l border-border"
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: column.color }}
            />
            <span className="font-bold text-sm uppercase tracking-wider">{column.label}</span>
            <span className="ml-auto text-xs tabular-nums">{tickets.length}</span>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto space-y-1.5 px-2 py-2 min-h-[4rem]">
            {tickets.length === 0 && (
              <div className="px-1 py-6 text-center text-muted-foreground">No tickets</div>
            )}
            {tickets.map((ticket) => {
              const ticketWithMeta = ticket as TicketData & {
                boardName?: string;
                boardPrefix?: string;
              };
              return (
                <div
                  key={`${ticket.boardSlug}/${ticket.id}`}
                  className="border rounded-md bg-card hover:bg-accent/50 cursor-pointer transition-colors overflow-hidden"
                  style={{ borderColor: column.color }}
                  onClick={() => {
                    void navigate(`/b/${ticket.boardSlug}/${ticket.id}`);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      void navigate(`/b/${ticket.boardSlug}/${ticket.id}`);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <CardContent
                    ticket={ticket}
                    prefix={ticketWithMeta.boardPrefix ?? ticket.boardSlug}
                    columnColor={column.color}
                  />
                  {/* Board name badge */}
                  {ticketWithMeta.boardName !== undefined && (
                    <div className="px-2 pb-1.5">
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {ticketWithMeta.boardName}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default BoardListPage;
