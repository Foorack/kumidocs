import type { TicketData } from "@/lib/board";
import { useDraggable } from "@dnd-kit/core";
import type { CSSProperties, JSX } from "react";
import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";

// Shared card content

function CardContent({
  ticket,
  prefix,
  columnColor,
}: {
  ticket: TicketData;
  prefix: string;
  columnColor: string;
}): JSX.Element {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono text-background ps-3 pe-5"
          style={{ backgroundColor: columnColor }}
        >
          {prefix}-{ticket.id}
        </span>
      </div>

      <p className="leading-snug line-clamp-2 font-bold p-1 pb-0">{ticket.title}</p>

      {(ticket.assignee ?? ticket.reporter) !== undefined && (
        <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
          {ticket.assignee !== undefined && ticket.assignee !== "" && (
            <span
              className="flex items-center gap-1 truncate"
              title={`Assigned to ${emailToDisplayName(ticket.assignee)}`}
            >
              {emailToDisplayName(ticket.assignee)}
              <span className="text-muted-foreground/50 text-[10px]">→</span>
              <UserAvatar
                name={emailToDisplayName(ticket.assignee)}
                email={ticket.assignee}
                size="xs"
                outline={false}
              />
            </span>
          )}
          {ticket.reporter !== undefined && ticket.reporter !== "" && (
            <span className="truncate" title={`Reported by ${ticket.reporter}`}>
              {ticket.reporter}
            </span>
          )}
        </div>
      )}
    </>
  );
}

// Ticket card (draggable source)

interface TicketCardProps {
  ticket: TicketData;
  prefix: string;
  boardSlug: string;
  onClick: () => void;
  columnColor: string;
}

function TicketCard({
  ticket,
  prefix,
  boardSlug,
  onClick,
  columnColor,
}: TicketCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${boardSlug}/${ticket.id}`,
  });

  const style: CSSProperties = {
    borderColor: columnColor,
    opacity: isDragging ? 0 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="rounded-lg border-3 shadow-xs cursor-grab active:cursor-grabbing"
    >
      <button type="button" onClick={onClick} className="w-full text-left block">
        <CardContent ticket={ticket} prefix={prefix} columnColor={columnColor} />
      </button>
    </div>
  );
}

// Drag overlay card (rendered in portal)

interface DragOverlayCardProps {
  ticket: TicketData;
  prefix: string;
  columnColor: string;
}

function DragOverlayCard({ ticket, prefix, columnColor }: DragOverlayCardProps): JSX.Element {
  return (
    <div
      className="rounded-lg border-3 shadow-xl bg-background"
      style={{
        borderColor: columnColor,
        width: "var(--dnd-overlay-width, 288px)",
      }}
    >
      <div className="">
        <CardContent ticket={ticket} prefix={prefix} columnColor={columnColor} />
      </div>
    </div>
  );
}

export { CardContent, TicketCard, DragOverlayCard };
