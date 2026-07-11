import type { TicketData } from "@/lib/board";
import { useDraggable } from "@dnd-kit/core";
import type { CSSProperties, JSX } from "react";
import { UserAvatar } from "@/components/ui/avatar";
import { emailToDisplayName } from "@/lib/avatar";
import { relativeTime } from "@/lib/utils";

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
  const showFooter =
    ticket.createdAt !== undefined ||
    ticket.updatedAt !== undefined ||
    ticket.reporter !== undefined ||
    ticket.assignee !== undefined;

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

      {showFooter && (
        <div className="flex items-stretch gap-0.5 px-1.5 pt-0.5 pb-1.5">
          {/* Left avatar outside */}
          {ticket.reporter !== undefined && ticket.reporter !== "" ? (
            <div className="flex items-center shrink-0">
              <UserAvatar
                name={emailToDisplayName(ticket.reporter)}
                email={ticket.reporter}
                size="md"
              />
            </div>
          ) : (
            <div className="w-7 shrink-0" />
          )}

          {/* Table without outer edges */}
          <div className="flex-1 min-w-0">
            {/* Top row: dates */}
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="text-[10px] truncate px-1.5 py-0.5 text-left">
                {relativeTime(ticket.createdAt)}
              </div>
              <div className="text-[10px] truncate px-1.5 py-0.5 text-right">
                {relativeTime(ticket.updatedAt)}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Bottom row: names */}
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="text-[11px] truncate px-1.5 py-0.5 text-left">
                {ticket.reporter !== undefined && ticket.reporter !== "" ? ticket.reporter : ""}
              </div>
              <div className="text-[11px] truncate px-1.5 py-0.5 text-right">
                {ticket.assignee !== undefined && ticket.assignee !== "" ? ticket.assignee : ""}
              </div>
            </div>
          </div>

          {/* Right avatar outside */}
          {ticket.assignee !== undefined && ticket.assignee !== "" ? (
            <div className="flex items-center shrink-0">
              <UserAvatar
                name={emailToDisplayName(ticket.assignee)}
                email={ticket.assignee}
                size="md"
              />
            </div>
          ) : (
            <div className="w-7 shrink-0" />
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
  /** When false, renders a static card without drag-and-drop. Default true. */
  draggable?: boolean;
}

function TicketCard({
  ticket,
  prefix,
  boardSlug,
  onClick,
  columnColor,
  draggable = true,
}: TicketCardProps): JSX.Element {
  // Always call the hook (rule of hooks), but use a unique id per boardSlug/ticket
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    disabled: !draggable,
    id: draggable ? `${boardSlug}/${ticket.id}` : `static-${boardSlug}/${ticket.id}`,
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
      onClick={onClick}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onClick();
        }
      }}
      className={`rounded-lg border-3 shadow-xs cursor-pointer active:cursor-grabbing ${ticket.golden === true ? "ticket-golden" : ""}`}
      role="button"
      tabIndex={0}
    >
      <CardContent ticket={ticket} prefix={prefix} columnColor={columnColor} />
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
  const style: CSSProperties = {
    borderColor: columnColor,
    width: "var(--dnd-overlay-width, 288px)",
  };

  return (
    <div
      className={`rounded-lg border-3 shadow-xl ${ticket.golden === true ? "ticket-golden" : ""}`}
      style={style}
    >
      <CardContent ticket={ticket} prefix={prefix} columnColor={columnColor} />
    </div>
  );
}

export { CardContent, TicketCard, DragOverlayCard };
