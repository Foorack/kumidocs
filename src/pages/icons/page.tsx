import {
  buildKumidrawIconDataUri,
  getKumidrawIconPacks,
  loadKumidrawIcons,
} from "@/client/kumidraw-icons";
import { useOutletContext } from "react-router-dom";
import useMountEffect from "@/hooks/use-mount-effect";
import { useState } from "react";

interface OutletCtx {
  instanceName: string;
}

const GRID_SIZE = 32;

// Mermaid / Iconify icon gallery. These are the tech-brand and flag icons
// available to Mermaid and Kumidraw diagrams via the `:name` syntax. The
// packs load asynchronously from /api/icons, so we trigger that on mount and
// re-render once the packs land.
interface IconEntry {
  key: string;
  src: string;
}

function collectIcons(): IconEntry[] {
  const entries: IconEntry[] = [];
  for (const pack of getKumidrawIconPacks()) {
    for (const name of Object.keys(pack.icons)) {
      const src = buildKumidrawIconDataUri(pack, name, GRID_SIZE);
      if (src !== undefined) {
        entries.push({ key: `${pack.prefix}:${name}`, src });
      }
    }
  }
  entries.sort((left, right) => left.key.localeCompare(right.key));
  return entries;
}

const IconsPage = (): JSX.Element => {
  const { instanceName } = useOutletContext<OutletCtx>();
  const [entries, setEntries] = useState<IconEntry[]>([]);

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
          <div className="grid grid-cols-[repeat(auto-fill,40px)] gap-px bg-border">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="aspect-square bg-background flex items-center justify-center p-1 group relative"
                title={entry.key}
              >
                <img src={entry.src} alt={entry.key} className="h-full w-full" />
                <span className="pointer-events-none absolute left-0 right-0 top-full z-10 hidden whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-xs font-bold text-popover-foreground shadow group-hover:block">
                  {entry.key}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IconsPage;
