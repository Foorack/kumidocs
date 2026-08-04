// Client-side Kumidraw icon resolution.
//
// Resolves a Kumidraw icon name (e.g. `:nginx`) to real Iconify artwork using
// the same icon packs Mermaid already registers: devicon, logos, flag,
// fluent-color, and glyphs-poly. The pack data comes from /api/icons, is
// cached in IndexedDB (7-day TTL), and is loaded once at startup.
//
// A bare name is looked up across the packs in a fixed order and the first
// match wins. Unknown names draw a plainly visible fallback. Ported from the
// Mermaid icon flow; must run in the browser only.

import { idbGet, idbSet } from "./idb-cache";

const CACHE_KEY = "kumidraw-icons";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Spec says the fallback must be plainly visible and visually distinct from
// every valid icon, so a missing name is obvious.
const FALLBACK_BODY =
  '<path fill="none" stroke="#94a3b8" stroke-width="3" d="M5 14a5 5 0 1 1 4-8 7 7 0 1 1 3 12H8" transform="translate(3 3)"/>';

// Packs are searched in this order so common tech/brand names resolve to
// their recognizable art first.
const PACK_PRIORITY = ["devicon", "logos", "fluent-color", "glyphs-poly", "flag"];

interface IconPack {
  prefix: string;
  width: number;
  height: number;
  icons: Record<string, { body: string }>;
}

let packs: IconPack[] = [];
let iconsPromise: Promise<void> | undefined;

function parseIconText(text: string): IconPack[] {
  const results: IconPack[] = [];
  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }
    const semiIdx = line.indexOf(";");
    if (semiIdx === -1) {
      continue;
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    results.push(JSON.parse(line.slice(semiIdx + 1)) as IconPack);
  }
  return results;
}

/** Build a complete SVG string from an Iconify icon body and pack dimensions. */
function bodyToSvg(body: string, pack: IconPack, size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pack.width} ${pack.height}" width="${size}" height="${size}">${body}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Load the icon packs. Safe to call multiple times; the load is idempotent.
 * Returns a promise other code can await before first render if needed.
 */
async function loadKumidrawIcons(): Promise<void> {
  if (iconsPromise !== undefined) {
    return iconsPromise;
  }

  iconsPromise = (async (): Promise<void> => {
    const cached = await idbGet<IconPack[]>(CACHE_KEY);
    if (cached !== undefined && cached.length > 0) {
      packs = cached;
      return;
    }

    let text: string;
    try {
      const resp = await fetch("/api/icons");
      if (!resp.ok) {
        return;
      }
      text = await resp.text();
    } catch {
      return;
    }

    const loaded = parseIconText(text);
    if (loaded.length === 0) {
      return;
    }
    packs = loaded;

    // Store in IndexedDB (fire-and-forget).
    void idbSet(CACHE_KEY, loaded, CACHE_TTL_MS);
  })();

  return iconsPromise;
}

function colorFallback(size: number): string {
  return bodyToSvg(FALLBACK_BODY, { height: 24, icons: {}, prefix: "__fallback", width: 24 }, size);
}

/** Resolve an icon name to an SVG data URI, or the fallback if unknown. */
function resolveKumidrawIconHref(name: string, size: number): string {
  const lower = name.toLowerCase();
  for (const prefix of PACK_PRIORITY) {
    const pack = packs.find((p) => p.prefix === prefix);
    if (pack === undefined) {
      continue;
    }
    // Prefer an exact icon key, then a prefixed variant (e.g. `nginx` matches
    // devicon's `nginx` directly; `nginx-wordmark` is a separate entry).
    const entry = pack.icons[lower] ?? pack.icons[`${prefix}-${lower}`];
    if (entry === undefined) {
      continue;
    }
    return bodyToSvg(entry.body, pack, size);
  }
  return colorFallback(size);
}

export { loadKumidrawIcons, resolveKumidrawIconHref };
