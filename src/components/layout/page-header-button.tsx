import type { CSSProperties, JSX } from "react";
import type { FileType } from "@/lib/types";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import { Button } from "@/components/ui/button";

interface PageHeaderButtonProps {
  /** EmojiIcon fileType to render (e.g. "archive", "pageinfo", "toc"). */
  fileType: FileType;
  /** Button label text. */
  label: string;
  /** When true, uses "secondary" variant; when false uses "ghost". */
  active: boolean;
  onClick: () => void;
  /** When true, the icon is shown in grayscale when active is false. */
  grayscaleWhenInactive?: boolean;
  className?: string;
}

function PageHeaderButton({
  fileType,
  label,
  active,
  onClick,
  grayscaleWhenInactive = false,
  className = "",
}: PageHeaderButtonProps): JSX.Element {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className={`h-7 gap-1.5 text-xs ${active ? "font-bold" : ""} ${className}`}
    >
      <EmojiIcon
        fileType={fileType}
        size={18}
        style={
          grayscaleWhenInactive && !active
            ? ({ filter: "grayscale(1)" } as CSSProperties)
            : undefined
        }
      />
      {label}
    </Button>
  );
}

export default PageHeaderButton;
