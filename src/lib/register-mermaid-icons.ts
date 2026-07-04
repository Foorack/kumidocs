/**
 * Mermaid Icon Pack Registration
 *
 * Registers Iconify icon packs with Mermaid so architecture diagrams
 * can use icon prefixes like `logos:*`, `devicon:*`, `flag:*`,
 * `fluent-color:*`, and `glyphs-poly:*`.
 *
 * Icon data is served as a single gzipped text file from /api/icons.
 * Loaded lazily -- only fetched when a page with Mermaid diagrams needs them.
 * Cached in IndexedDB (7-day TTL) so subsequent visits skip the fetch.
 *
 * Usage: call once at app startup (client-side only):
 *   import { registerMermaidIcons } from "@/lib/register-mermaid-icons";
 *   registerMermaidIcons();
 */

import { idbGet, idbSet } from "./idb-cache";

const CACHE_KEY = "mermaid-icons";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface IconPackResult {
  name: string;
  icons: { prefix: string; icons: Record<string, { body: string }> };
}

function parseIconText(text: string): IconPackResult[] {
  const results: IconPackResult[] = [];
  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }
    const semiIdx = line.indexOf(";");
    if (semiIdx === -1) {
      continue;
    }
    const name = line.slice(0, semiIdx);
    const json = line.slice(semiIdx + 1);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const body = JSON.parse(json) as { prefix: string; icons: Record<string, { body: string }> };
    results.push({ icons: body, name });
  }
  return results;
}

/**
 * Register all icon packs with Mermaid.
 * Safe to call multiple times; Mermaid deduplicates by prefix.
 * Must be called on the client (browser) only.
 */
let iconsPromise: Promise<void> | undefined;

// oxlint-disable-next-line import/prefer-default-export
export async function registerMermaidIcons(): Promise<void> {
  if (iconsPromise !== undefined) {
    return iconsPromise;
  }

  iconsPromise = (async (): Promise<void> => {
    const { default: mermaid } = await import("mermaid");

    if (typeof mermaid.registerIconPacks !== "function") {
      console.warn("[kumidocs] Mermaid registerIconPacks not available");
      return;
    }

    // Try IndexedDB cache first.
    const cached = await idbGet<IconPackResult[]>(CACHE_KEY);
    if (cached !== undefined && cached.length > 0) {
      mermaid.registerIconPacks(cached);
      return;
    }

    // Fall back to fetch.
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

    const results = parseIconText(text);
    if (results.length === 0) {
      return;
    }

    mermaid.registerIconPacks(results);

    // Store in IndexedDB (fire-and-forget).
    void idbSet(CACHE_KEY, results, CACHE_TTL_MS);

    console.debug(
      `[kumidocs] Mermaid icons registered: ${results.map((pack) => `${pack.name} (${Object.keys(pack.icons.icons).length})`).join(", ")}`,
    );
  })();

  return iconsPromise;
}
