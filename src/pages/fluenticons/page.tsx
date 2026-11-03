import ICONS from "@/components/ui/icon/fluent";
import { useOutletContext } from "react-router-dom";
import IconGrid from "@/components/ui/icon-grid";
import useMountEffect from "@/hooks/use-mount-effect";

interface OutletCtx {
  instanceName: string;
}

// Fluent UI icon gallery. These are the 24x24 color icons the app chrome,
// file types, and EmojiIcon overrides ship from. Each is a raw SVG string in
// the generated registry.
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

const FluentIconsPage = (): JSX.Element => {
  const { instanceName } = useOutletContext<OutletCtx>();

  useMountEffect(() => {
    document.title = `Fluent Icons | ${instanceName}`;
  });

  const names = Object.keys(ICONS);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-lg font-bold flex-1">Fluent Icons</h1>
        <span className="text-sm text-muted-foreground">{names.length} total</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <IconGrid
          items={names
            .map((name) => ({ key: name, label: name, src: buildDataUri(name) }))
            .filter((item) => item.src !== "")}
        />
      </div>
    </div>
  );
};

export default FluentIconsPage;
