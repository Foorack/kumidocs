/**
 * Registers Iconify icon packs with Mermaid for architecture diagrams.
 * Supports `logos:*`, `devicon:*`, `flag:*`, `fluent-color:*`, `glyphs-poly:*`.
 *
 * Packs are registered as lazy loaders: Mermaid fetches a pack only when a
 * diagram uses an icon from it. Must be called on the client (browser) only.
 */

import { ICON_PACK_NAMES, loadIconPack } from "./icon-packs";
import type { IconPack } from "./icon-packs";

let registered: Promise<void> | undefined;

/** Register the icon pack loaders with Mermaid. Safe to call more than once. */
// oxlint-disable-next-line import/prefer-default-export
export async function registerMermaidIcons(): Promise<void> {
  registered ??= (async (): Promise<void> => {
    const { default: mermaid } = await import("mermaid");
    if (typeof mermaid.registerIconPacks !== "function") {
      return;
    }
    mermaid.registerIconPacks(
      ICON_PACK_NAMES.map((name) => ({
        loader: async (): Promise<IconPack> => {
          const pack = await loadIconPack(name);
          if (pack === undefined) {
            throw new Error(`Icon pack "${name}" could not be loaded`);
          }
          return pack;
        },
        name,
      })),
    );
  })();
  return registered;
}
