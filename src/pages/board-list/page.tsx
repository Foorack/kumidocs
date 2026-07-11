import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { getAllTickets } from "@/lib/api";
import type { BoardTicketData } from "@/lib/api";
import { isArchived } from "@/lib/board";
import { TicketCard } from "@/pages/board/card";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/store/user";
import ArchiveButton from "@/components/ui/archive-button";

const HOME_COLUMNS = [
  { id: "created-by-me", label: "Created by me" },
  { id: "assigned-to-me", label: "Assigned to me" },
  { id: "bookmarked", label: "Bookmarked" },
] as const;

function BoardListPage(): JSX.Element {
  const { user } = useUser();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardTicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const userEmail = user?.email ?? user?.name ?? "";

  const loadAllBoards = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllTickets();
      setBoards(data);
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
    const createdByMe: Record<string, unknown>[] = [];
    const assignedToMe: Record<string, unknown>[] = [];
    const bookmarked: Record<string, unknown>[] = [];

    for (const board of boards) {
      for (const ticket of board.tickets) {
        if (
          !showArchived &&
          isArchived(
            typeof ticket.column === "string" ? ticket.column : undefined,
            typeof ticket.updatedAt === "string" ? ticket.updatedAt : undefined,
            board.columns,
          )
        ) {
          continue;
        }
        const colColor =
          board.columns.find((colDef) => colDef.id === ticket.column)?.color ?? "#6b7280";
        const enriched = { ...ticket, boardPrefix: board.boardPrefix, cardColor: colColor };
        if (ticket.reporter === userEmail) {
          createdByMe.push(enriched);
        }
        if (ticket.assignee === userEmail) {
          assignedToMe.push(enriched);
        }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        if (Array.isArray(ticket.bookmarks) && (ticket.bookmarks as string[]).includes(userEmail)) {
          bookmarked.push(enriched);
        }
      }
    }

    return [
      { column: HOME_COLUMNS[0], tickets: createdByMe },
      { column: HOME_COLUMNS[1], tickets: assignedToMe },
      { column: HOME_COLUMNS[2], tickets: bookmarked },
    ];
  }, [boards, userEmail, showArchived]);

  const totalTickets = columns.reduce((sum, col) => sum + col.tickets.length, 0);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-1 border-b border-border shrink-0">
        <div className="flex flex-col min-w-0">
          <h1 className="font-bold text-base truncate">Homeboard</h1>
          <div className="flex items-center gap-1 -mt-1">
            <span className="text-xs tabular-nums">
              {totalTickets} {totalTickets === 1 ? "ticket" : "tickets"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <ArchiveButton
            showArchived={showArchived}
            onToggle={() => {
              setShowArchived((prev) => !prev);
            }}
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {columns.map(({ column, tickets }) => (
          <div
            key={column.id}
            className="flex flex-col w-72 shrink-0 border-r first:border-l border-border"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" />
              <span className="font-bold text-sm uppercase tracking-wider">{column.label}</span>
              <span className="ml-auto text-xs tabular-nums">{tickets.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 px-2 py-2 min-h-[4rem]">
              {tickets.length === 0 && (
                <div className="px-1 py-6 text-center text-muted-foreground">No tickets</div>
              )}
              {tickets.map((ticket) => {
                const rec = ticket;
                const prefix = typeof rec.boardPrefix === "string" ? rec.boardPrefix : undefined;
                const slug = typeof rec.boardSlug === "string" ? rec.boardSlug : "";
                const tid = typeof rec.id === "string" ? rec.id : "";
                const cardColor = typeof rec.cardColor === "string" ? rec.cardColor : "#6b7280";
                return (
                  <TicketCard
                    key={`${slug}/${tid}`}
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
                    ticket={ticket as unknown as Parameters<typeof TicketCard>[0]["ticket"]}
                    prefix={prefix ?? slug}
                    boardSlug={slug}
                    columnColor={cardColor}
                    draggable={false}
                    onClick={() => {
                      void navigate(`/b/${slug}/${tid}`);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BoardListPage;
