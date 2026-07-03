// oxlint-disable unicorn/number-literal-case
/**
 * emoji-gen.ts generates src/components/ui/emoji/emojis.txt and .txt.gz
 *
 * Pass 1: Fluent Emoji (non-flag):
 *   For each emoji in emojimart-data-all-15.json, matches the emoji's native
 *   glyph against the `glyph` field in each fluentui-emoji asset's metadata.json,
 *   then extracts the Color SVG text (minified).
 *
 * Pass 2: Country flags (via country-flag-icons):
 *   For any emoji that is a regional-indicator pair (flag emoji) and was not
 *   found in the Fluent Emoji set, the corresponding ISO 3166-1 alpha-2 SVG is
 *   taken from country-flag-icons/3x2/.
 *
 * Output: emojis.txt -- one entry per line, format: <emoji_char>;<minified_svg>
 *         The server API (/api/emojis) gzips and serves this at runtime.
 *
 * Usage:
 *   bun scripts/emoji-gen.ts [--clone] [--verbose]
 *
 *   --clone    Force a fresh clone of fluentui-emoji (even if /tmp/fluentui-emoji exists).
 *   --verbose  Print the list of skipped (unmatched) emoji to stdout.
 */

import { readdir, readFile, mkdir, rm, exists, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

// Paths

const REPO_URL = "https://github.com/microsoft/fluentui-emoji";
const CLONE_DIR = "/tmp/fluentui-emoji";
const ASSETS_DIR = path.join(CLONE_DIR, "assets");

const SCRIPT_DIR = import.meta.dir;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const EMOJI_DATA_PATH = path.join(
  PROJECT_ROOT,
  "src/components/ui/emoji/emojimart-data-all-15.json",
);
const EMOJI_DIR = path.join(PROJECT_ROOT, "src/components/ui/emoji");
const OUTPUT_TXT = path.join(EMOJI_DIR, "emojis.txt");
// Legacy individual-SVG directory; cleaned up if present
const COLOR_DIR = path.join(PROJECT_ROOT, "src/components/ui/emoji/color");
// country-flag-icons 3x2 SVG directory (installed as dev dependency)
const FLAG_SVGS_DIR = path.join(PROJECT_ROOT, "node_modules/country-flag-icons/3x2");

// Types

interface EmojiSkin {
  native: string;
  unified: string;
}
interface EmojiEntry {
  skins: EmojiSkin[];
}
interface EmojiMartData {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<string, EmojiEntry>;
}

function isEmojiMartData(value: unknown): value is EmojiMartData {
  return typeof value === "object" && value !== null && "categories" in value && "emojis" in value;
}
interface FluentMeta {
  glyph: string;
}

function isFluentMeta(value: unknown): value is FluentMeta {
  return typeof value === "object" && value !== null && "glyph" in value;
}

// Helpers: Fluent Emoji

/** Walk the fluentui assets dir and build a map: glyph -> absolute Color SVG path. */
async function buildGlyphMap(assetsDir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const assetNames = await readdir(assetsDir);

  interface AssetResult {
    glyph: string;
    svgPath: string;
  }

  const results: (AssetResult | undefined)[] = await Promise.all(
    assetNames.map(async (assetName) => {
      const metaPath = path.join(assetsDir, assetName, "metadata.json");

      let meta: FluentMeta;
      try {
        const metaRaw: unknown = JSON.parse(await readFile(metaPath, "utf8"));
        if (!isFluentMeta(metaRaw)) {
          return undefined;
        }
        meta = metaRaw;
      } catch {
        return undefined;
      }
      if (!meta.glyph) {
        return undefined;
      }

      let svgPath: string | undefined;

      // Pass 1: direct Color/ subdirectory (older flat structure)
      const directColorDir = path.join(assetsDir, assetName, "Color");
      try {
        const colorFiles = await readdir(directColorDir);
        const svgFile = colorFiles.find((file) => file.endsWith(".svg"));
        if (svgFile !== undefined) {
          svgPath = path.join(directColorDir, svgFile);
        }
      } catch {
        // Not found directly; check variant subdirectories
      }

      // Pass 2: Default variant subdirectory (newer nested structure)
      if (svgPath === undefined) {
        const variantColorDir = path.join(assetsDir, assetName, "Default", "Color");
        try {
          const colorFiles = await readdir(variantColorDir);
          const svgFile = colorFiles.find((file) => file.endsWith(".svg"));
          if (svgFile !== undefined) {
            svgPath = path.join(variantColorDir, svgFile);
          }
        } catch {
          // No Default/Color dir; skip this asset
        }
      }

      if (svgPath !== undefined) {
        return { glyph: meta.glyph, svgPath };
      }
      return undefined;
    }),
  );

  for (const result of results) {
    if (result) {
      map.set(result.glyph, result.svgPath);
    }
  }

  return map;
}

// Helpers: Country flags

/**
 * Decode a regional-indicator flag emoji (e.g. 🇺🇸) to its ISO 3166-1 alpha-2
 * code ("US"). Returns undefined for non-flag emoji or unsupported sequences.
 */
/** Minify an SVG string: trim each line, join into a single line. */
function minifySvg(svg: string): string {
  return svg
    .split("\n")
    .map((line) => line.trim())
    .join("");
}

function flagEmojiToISO(native: string): string | undefined {
  // Use TextEncoder to safely extract UTF-32 code points from the flag emoji
  const enc = new TextEncoder().encode(native);
  // Regional indicator pairs are always two 4-byte UTF-8 sequences = 8 bytes
  if (enc.length !== 8) {
    return undefined;
  }
  // oxlint-disable no-bitwise
  const codePointA =
    (((enc[0] ?? 0) & 0x07) << 18) |
    (((enc[1] ?? 0) & 0x3f) << 12) |
    (((enc[2] ?? 0) & 0x3f) << 6) |
    ((enc[3] ?? 0) & 0x3f);
  const codePointB =
    (((enc[4] ?? 0) & 0x07) << 18) |
    (((enc[5] ?? 0) & 0x3f) << 12) |
    (((enc[6] ?? 0) & 0x3f) << 6) |
    ((enc[7] ?? 0) & 0x3f);
  // oxlint-enable no-bitwise
  // oxlint-disable unicorn/numeric-separators-style
  if (
    codePointA < 0x1f1e6 ||
    codePointA > 0x1f1ff ||
    codePointB < 0x1f1e6 ||
    codePointB > 0x1f1ff
  ) {
    return undefined;
  }
  return String.fromCodePoint(codePointA - 0x1f1e6 + 65, codePointB - 0x1f1e6 + 65);
}
// oxlint-enable unicorn/numeric-separators-style

// Main

const forceClone = process.argv.includes("--clone");

// 1. Clone (or reuse) the fluentui-emoji repo
if (forceClone && (await exists(CLONE_DIR))) {
  console.log("Removing existing clone…");
  await rm(CLONE_DIR, { force: true, recursive: true });
}

if (await exists(CLONE_DIR)) {
  console.log(`Reusing existing clone at ${CLONE_DIR}`);
} else {
  console.log(`Cloning ${REPO_URL} (depth 1)…`);
  await $`git clone --depth 1 ${REPO_URL} ${CLONE_DIR}`;
  console.log("Clone complete.");
}

// 2. Build glyph -> SVG path map
console.log("Building glyph map from fluentui assets…");
const glyphMap = await buildGlyphMap(ASSETS_DIR);
console.log(`  ${String(glyphMap.size)} assets indexed.`);

// 3. Load emojimart data
const martRaw: unknown = JSON.parse(await readFile(EMOJI_DATA_PATH, "utf8"));
if (!isEmojiMartData(martRaw)) {
  throw new Error("Invalid emojimart data file");
}
const martData: EmojiMartData = martRaw;

const allIds = new Set<string>();
for (const cat of martData.categories) {
  for (const id of cat.emojis) {
    allIds.add(id);
  }
}
console.log(`  ${String(allIds.size)} emoji IDs in emojimart data.`);

// 4. Build map: native char -> base64 data URI
await mkdir(path.join(PROJECT_ROOT, "src/components/ui/emoji"), { recursive: true });

let matchedFluent = 0;
let matchedFlag = 0;
let skipped = 0;
const skippedList: string[] = [];

// Collect entries in category order so the TS file mirrors picker order
const entries: { native: string; svg: string }[] = [];

interface EmojiResult {
  svg: string;
  native: string;
}

const idList = [...allIds];
const emojiResults = await Promise.all(
  idList.map(async (id) => {
    const entry = martData.emojis[id];
    if (!entry?.skins[0]) {
      skippedList.push(`${id} (no skin data)`);
      return undefined;
    }

    const { native } = entry.skins[0];

    // Pass 1: Fluent Emoji
    const svgSrc = glyphMap.get(native);
    if (svgSrc !== undefined && svgSrc !== "") {
      const svgText = await readFile(svgSrc, "utf8");
      matchedFluent++;
      return { native, svg: minifySvg(svgText) } satisfies EmojiResult;
    }

    // Pass 2: Country flag via country-flag-icons
    const iso = flagEmojiToISO(native);
    if (iso !== undefined && iso !== "") {
      const flagPath = path.join(FLAG_SVGS_DIR, `${iso}.svg`);
      try {
        const sourceSvg = await readFile(flagPath, "utf8");
        matchedFlag++;
        return { native, svg: minifySvg(sourceSvg) } satisfies EmojiResult;
      } catch {
        // SVG not present for this ISO code; fall through to skipped
      }
    }

    skippedList.push(`${id} (${native}: not in fluentui assets or country-flag-icons)`);
    return undefined;
  }),
);

for (const result of emojiResults) {
  if (result) {
    entries.push(result);
  } else {
    skipped++;
  }
}

// 5. Write emojis.txt (one entry per line: <emoji_char>;<minified_svg>)
// Split on FIRST semicolon only -- SVG data may contain semicolons in path data.
const textLines: string[] = [];
for (const { native, svg } of entries) {
  textLines.push(`${native};${svg}`);
}
const textContent = textLines.join("\n");
await writeFile(OUTPUT_TXT, textContent, "utf8");
console.log(`  Wrote ${OUTPUT_TXT}`);

// 6. Clean up legacy files
// Legacy emojis.ts (replaced by emojis.txt + emojis.txt.gz)
const legacyTsPath = path.join(EMOJI_DIR, "emojis.ts");
if (await exists(legacyTsPath)) {
  await rm(legacyTsPath);
  console.log("  Removed legacy emojis.ts");
}
// Legacy color/ directory
if (await exists(COLOR_DIR)) {
  console.log("  Cleaning up legacy color/ directory…");
  await rm(COLOR_DIR, { force: true, recursive: true });
}

// 8. Report
console.log(`\nDone.`);
console.log(`  Fluent Emoji : ${String(matchedFluent)}`);
console.log(`  Country flags: ${String(matchedFlag)}`);
console.log(`  Skipped      : ${String(skipped)} (fallback to native text rendering)`);
if (skippedList.length > 0 && process.argv.includes("--verbose")) {
  console.log("\nSkipped emoji (--verbose):");
  for (const skippedEntry of skippedList) {
    console.log(`  - ${skippedEntry}`);
  }
}
