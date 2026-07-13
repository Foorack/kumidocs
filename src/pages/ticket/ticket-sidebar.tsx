import type { BoardColumn } from "@/lib/board";
import cn from "@/lib/utils";
import { displayColumnId } from "@/lib/board";
import { Button } from "@/components/ui/button";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import Separator from "@/components/ui/separator";
import type { ComponentProps, CSSProperties, JSX } from "react";

// Sidebar row button with consistent sizing and hover/active styling.

function TicketSidebarButton({
  active,
  disabled,
  className,
  ...props
}: ComponentProps<typeof Button> & { active?: boolean; disabled?: boolean }): JSX.Element {
  let stateClass = "";
  if (disabled === true) {
    stateClass = "pointer-events-none";
  } else if (active === true) {
    stateClass = "bg-accent text-accent-foreground";
  }
  return (
    <Button
      variant="ghost"
      className={cn("w-full justify-start gap-2 px-2 h-7 text-sm font-normal disabled:opacity-100", stateClass, className)}
      {...props}
    />
  );
}

interface TicketSidebarProps {
  columns: BoardColumn[];
  activeColumn: string;
  showEditControls: boolean;
  onColumnChange: (columnId: string) => void;
  columnColor: string;
  golden: boolean;
  onGoldenToggle: () => void;
  bookmarked: boolean;
  onBookmarkToggle: () => void;
}

function TicketSidebar({
  columns,
  activeColumn,
  showEditControls,
  onColumnChange,
  columnColor,
  golden,
  onGoldenToggle,
  bookmarked,
  onBookmarkToggle,
}: TicketSidebarProps): JSX.Element {
  const goldenIconStyle: CSSProperties = golden ? {} : { filter: "grayscale(1)" };
  const bookmarkIconStyle: CSSProperties = bookmarked ? {} : { filter: "grayscale(1)" };

  return (
    <div className="w-52 shrink-0 border-l p-3 space-y-2" style={{ borderColor: columnColor }}>
      <h3 className="text-sm font-bold uppercase tracking-wider">Status</h3>
      <div className="space-y-0.5">
        {columns.length === 0 && <p>No columns</p>}
        {(showEditControls ? columns : columns.filter((col) => col.id === activeColumn)).map(
          (col) => (
            <TicketSidebarButton
              key={col.id}
              active={activeColumn === col.id}
              disabled={!showEditControls}
              onClick={() => {
                onColumnChange(col.id);
              }}
            >
              <span
                className="px-2.5 w-3 h-3 rounded-full shrink-0 ring-1 ring-black/10"
                style={{ backgroundColor: col.color }}
              />
              <span>{displayColumnId(col.id)}</span>
            </TicketSidebarButton>
          ),
        )}
      </div>

      <Separator className="my-3" />

      <h3 className="text-sm font-bold uppercase tracking-wider">Actions</h3>
      <div className="space-y-0.5">
        <TicketSidebarButton
          active={golden}
          disabled={!showEditControls}
          onClick={onGoldenToggle}
          className={cn(golden && "font-bold")}
        >
          <EmojiIcon fileType="golden" size={20} style={goldenIconStyle} />
          <span>{golden ? "Golden" : "Regular"}</span>
        </TicketSidebarButton>
        <TicketSidebarButton
          active={bookmarked}
          disabled={!showEditControls}
          onClick={onBookmarkToggle}
          className={cn(bookmarked && "font-bold")}
        >
          <EmojiIcon fileType="bookmark" size={20} style={bookmarkIconStyle} />
          <span>{bookmarked ? "Bookmarked" : "Bookmark"}</span>
        </TicketSidebarButton>
      </div>
    </div>
  );
}

export default TicketSidebar;
