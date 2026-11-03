// Client-side Kumidraw icon resolution.
//
// Resolves a Kumidraw icon name (e.g. `:nginx`) to real Iconify artwork using
// the same icon packs Mermaid uses: devicon, logos, flag, fluent-color, and
// glyphs-poly. Packs load on demand through ./icon-packs, the first time a
// diagram with icons renders. Components subscribe so they redraw once the
// packs arrive.
//
// A bare name is looked up across the packs in a fixed order and the first
// match wins. Unknown names draw a plainly visible fallback. Ported from the
// Mermaid icon flow; must run in the browser only.

import { ICON_PACK_NAMES, loadIconPack } from "./icon-packs";
import type { IconPack } from "./icon-packs";

// Spec says the fallback must be plainly visible and visually distinct from
// every valid icon, so a missing name is obvious.
const FALLBACK_BODY =
  '<path fill="none" stroke="#94a3b8" stroke-width="3" d="M5 14a5 5 0 1 1 4-8 7 7 0 1 1 3 12H8" transform="translate(3 3)"/>';

// Packs are searched in this order so common tech/brand names resolve to
// their recognizable art first.
const PACK_PRIORITY = ["devicon", "logos", "fluent-color", "glyphs-poly", "flag"];

let packs: IconPack[] = [];
let iconsPromise: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** Build a complete SVG string from an Iconify icon body and pack dimensions. */
function bodyToSvg(body: string, pack: IconPack, size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pack.width} ${pack.height}" width="${size}" height="${size}">${body}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** Build a data URI for one icon in a loaded pack. */
function buildKumidrawIconDataUri(pack: IconPack, name: string, size: number): string | undefined {
  const body = pack.icons[name]?.body;
  if (body === undefined) {
    return undefined;
  }
  return bodyToSvg(body, pack, size);
}

/** The packs loaded so far; empty until loadKumidrawIcons resolves. */
function getKumidrawIconPacks(): IconPack[] {
  return packs;
}

/**
 * Load all icon packs. Safe to call multiple times; the load is idempotent.
 * Subscribers are notified once the packs are in.
 */
async function loadKumidrawIcons(): Promise<void> {
  iconsPromise ??= (async (): Promise<void> => {
    const loaded = await Promise.all(ICON_PACK_NAMES.map(async (name) => loadIconPack(name)));
    packs = loaded.filter((pack): pack is IconPack => pack !== undefined);
    for (const listener of listeners) {
      listener();
    }
  })();
  return iconsPromise;
}

/** Subscribe to pack loading. For useSyncExternalStore. */
function subscribeKumidrawIcons(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
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

export {
  buildKumidrawIconDataUri,
  getKumidrawIconPacks,
  loadKumidrawIcons,
  resolveKumidrawIconHref,
  subscribeKumidrawIcons,
};
