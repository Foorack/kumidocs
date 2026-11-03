/**
 * The full emoji set: fetched from /api/emojis on first use, cached in
 * IndexedDB (7-day TTL). Only the emoji picker and the /emoji page need it.
 * Everything else renders single emoji from /api/emoji/:key (see EmojiIcon).
 *
 * The server gzips responses; the browser handles decompression.
 *
 * Format: one entry per line:
 *   <emoji_char>;<minified_svg_text>
 * Split on the first semicolon only - SVG content may contain semicolons.
 */

import { idbGet, idbSet } from "./idb-cache";

const CACHE_KEY = "emoji-svgs";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const EMOJI_SVGS: Record<string, string> = {};

function parseEmojiText(text: string): Record<string, string> {
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
  return map;
}

async function loadEmojiData(): Promise<void> {
  // Try IndexedDB cache first.
  const cached = await idbGet<Record<string, string>>(CACHE_KEY);
  if (cached !== undefined) {
    Object.assign(EMOJI_SVGS, cached);
    return;
  }

  // Fall back to fetch.
  try {
    const resp: Response = await fetch("/api/emojis");
    if (!resp.ok) {
      console.error("Failed to load emoji data:", String(resp.status));
      return;
    }
    const text: string = await resp.text();
    const map = parseEmojiText(text);
    Object.assign(EMOJI_SVGS, map);

    // Store in IndexedDB (fire-and-forget).
    void idbSet(CACHE_KEY, map, CACHE_TTL_MS);
  } catch (error: unknown) {
    console.error("Failed to load emoji data:", error);
  }
}

let loadPromise: Promise<void> | undefined;

/** Get the SVG text for an emoji character. Returns undefined if not loaded yet. */
function getEmojiSvg(native: string): string | undefined {
  return EMOJI_SVGS[native];
}

/** True once emoji data has been loaded and parsed. */
function isEmojiDataLoaded(): boolean {
  return Object.keys(EMOJI_SVGS).length > 0;
}

/** Load the full emoji set (once) and wait for it. */
// oxlint-disable-next-line typescript/promise-function-async
function waitForEmojiData(): Promise<void> {
  loadPromise ??= loadEmojiData();
  return loadPromise;
}

export { EMOJI_SVGS, getEmojiSvg, isEmojiDataLoaded, waitForEmojiData };
