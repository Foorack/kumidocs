import { EMOJI_SVGS, isEmojiDataLoaded, waitForEmojiData } from "@/client/emoji-loader";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import IconGrid from "@/components/ui/icon-grid";
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

const EmojiPage = (): JSX.Element => {
  const { instanceName } = useOutletContext<OutletCtx>();

  const [ready, setReady] = useState(isEmojiDataLoaded);

  useMountEffect(() => {
    document.title = `Emoji | ${instanceName}`;
    if (!ready) {
      void (async (): Promise<void> => {
        await waitForEmojiData();
        setReady(true);
      })();
    }
  });

  const entries = ready ? Object.entries(EMOJI_SVGS) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-lg font-bold flex-1">Emoji</h1>
        <span className="text-sm text-muted-foreground">{entries.length} total</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Loading emoji…</p>
        ) : (
          <IconGrid
            items={entries
              .map(([emoji]) => ({ key: emoji, label: emoji, src: buildDataUri(emoji) }))
              .filter((item) => item.src !== "")}
          />
        )}
      </div>
    </div>
  );
};

export default EmojiPage;
