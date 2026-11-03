/**
 * Iconify icon packs, loaded one at a time on demand from /api/icons/:pack.
 *
 * Mermaid and Kumidraw both draw from these packs. Each pack is fetched at
 * most once per page load and cached in IndexedDB (7-day TTL), so a page
 * without icon diagrams never downloads any of them.
 */

import { idbDelete, idbGet, idbSet } from "./idb-cache";

const ICON_PACK_NAMES = ["devicon", "flag", "fluent-color", "glyphs-poly", "logos"] as const;
type IconPackName = (typeof ICON_PACK_NAMES)[number];

/** An Iconify JSON pack, as shipped in @iconify-json/<name>/icons.json. */
interface IconPack {
  prefix: string;
  width: number;
  height: number;
  icons: Record<string, { body: string }>;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const cacheKey = (name: IconPackName): string => `icon-pack:${name}`;

const loading = new Map<IconPackName, Promise<IconPack | undefined>>();

async function fetchIconPack(name: IconPackName): Promise<IconPack | undefined> {
  const cached = await idbGet<IconPack>(cacheKey(name));
  if (cached !== undefined) {
    return cached;
  }
  try {
    const resp = await fetch(`/api/icons/${name}`);
    if (!resp.ok) {
      return undefined;
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const pack = (await resp.json()) as IconPack;
    void idbSet(cacheKey(name), pack, CACHE_TTL_MS);
    return pack;
  } catch {
    return undefined;
  }
}

/** Load one icon pack. Concurrent and repeated calls share one request. */
async function loadIconPack(name: IconPackName): Promise<IconPack | undefined> {
  let promise = loading.get(name);
  if (promise === undefined) {
    promise = fetchIconPack(name);
    loading.set(name, promise);
  }
  return promise;
}

// Older builds cached every pack combined, once for Mermaid and once for
// Kumidraw (about 6 MB each). Drop those entries.
void idbDelete("mermaid-icons");
void idbDelete("kumidraw-icons");

export type { IconPack, IconPackName };
export { ICON_PACK_NAMES, loadIconPack };
