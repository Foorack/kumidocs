import type { CSSProperties, JSX } from "react";
import { EmojiIcon } from "./emoji-icon";
import { Button } from "./button";

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
    <Button
      type="button"
      variant={showArchived ? "secondary" : "ghost"}
      size="sm"
      onClick={onToggle}
      className={`gap-1.5 text-xs ${showArchived ? "font-bold" : ""} ${className}`}
    >
      <EmojiIcon
        fileType="archive"
        size={18}
        style={showArchived ? {} : ({ filter: "grayscale(1)" } as CSSProperties)}
      />
      Archived
    </Button>
  );
}

export default ArchiveButton;
