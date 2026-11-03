import { memo, useState } from "react";

interface IconGridItem {
  key: string;
  src: string;
  label: string;
}

interface IconGridProps {
  items: IconGridItem[];
}

/**
 * Grid of small icons for the /emoji, /icons and /fluenticons galleries.
 *
 * Galleries hold thousands of SVGs. Each cell uses content-visibility: auto,
 * so the browser skips layout, paint and image decoding for cells that are
 * off screen. Without it, opening /icons froze the tab for over a minute.
 * That containment would clip a tooltip drawn below a cell, so the hovered
 * name shows in one sticky label above the grid instead.
 */
interface CellsProps extends IconGridProps {
  onHover: (label: string | undefined) => void;
}

const Cells = memo(({ items, onHover }: CellsProps): JSX.Element => (
  <div className="grid grid-cols-[repeat(auto-fill,40px)] gap-px bg-border">
    {items.map((item) => (
      <div
        key={item.key}
        className="icon-grid-cell aspect-square bg-background flex items-center justify-center p-1"
        title={item.label}
        onMouseEnter={() => {
          onHover(item.label);
        }}
        onMouseLeave={() => {
          onHover(undefined);
        }}
      >
        <img
          src={item.src}
          alt={item.label}
          loading="lazy"
          decoding="async"
          className="h-full w-full"
        />
      </div>
    ))}
  </div>
));
Cells.displayName = "IconGridCells";

function IconGrid({ items }: IconGridProps): JSX.Element {
  const [hovered, setHovered] = useState<string | undefined>();
  return (
    <>
      <div className="sticky top-0 z-10 bg-background px-1 pb-2 font-mono">
        {hovered ?? "Hover an icon to see its name"}
      </div>
      <Cells items={items} onHover={setHovered} />
    </>
  );
}

export type { IconGridItem };
export default IconGrid;
