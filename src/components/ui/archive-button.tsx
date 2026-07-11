import type { CSSProperties, JSX } from "react";
import { EmojiIcon } from "./emoji-icon";

interface ArchiveButtonProps {
  showArchived: boolean;
  onToggle: () => void;
  className?: string;
}

function ArchiveButton({
  showArchived,
  onToggle,
  className = "",
}: ArchiveButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${showArchived ? "bg-accent font-bold" : "hover:bg-accent/50"} ${className}`}
    >
      <EmojiIcon
        fileType="archive"
        size={18}
        style={showArchived ? {} : ({ filter: "grayscale(1)" } as CSSProperties)}
      />
      Archived
    </button>
  );
}

export default ArchiveButton;
