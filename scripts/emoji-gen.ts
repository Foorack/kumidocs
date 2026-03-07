/**
 * emoji-gen.ts — generates src/components/ui/emoji/emojis.ts
 *
 * Pass 1 — Fluent Emoji (non-flag):
 *   For each emoji in emojimart-data-all-15.json, matches the emoji's native
 *   glyph against the `glyph` field in each fluentui-emoji asset's metadata.json,
 *   then encodes the Color SVG as a base64 data URI.
 *
 * Pass 2 — Country flags (via country-flag-icons):
 *   For any emoji that is a regional-indicator pair (flag emoji) and was not
 *   found in the Fluent Emoji set, the corresponding ISO 3166-1 alpha-2 SVG is
 *   taken from country-flag-icons/3x2/, wrapped in the FluentUI card frame
 *   (rounded rect + depth/sheen gradients), and baked in as a base64 data URI.
 *
 * The output file is imported directly by EmojiIcon.tsx — zero HTTP requests,
 * all emoji SVGs baked into the JS bundle.
 *
 * Usage:
 *   bun scripts/emoji-gen.ts [--clone] [--verbose]
 *
 *   --clone    Force a fresh clone of fluentui-emoji (even if /tmp/fluentui-emoji exists).
 *   --verbose  Print the list of skipped (unmatched) emoji to stdout.
 */

import { readdir, readFile, mkdir, rm, exists, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { $ } from 'bun';

// ── Paths ─────────────────────────────────────────────────────────────────────

const REPO_URL = 'https://github.com/microsoft/fluentui-emoji';
const CLONE_DIR = '/tmp/fluentui-emoji';
const ASSETS_DIR = join(CLONE_DIR, 'assets');

const SCRIPT_DIR = import.meta.dir;
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const EMOJI_DATA_PATH = join(PROJECT_ROOT, 'src/components/ui/emoji/emojimart-data-all-15.json');
const OUTPUT_FILE = join(PROJECT_ROOT, 'src/components/ui/emoji/emojis.ts');
// Legacy individual-SVG directory — cleaned up if present
const COLOR_DIR = join(PROJECT_ROOT, 'src/components/ui/emoji/color');
// country-flag-icons 3x2 SVG directory (installed as dev dependency)
const FLAG_SVGS_DIR = join(PROJECT_ROOT, 'node_modules/country-flag-icons/3x2');

// ── Types ─────────────────────────────────────────────────────────────────────

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
interface FluentMeta {
	glyph: string;
}

// ── Helpers — Fluent Emoji ────────────────────────────────────────────────────

/** Walk the fluentui assets dir and build a map: glyph → absolute Color SVG path. */
async function buildGlyphMap(assetsDir: string): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const assetNames = await readdir(assetsDir);

	for (const assetName of assetNames) {
		const metaPath = join(assetsDir, assetName, 'metadata.json');
		const colorDir = join(assetsDir, assetName, 'Color');

		let meta: FluentMeta;
		try {
			meta = JSON.parse(await readFile(metaPath, 'utf8')) as FluentMeta;
		} catch {
			continue;
		}

		if (!meta.glyph) continue;

		let svgPath: string | null = null;
		try {
			const colorFiles = await readdir(colorDir);
			const svg = colorFiles.find((f) => f.endsWith('.svg'));
			if (svg) svgPath = join(colorDir, svg);
		} catch {
			continue;
		}

		if (svgPath) {
			map.set(meta.glyph, svgPath);
		}
	}

	return map;
}

// ── Helpers — Country flags ───────────────────────────────────────────────────

/**
 * Decode a regional-indicator flag emoji (e.g. 🇺🇸) to its ISO 3166-1 alpha-2
 * code ("US"). Returns null for non-flag emoji or unsupported sequences.
 */
function flagEmojiToISO(native: string): string | null {
	// Use TextEncoder to safely extract UTF-32 code points from the flag emoji
	const enc = new TextEncoder().encode(native);
	// Regional indicator pairs are always two 4-byte UTF-8 sequences = 8 bytes
	if (enc.length !== 8) return null;
	const a =
		(((enc[0] ?? 0) & 0x07) << 18) |
		(((enc[1] ?? 0) & 0x3f) << 12) |
		(((enc[2] ?? 0) & 0x3f) << 6) |
		((enc[3] ?? 0) & 0x3f);
	const b =
		(((enc[4] ?? 0) & 0x07) << 18) |
		(((enc[5] ?? 0) & 0x3f) << 12) |
		(((enc[6] ?? 0) & 0x3f) << 6) |
		((enc[7] ?? 0) & 0x3f);
	if (a < 0x1f1e6 || a > 0x1f1ff || b < 0x1f1e6 || b > 0x1f1ff) return null;
	return String.fromCharCode(a - 0x1f1e6 + 65, b - 0x1f1e6 + 65);
}

/**
 * Wraps a country-flag-icons SVG in the FluentUI card frame.
 *
 * The source SVG is embedded as a nested <svg> element that auto-scales to
 * the flag rect area. The standard four depth/sheen gradient overlays are then
 * painted on top, giving country flags the same 3D card appearance as the
 * native Fluent Emoji flags (pirate flag, rainbow flag, etc.).
 */
function makeFluentFlagSvg(sourceSvg: string): string {
	const viewBoxExec = /viewBox="([^"]+)"/.exec(sourceSvg);
	if (!viewBoxExec) throw new Error('Source SVG has no viewBox attribute');
	const viewBox = String(viewBoxExec[1]);

	// Strip the outer <svg ...> wrapper, keep only inner child elements
	const inner = sourceSvg
		.replace(/^[\s\S]*?<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.trim();

	/**
	 * The four FluentUI card depth/sheen gradient definitions used by every flag
	 * in the Fluent Emoji set. g3 uses a neutral dark tint that works universally
	 * across all flag colour schemes.
	 */
	const first_color = '#888';
	const FLAG_GRADIENT_DEFS =
		'<linearGradient id="g0" x1="2.25222" y1="17.8125" x2="3.22097" y2="17.8125" gradientUnits="userSpaceOnUse">' +
		'<stop stop-color="#3A3A3A"/><stop offset="1" stop-color="#3A3A3A" stop-opacity="0"/>' +
		'</linearGradient>' +
		'<linearGradient id="g1" x1="30.1272" y1="19.332" x2="29.1585" y2="19.332" gradientUnits="userSpaceOnUse">' +
		'<stop stop-color="#FBF2FF"/><stop offset="1" stop-color="#FBF2FF" stop-opacity="0"/>' +
		'</linearGradient>' +
		'<linearGradient id="g2" x1="25.0647" y1="6.04297" x2="25.0647" y2="6.75391" gradientUnits="userSpaceOnUse">' +
		'<stop stop-color="#FBF2FF"/><stop offset="1" stop-color="#FBF2FF" stop-opacity="0"/>' +
		'</linearGradient>' +
		'<linearGradient id="g3" x1="8.75222" y1="26.0039" x2="8.75222" y2="24.9375" gradientUnits="userSpaceOnUse">' +
		`<stop offset="0.0149314" stop-color="${first_color}"/><stop offset="1" stop-color="${first_color}" stop-opacity="0"/>` +
		'</linearGradient>';
	const FLAG_GRADIENT_RECT =
		`<rect x="2.25222" y="6.04297" width="27.875" height="19.9141" rx="0.6" fill="url(#g0)" fill-opacity="0.25"/>` +
		`<rect x="2.25222" y="6.04297" width="27.875" height="19.9141" rx="0.6" fill="url(#g1)" fill-opacity="0.5"/>` +
		`<rect x="2.25222" y="6.04297" width="27.875" height="19.9141" rx="0.6" fill="url(#g2)" fill-opacity="0.5"/>` +
		`<rect x="2.25222" y="6.04297" width="27.875" height="19.9141" rx="0.6" fill="url(#g3)"/>`;

	return (
		`<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">` +
		`<defs>` +
		`<clipPath id="c"><rect x="2.25222" y="6.04297" width="27.875" height="19.9141" rx="0.6"/></clipPath>` +
		FLAG_GRADIENT_DEFS +
		`</defs>` +
		`<g clip-path="url(#c)">` +
		`<svg x="2.25222" y="6.04297" width="27.875" height="19.9141" viewBox="${viewBox}">${inner}</svg>` +
		`</g>` +
		FLAG_GRADIENT_RECT +
		`</svg>`
	);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const forceClone = process.argv.includes('--clone');

// 1. Clone (or reuse) the fluentui-emoji repo
if (forceClone && (await exists(CLONE_DIR))) {
	console.log('Removing existing clone…');
	await rm(CLONE_DIR, { recursive: true, force: true });
}

if (!(await exists(CLONE_DIR))) {
	console.log(`Cloning ${REPO_URL} (depth 1)…`);
	await $`git clone --depth 1 ${REPO_URL} ${CLONE_DIR}`;
	console.log('Clone complete.');
} else {
	console.log(`Reusing existing clone at ${CLONE_DIR}`);
}

// 2. Build glyph → SVG path map
console.log('Building glyph map from fluentui assets…');
const glyphMap = await buildGlyphMap(ASSETS_DIR);
console.log(`  ${String(glyphMap.size)} assets indexed.`);

// 3. Load emojimart data
const martData = JSON.parse(await readFile(EMOJI_DATA_PATH, 'utf8')) as EmojiMartData;

const allIds = new Set<string>();
for (const cat of martData.categories) {
	for (const id of cat.emojis) allIds.add(id);
}
console.log(`  ${String(allIds.size)} emoji IDs in emojimart data.`);

// 4. Build map: native char → base64 data URI
await mkdir(join(PROJECT_ROOT, 'src/components/ui/emoji'), { recursive: true });

let matchedFluent = 0;
let matchedFlag = 0;
let skipped = 0;
const skippedList: string[] = [];

// Collect entries in category order so the TS file mirrors picker order
const entries: { native: string; dataUri: string }[] = [];

for (const id of allIds) {
	const entry = martData.emojis[id];
	if (!entry?.skins[0]) {
		skipped++;
		skippedList.push(`${id} (no skin data)`);
		continue;
	}

	const { native } = entry.skins[0];

	// Pass 1: Fluent Emoji
	const svgSrc = glyphMap.get(native);
	if (svgSrc) {
		const b64 = (await readFile(svgSrc)).toString('base64');
		entries.push({ native, dataUri: `data:image/svg+xml;base64,${b64}` });
		matchedFluent++;
		continue;
	}

	// Pass 2: Country flag via country-flag-icons
	const iso = flagEmojiToISO(native);
	if (iso) {
		const flagPath = join(FLAG_SVGS_DIR, `${iso}.svg`);
		try {
			const sourceSvg = await readFile(flagPath, 'utf8');
			const wrappedSvg = makeFluentFlagSvg(sourceSvg);
			const b64 = Buffer.from(wrappedSvg, 'utf8').toString('base64');
			entries.push({ native, dataUri: `data:image/svg+xml;base64,${b64}` });
			matchedFlag++;
			continue;
		} catch {
			// SVG not present for this ISO code — fall through to skipped
		}
	}

	skipped++;
	skippedList.push(`${id} (${native} — not in fluentui assets or country-flag-icons)`);
}

// 5. Write emojis.ts
// Use explicit Record<string, string> type so TypeScript doesn't infer a
// huge literal type for every key — keeps tsc fast on this large file.
const lines: string[] = [
	'// Auto-generated by scripts/emoji-gen.ts — do not edit manually.',
	'// Fluent Emoji Color SVGs from https://github.com/microsoft/fluentui-emoji',
	'// Country flags wrapped in FluentUI card style via country-flag-icons.',
	'// Keys are native emoji characters; values are base64-encoded SVG data URIs.',
	'const EMOJI_SVGS: Record<string, string> = {',
];

for (const { native, dataUri } of entries) {
	// Escape via TextEncoder to safely handle multi-byte / surrogate code points
	const enc2 = new TextEncoder().encode(native);
	let escaped = '';
	let i = 0;
	while (i < enc2.length) {
		const b0 = enc2[i] ?? 0;
		let cp: number;
		if (b0 < 0x80) {
			cp = b0;
			i += 1;
		} else if (b0 < 0xe0) {
			cp = ((b0 & 0x1f) << 6) | ((enc2[i + 1] ?? 0) & 0x3f);
			i += 2;
		} else if (b0 < 0xf0) {
			cp =
				((b0 & 0x0f) << 12) |
				(((enc2[i + 1] ?? 0) & 0x3f) << 6) |
				((enc2[i + 2] ?? 0) & 0x3f);
			i += 3;
		} else {
			cp =
				((b0 & 0x07) << 18) |
				(((enc2[i + 1] ?? 0) & 0x3f) << 12) |
				(((enc2[i + 2] ?? 0) & 0x3f) << 6) |
				((enc2[i + 3] ?? 0) & 0x3f);
			i += 4;
		}
		escaped += cp > 0x7f ? `\\u{${cp.toString(16)}}` : String.fromCodePoint(cp);
	}
	// JSON.stringify the data URI to handle any embedded quotes safely
	lines.push(`\t"${escaped}": ${JSON.stringify(dataUri)},`);
}

lines.push('};', '', 'export default EMOJI_SVGS;', '');

await writeFile(OUTPUT_FILE, lines.join('\n'), 'utf8');
console.log(`\nWrote ${OUTPUT_FILE}`);

// 6. Clean up legacy color/ directory if it exists (replaced by emojis.ts)
if (await exists(COLOR_DIR)) {
	console.log('Cleaning up legacy color/ directory…');
	await rm(COLOR_DIR, { recursive: true, force: true });
}

// 7. Report
console.log(`\nDone.`);
console.log(`  Fluent Emoji : ${String(matchedFluent)}`);
console.log(`  Country flags: ${String(matchedFlag)}`);
console.log(`  Skipped      : ${String(skipped)} (fallback to native text rendering)`);
if (skippedList.length > 0 && process.argv.includes('--verbose')) {
	console.log('\nSkipped emoji (--verbose):');
	for (const s of skippedList) console.log(`  - ${s}`);
}
