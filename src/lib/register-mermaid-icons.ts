/**
 * Mermaid Icon Pack Registration
 *
 * Registers Iconify icon packs with Mermaid so architecture diagrams
 * can use icon prefixes like `logos:*`, `devicon:*`, `flag:*`,
 * `fluent-color:*`, and `glyphs-poly:*`.
 *
 * Icon data is loaded lazily from the server at runtime so it doesn't
 * bloat the initial JS bundle.  Only fetched when a page with Mermaid
 * diagrams actually needs them.
 *
 * Usage: call once at app startup (client-side only):
 *   import { registerMermaidIcons } from "@/lib/register-mermaid-icons";
 *   registerMermaidIcons();
 */

const ICON_PACKS = [
  { name: "devicon", path: "devicon" },
  { name: "flag", path: "flag" },
  { name: "fluent-color", path: "fluent-color" },
  { name: "glyphs-poly", path: "glyphs-poly" },
  { name: "logos", path: "logos" },
] as const;

/**
 * Register all icon packs with Mermaid.
 * Safe to call multiple times; Mermaid deduplicates by prefix.
 * Must be called on the client (browser) only.
 */
// Deduplication: no matter how many times registerMermaidIcons is called
// (mount effects in viewer.tsx, slides/streamdown.tsx, etc.), only one
// round of fetches runs. All concurrent callers share the same promise.
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

    // Load each icon pack lazily from the server.
    const results = await Promise.all(
      ICON_PACKS.map(async ({ name, path }) => {
        try {
          const resp = await fetch(`/icon-packs/${path}.json`);
          if (!resp.ok) {
            return undefined;
          }
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const body = (await resp.json()) as {
            prefix: string;
            icons: Record<string, { body: string }>;
          };
          return { icons: body, name };
        } catch {
          return undefined;
        }
      }),
    );

    const valid = results.filter((pack): pack is NonNullable<typeof pack> => pack !== undefined);
    if (valid.length === 0) {
      return;
    }

    mermaid.registerIconPacks(valid);

    console.debug(
      `[kumidocs] Mermaid icons registered: ${valid.map((pack) => `${pack.name} (${Object.keys(pack.icons.icons).length})`).join(", ")}`,
    );
  })();

  return iconsPromise;
}
