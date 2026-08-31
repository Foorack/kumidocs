import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { getAllTickets } from "@/lib/api";
import type { BoardTicketData } from "@/lib/api";
import { isArchived } from "@/lib/board";
import { TicketCard } from "@/pages/board/card";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/store/user";
import useMountEffect from "@/hooks/use-mount-effect";
import BoardHeader from "@/components/layout/board-header";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import PageHeaderButton from "@/components/layout/page-header-button";

const HOME_COLUMNS = [
  { id: "recent", label: "Recent" },
  { id: "created-by-me", label: "Created by me" },
  { id: "assigned-to-me", label: "Assigned to me" },
  { id: "bookmarked", label: "Bookmarked" },
] as const;

// Cap on the Recent column so it stays a quick-glance list, not a full backlog.
const RECENT_LIMIT = 15;

function BoardListPage(): JSX.Element {
  const { user, instanceName } = useUser();
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

  // Set document title
  useMountEffect(() => {
    document.title = `Homeboard | ${instanceName}`;
  });

  const columns = useMemo(() => {
    const recent: Record<string, unknown>[] = [];
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
        recent.push(enriched);
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

    // Most recently updated tickets across all boards, newest first.
    const sortTime = (t: Record<string, unknown>): string =>
      (typeof t.updatedAt === "string" && t.updatedAt !== "" ? t.updatedAt : "") ||
      (typeof t.createdAt === "string" && t.createdAt !== "" ? t.createdAt : "") ||
      "";
    recent.sort((left, right) => sortTime(right).localeCompare(sortTime(left)));

    return [
      { column: HOME_COLUMNS[0], tickets: recent.slice(0, RECENT_LIMIT) },
      { column: HOME_COLUMNS[1], tickets: createdByMe },
      { column: HOME_COLUMNS[2], tickets: assignedToMe },
      { column: HOME_COLUMNS[3], tickets: bookmarked },
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
      <BoardHeader
        icon={<EmojiIcon fileType="home" size={24} />}
        title="Homeboard"
        subtitle={`${totalTickets} ${totalTickets === 1 ? "ticket" : "tickets"}`}
      >
        <PageHeaderButton
          fileType="archive"
          label="Archived"
          active={showArchived}
          grayscaleWhenInactive
          onClick={() => {
            setShowArchived((prev) => !prev);
          }}
        />
      </BoardHeader>

      <div className="flex-1 flex overflow-hidden">
        {columns.map(({ column, tickets }) => (
          <div
            key={column.id}
            className="flex flex-col w-72 shrink-0 border-r first:border-l border-border"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
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
