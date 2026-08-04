import ICONS from "@/components/ui/icon/fluent";
import { useOutletContext } from "react-router-dom";
import useMountEffect from "@/hooks/use-mount-effect";

interface OutletCtx {
  instanceName: string;
}

// Render each icon as a data URI instead of inlining the SVG. Inlining tens
// of thousands of icons at once would let their gradient <defs> ids collide;
// an isolated <img> keeps every icon independent.
const dataUriCache = new Map<string, string>();

function buildDataUri(name: string): string {
  let uri = dataUriCache.get(name);
  if (uri === undefined) {
    const svg = ICONS[name];
    if (svg === undefined) {
      return "";
    }
    uri = `data:image/svg+xml;base64,${btoa(svg)}`;
    dataUriCache.set(name, uri);
  }
  return uri;
}

const IconsPage = (): JSX.Element => {
  const { instanceName } = useOutletContext<OutletCtx>();

  useMountEffect(() => {
    document.title = `Icons | ${instanceName}`;
  });

  const names = Object.keys(ICONS);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-lg font-bold flex-1">Icons</h1>
        <span className="text-sm text-muted-foreground">{names.length} total</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <div className="grid grid-cols-[repeat(auto-fill,40px)] gap-px bg-border">
          {names
            .map((name) => ({ name, src: buildDataUri(name) }))
            .filter((entry) => entry.src !== "")
            .map(({ name, src }) => (
              <div
                key={name}
                className="aspect-square bg-background flex items-center justify-center p-1 group relative"
                title={name}
              >
                <img src={src} alt={name} className="h-full w-full" />
                <span className="pointer-events-none absolute left-0 right-0 top-full z-10 hidden whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-xs font-bold text-popover-foreground shadow group-hover:block">
                  {name}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default IconsPage;
