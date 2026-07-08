import type { BoardColumn, TicketData } from "@/lib/board";
import { displayColumnId } from "@/lib/board";
import { useDroppable } from "@dnd-kit/core";
import type { JSX } from "react";
import { TicketCard } from "./card";

interface ColumnProps {
  column: BoardColumn;
  tickets: TicketData[];
  prefix: string;
  boardSlug: string;
  onTicketClick: (ticket: TicketData) => void;
}

export default function BoardColumnView({
  column,
  tickets,
  prefix,
  boardSlug,
  onTicketClick,
}: ColumnProps): JSX.Element {
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `${boardSlug}/${column.id}`,
  });

  return (
    <div
      ref={dropRef}
      className="flex flex-col w-72 shrink-0 border-r first:border-l border-border transition-all duration-150"
      style={
        isOver
          ? {
              backgroundColor: `${column.color}33`,
              boxShadow: `inset 0 2px 0 ${column.color}`,
            }
          : undefined
      }
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: column.color }}
        />
        <span className="font-semibold uppercase tracking-wider">{displayColumnId(column.id)}</span>
        <span className="ml-auto text-xs tabular-nums">{tickets.length}</span>
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 px-2 py-2 min-h-[4rem]">
        {tickets.length === 0 && <div className="px-1 py-6 text-center">No tickets</div>}
        {tickets.map((ticket) => (
          <TicketCard
            key={`${boardSlug}/${ticket.id}`}
            ticket={ticket}
            prefix={prefix}
            boardSlug={boardSlug}
            columnColor={column.color}
            onClick={() => {
              onTicketClick(ticket);
            }}
          />
        ))}
      </div>
    </div>
  );
}
