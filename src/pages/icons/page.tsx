import {
  buildKumidrawIconDataUri,
  getKumidrawIconPacks,
  loadKumidrawIcons,
} from "@/client/kumidraw-icons";
import { useOutletContext } from "react-router-dom";
import IconGrid from "@/components/ui/icon-grid";
import type { IconGridItem } from "@/components/ui/icon-grid";
import useMountEffect from "@/hooks/use-mount-effect";
import { useState } from "react";

interface OutletCtx {
  instanceName: string;
}

const GRID_SIZE = 32;

// Mermaid / Iconify icon gallery. These are the tech-brand and flag icons
// available to Mermaid and Kumidraw diagrams via the `:name` syntax. The
// packs load asynchronously from /api/icons/:pack, so we trigger that on mount and
// re-render once the packs land.

// fluent-color ships every icon at several sizes (question-circle-16, -20,
// -24, -28, -32, -48...). Pick one representative per base name so the grid
// doesn't repeat each icon six times; prefer the standard 24px, else the
// size nearest to it. Names like `nginx` (no size suffix) are untouched.
function prefersSize(candidate: number, current: number): boolean {
  if (candidate === 24 && current !== 24) {
    return true;
  }
  return Math.abs(candidate - 24) < Math.abs(current - 24);
}

function collectIcons(): IconGridItem[] {
  const entries: IconGridItem[] = [];
  const sizeSuffix = /-(?<size>\d+)$/u;
  for (const pack of getKumidrawIconPacks()) {
    const byBase = new Map<string, { key: string; size: number; src: string }>();
    for (const name of Object.keys(pack.icons)) {
      const src = buildKumidrawIconDataUri(pack, name, GRID_SIZE);
      if (src === undefined) {
        continue;
      }
      const sizeMatch = sizeSuffix.exec(name);
      const size = sizeMatch === null ? 0 : Number(sizeMatch.groups?.size);
      const base = sizeMatch === null ? name : name.slice(0, sizeMatch.index);
      const key = `${pack.prefix}:${name}`;
      const existing = byBase.get(base);
      if (existing === undefined || prefersSize(size, existing.size)) {
        byBase.set(base, { key, size, src });
      }
    }
    for (const { key, src } of byBase.values()) {
      entries.push({ key, label: key, src });
    }
  }
  entries.sort((left, right) => left.key.localeCompare(right.key));
  return entries;
}

const IconsPage = (): JSX.Element => {
  const { instanceName } = useOutletContext<OutletCtx>();
  const [entries, setEntries] = useState<IconGridItem[]>([]);

  useMountEffect(() => {
    document.title = `Icons | ${instanceName}`;
    const load = async (): Promise<void> => {
      await loadKumidrawIcons();
      setEntries(collectIcons());
    };
    void load();
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-lg font-bold flex-1">Icons</h1>
        <span className="text-sm text-muted-foreground">{entries.length} total</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Loading icons…</p>
        ) : (
          <IconGrid items={entries} />
        )}
      </div>
    </div>
  );
};

export default IconsPage;
