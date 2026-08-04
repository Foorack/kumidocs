// Icon resolution for the Kumidraw renderer.
//
// A Kumidraw file references icons by bare name (see docs/kumidraw-spec.md,
// Section 5.2.0a). The format does not say which icon set a renderer must use;
// it only says an unknown name must draw a plainly visible fallback.
//
// This resolver looks the name up in the Fluent color icon registry first, so
// `:DesignIdeas24Color`-style names render their real artwork. Anything not in
// the registry draws the default fallback icon.

import ICONS from "@/components/ui/icon/fluent";

/** The fallback icon for unknown names. Plainly visible and color-filled. */
const KUMIDRAW_FALLBACK_ICON = "DesignIdeas24Color";

function injectSize(svg: string, size: number): string {
  return svg.replace("<svg", `<svg width="${size}" height="${size}"`);
}

/**
 * Resolve an icon name to an SVG string of the given size. Returns the fallback
 * icon (never empty) when the name is not in the Fluent registry.
 */
// oxlint-disable-next-line import/prefer-default-export
export function resolveKumidrawIconSvg(name: string, size: number): string {
  const known = ICONS[name];
  const svg = known ?? ICONS[KUMIDRAW_FALLBACK_ICON] ?? "";
  return injectSize(svg, size);
}
