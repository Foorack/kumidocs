/**
 * File-safe key for an emoji: its code points in lowercase hex, joined by "-".
 * "🏠" -> "1f3e0", "👍🏽" -> "1f44d-1f3fd". Used for /api/emoji/<key>.svg.
 */

const HEX_RADIX = 16;

function emojiKey(native: string): string {
  // Splitting into code points (not graphemes) is the point: the key lists
  // every code point, including modifiers and joiners.
  // oxlint-disable-next-line typescript/no-misused-spread
  return [...native].map((char) => (char.codePointAt(0) ?? 0).toString(HEX_RADIX)).join("-");
}

/** URL of one Fluent Emoji SVG, served by /api/emoji/:key. */
function emojiSvgUrl(native: string): string {
  return `/api/emoji/${emojiKey(native)}.svg`;
}

export { emojiKey, emojiSvgUrl };
