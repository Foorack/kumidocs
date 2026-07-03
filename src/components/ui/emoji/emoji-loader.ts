/**
 * Fetches emoji SVG data from /api/emojis (gzip-compressed, auto-decompressed
 * by the browser) and provides it as a Record<emoji, data URI> for <img> tags.
 *
 * Uses base64 data URIs instead of Blob URLs so CSP (img-src 'self' https: http: data:)
 * doesn't block them.
 *
 * The fetch starts at module init time (ASAP). Until it resolves, lookups
 * return undefined -- consumers fall back to native emoji text rendering.
 */

const EMOJI_SVGS: Record<string, string> = {};
let loaded = false;

async function init(): Promise<void> {
  try {
    const resp = await fetch("/api/emojis");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    for (const line of text.split("\n")) {
      if (!line) continue;
      const semiIdx = line.indexOf(";");
      if (semiIdx === -1) continue;
      const emoji = line.slice(0, semiIdx);
      const svg = line.slice(semiIdx + 1);
      EMOJI_SVGS[emoji] = `data:image/svg+xml;base64,${btoa(svg)}`;
    }
  } catch {
    // If the fetch fails, emojis just fall back to native text rendering.
  }
  loaded = true;
}

// Start fetching immediately at module init time.
void init();

export { EMOJI_SVGS };
export default EMOJI_SVGS;
