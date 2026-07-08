import type { BoardColumn, TicketData } from "@/lib/board";
import { DragOverlay } from "@dnd-kit/core";
import type { JSX } from "react";
import { DragOverlayCard } from "./card";

interface BoardOverlayProps {
  activeId: string | undefined;
  tickets: TicketData[];
  columns: BoardColumn[];
  prefix: string;
}

export default function BoardOverlay({
  activeId,
  tickets,
  columns,
  prefix,
}: BoardOverlayProps): JSX.Element {
  const activeTicket =
    activeId === undefined
      ? undefined
      : tickets.find((tic) => `${tic.boardSlug}/${tic.id}` === activeId);

  const activeTicketColor =
    activeTicket === undefined || columns.length === 0
      ? "#888"
      : (columns.find((col) => col.id === activeTicket.column)?.color ??
        columns[0]?.color ??
        "#888");

  return (
    <DragOverlay dropAnimation={undefined}>
      {activeTicket === undefined ? undefined : (
        <DragOverlayCard ticket={activeTicket} prefix={prefix} columnColor={activeTicketColor} />
      )}
    </DragOverlay>
  );
}
