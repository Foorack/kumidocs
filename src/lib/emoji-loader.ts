/**
 * emoji-loader.ts -- fetches the emoji data from /api/emojis at startup and
 * parses the text format into an emoji -> SVG text lookup.
 *
 * The server API gzips on-the-fly; the browser auto-decompresses via
 * Content-Encoding: gzip, so no manual decompression needed here.
 *
 * Format: one entry per line:
 *   <emoji_char>;<minified_svg_text>
 * Split on the FIRST semicolon only -- SVG content may contain semicolons.
 */

const EMOJI_SVGS: Record<string, string> = {};

async function loadEmojiData(): Promise<void> {
  try {
    const resp: Response = await fetch("/api/emojis");
    if (!resp.ok) {
      console.error("Failed to load emoji data:", String(resp.status));
      return;
    }
    const text: string = await resp.text();

    // oxlint-disable-next-line typescript/no-unsafe-assignment
    const map: Record<string, string> = Object.create(null);
    for (const line of text.split("\n")) {
      if (line === "") {
        continue;
      }
      // oxlint-disable-next-line unicorn/consistent-existence-index-check
      const semiIdx = line.indexOf(";");
      if (semiIdx === -1) {
        continue;
      }
      const emoji = line.slice(0, semiIdx);
      const svgText = line.slice(semiIdx + 1);
      map[emoji] = svgText;
    }
    Object.assign(EMOJI_SVGS, map);
  } catch (error: unknown) {
    console.error("Failed to load emoji data:", error);
  }
}

// Kick off the fetch immediately on module import.
// oxlint-disable-next-line unicorn/prefer-top-level-await
const loadPromise: Promise<void> = loadEmojiData();

/** Get the SVG text for an emoji character. Returns undefined if not loaded yet. */
function getEmojiSvg(native: string): string | undefined {
  return EMOJI_SVGS[native];
}

/** True once emoji data has been loaded and parsed. */
function isEmojiDataLoaded(): boolean {
  return Object.keys(EMOJI_SVGS).length > 0;
}

/** Wait for emoji data to be loaded. Useful for the picker or eager init. */
// oxlint-disable-next-line typescript/promise-function-async
function waitForEmojiData(): Promise<void> {
  return loadPromise;
}

export { EMOJI_SVGS, getEmojiSvg, isEmojiDataLoaded, waitForEmojiData };
