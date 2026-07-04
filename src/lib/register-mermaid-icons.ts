/**
 * Mermaid Icon Pack Registration
 *
 * Registers Iconify icon packs with Mermaid so architecture diagrams
 * can use icon prefixes like `logos:*`, `devicon:*`, `flag:*`,
 * `fluent-color:*`, and `glyphs-poly:*`.
 *
 * Icon data is served as a single gzipped text file from /api/icons.
 * Loaded lazily -- only fetched when a page with Mermaid diagrams needs them.
 *
 * Usage: call once at app startup (client-side only):
 *   import { registerMermaidIcons } from "@/lib/register-mermaid-icons";
 *   registerMermaidIcons();
 */

interface IconPackResult {
  name: string;
  icons: { prefix: string; icons: Record<string, { body: string }> };
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

    // Fetch all icon packs in a single gzipped request.
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

    if (results.length === 0) {
      return;
    }

    mermaid.registerIconPacks(results);

    console.debug(
      `[kumidocs] Mermaid icons registered: ${results.map((pack) => `${pack.name} (${Object.keys(pack.icons.icons).length})`).join(", ")}`,
    );
  })();

  return iconsPromise;
}
