import { EMOJI_SVGS } from "@/client/emoji-loader";
import { useOutletContext } from "react-router-dom";
import useMountEffect from "@/hooks/use-mount-effect";

interface OutletCtx {
  instanceName: string;
}

// Every emoji rendered as its bundled Fluent Emoji SVG. Browsers are fine
// rendering tens of thousands of tiny data URIs, and building the URI once
// per emoji here keeps the main EmojiIcon path from evicting its own cache.
const dataUriCache = new Map<string, string>();

function buildDataUri(emoji: string): string {
  let uri = dataUriCache.get(emoji);
  if (uri === undefined) {
    const svgText = EMOJI_SVGS[emoji];
    if (svgText !== undefined && svgText !== "") {
      uri = `data:image/svg+xml;base64,${btoa(svgText)}`;
      dataUriCache.set(emoji, uri);
    }
  }
  return uri ?? "";
}

const EmojisPage = (): JSX.Element => {
  const { instanceName } = useOutletContext<OutletCtx>();

  useMountEffect(() => {
    document.title = `Emojis | ${instanceName}`;
  });

  const entries = Object.entries(EMOJI_SVGS);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-lg font-bold flex-1">Emojis</h1>
        <span className="text-sm text-muted-foreground">{entries.length} total</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Loading emojis…</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,40px)] gap-px bg-border">
            {entries
              .map(([emoji]) => ({ emoji, src: buildDataUri(emoji) }))
              .filter((entry) => entry.src !== "")
              .map(({ emoji, src }) => (
                <div
                  key={emoji}
                  className="aspect-square bg-background flex items-center justify-center p-1"
                  title={emoji}
                >
                  <img src={src} alt={emoji} className="h-full w-full" />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmojisPage;
