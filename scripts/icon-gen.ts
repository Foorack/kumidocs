/**
 * icon-gen.ts generates src/components/ui/icon/fluent.ts
 *
 * At runtime (without modifying package.json or bun.lock), this script
 * installs a specific version of @fluentui/react-icons into a temp
 * directory, then extracts every "24Color" icon and bakes its SVG markup
 * into a standalone local module.
 *
 * This lets us drop the @fluentui/react-icons dependency entirely; the
 * handful of color icons we use are self-contained in the source tree.
 *
 * Usage:  bun scripts/icon-gen.ts
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FLUENT_VERSION = "2.0.331";
const TEMP_DIR = "/tmp/fluent-icon-gen";
const CHUNKS_DIR = join(
  TEMP_DIR,
  "node_modules/@fluentui/react-icons/lib/sizedIcons",
);
const PROJECT_ROOT = resolve(import.meta.dir, "..");
const OUTPUT_FILE = join(PROJECT_ROOT, "src/components/ui/icon/fluent.ts");

// ---------------------------------------------------------------------------
// SVG node tree helpers
// ---------------------------------------------------------------------------

interface SvgNode {
  tag: string;
  attrs: Record<string, string> | null;
  children: SvgNode[];
}

/**
 * Parse a single SVG node from its JSON-like Array representation.
 *
 * Input format (as it appears in the chunk JS):
 *   ["path", { "d": "...", "fill": "..." }]
 *   ["defs", null, ["linearGradient", { ... }, ["stop", { ... }]]]
 */
function parseNode(raw: unknown): SvgNode {
  if (!Array.isArray(raw) || raw.length < 2) {
    return { tag: "unknown", attrs: null, children: [] };
  }
  const tag = String(raw[0] ?? "");
  const attrs = raw[1] == null ? null : (raw[1] as Record<string, string>);
  const children: SvgNode[] = [];
  for (let i = 2; i < raw.length; i++) {
    const child = raw[i];
    if (Array.isArray(child)) {
      children.push(parseNode(child));
    }
  }
  return { tag, attrs, children };
}

/** Serialise an SVG node tree back to an SVG element string. */
function nodeToHtml(node: SvgNode): string {
  const attrString = node.attrs
    ? Object.entries(node.attrs)
        .map(([k, v]) => ` ${k}="${xmlEscape(v)}"`)
        .join("")
    : "";
  if (node.children.length === 0) {
    // Void elements (path, stop, etc.)
    if (VOID_ELEMENTS.has(node.tag)) {
      return `<${node.tag}${attrString} />`;
    }
    return `<${node.tag}${attrString}></${node.tag}>`;
  }
  const inner = node.children.map(nodeToHtml).join("");
  return `<${node.tag}${attrString}>${inner}</${node.tag}>`;
}

const VOID_ELEMENTS = new Set([
  "path",
  "stop",
  "use",
  "circle",
  "ellipse",
  "line",
  "rect",
  "polygon",
  "polyline",
]);

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Chunk-file parsing
// ---------------------------------------------------------------------------

/**
 * Find every "24Color" icon in a chunk file and return its name + node tree.
 *
 * Each colour icon is exported as:
 *   export const Foo24Color = createFluentIcon("Foo24Color", "24", [...]);
 *
 * The third argument is the SvgNode[] array.  We use a lightweight JS parser
 * to extract it as structured data.
 */

// Because the SvgNode arrays can span many lines, we locate them by bracket
// depth rather than by regex.
function extractIconsFromChunk(
  source: string,
): { name: string; nodes: SvgNode[] }[] {
  const results: { name: string; nodes: SvgNode[] }[] = [];

  // Find all export declarations for 24Color icons
  const nameRe = /\bexport\s+const\s+(\w+24Color)\s*=/g;
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = nameRe.exec(source)) !== null) {
    const name = nameMatch[1]!;

    // Find the createFluentIcon call that follows
    const callStart = source.indexOf("createFluentIcon(", nameMatch.index);
    if (callStart === -1) continue;

    // We need the third argument (the array of SVG nodes).
    // Walk forward from callStart past the string args to find the array.
    const arrayStart = findThirdArgArray(source, callStart);
    if (arrayStart === -1) continue;

    const { value: arrayValue } = parseBracketed(
      source,
      arrayStart,
    );
    if (!arrayValue) continue;

    // Replace JS single-line comments within the array, then parse as JSON.
    const cleaned = arrayValue.replace(/\/\/.*$/gm, "");
    let parsed: unknown[];
    try {
      parsed = JSON.parse(cleaned) as unknown[];
    } catch {
      continue;
    }

    const nodes = parsed.map(parseNode);
    results.push({ name, nodes });
  }

  return results;
}

/** Locate the start of the third argument (an array `[...]`) in a
 * createFluentIcon(...) call.
 *
 *   createFluentIcon("Foo24Color", "24", [...])
 *                                         ^-- here
 */
function findThirdArgArray(source: string, callStart: number): number {
  let depth = 0;
  let argNum = 0;
  let inString: string | null = null;
  let i = callStart;

  while (i < source.length) {
    const ch = source[i]!;

    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      i++;
      continue;
    }

    if (ch === "(") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth === 0) break;
      i++;
      continue;
    }

    if (ch === "," && depth === 1) {
      argNum++;
      if (argNum === 2) {
        // Next non-whitespace char should be the array start
        let j = i + 1;
        while (j < source.length && source[j]!.trim() === "") j++;
        if (source[j] === "[") return j;
        return -1;
      }
    }

    i++;
  }

  return -1;
}

/**
 * Starting from an opening `[`, find the matching `]` respecting nesting and
 * strings, and return the bracketed content.
 */
function parseBracketed(
  source: string,
  start: number,
): { value: string; end: number } {
  const stack: number[] = [];
  let inString: string | null = null;
  let i = start;

  while (i < source.length) {
    const ch = source[i]!;

    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      i++;
      continue;
    }

    if (ch === "[" || ch === "(" || ch === "{") {
      stack.push(i);
      i++;
      continue;
    }

    if (ch === "]" || ch === ")" || ch === "}") {
      const opener = stack.pop();
      if (opener === start) {
        return {
          value: source.slice(start, i + 1),
          end: i + 1,
        };
      }
      i++;
      continue;
    }

    i++;
  }

  return { value: "", end: start };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("Icon gen: installing @fluentui/react-icons...");

// 1. Clean + create temp directory
if (existsSync(TEMP_DIR)) {
  await rm(TEMP_DIR, { recursive: true, force: true });
}
await mkdir(TEMP_DIR, { recursive: true });

// Minimal package.json so `bun add` creates a simple tree
await writeFile(
  join(TEMP_DIR, "package.json"),
  JSON.stringify({ name: "tmp", private: true }),
  "utf8",
);

// Install the exact version without touching the real project files
await $`cd ${TEMP_DIR} && bun add @fluentui/react-icons@${FLUENT_VERSION}`.quiet();

console.log("  Package installed. Extracting 24Color icons...");

// 2. Read all chunk files
const allIcons: { name: string; nodes: SvgNode[] }[] = [];

const chunkFiles = (
  await Array.fromAsync(
    // Bun's glob API
    // oxlint-disable-next-line unicorn/no-array-method-this-argument
    new Bun.Glob("chunk-*.js").scan({ cwd: CHUNKS_DIR, absolute: true }),
  )
).sort();

for (const filePath of chunkFiles) {
  const source = await readFile(filePath, "utf8");
  const icons = extractIconsFromChunk(source);
  allIcons.push(...icons);
}

// Sort by name for deterministic output
allIcons.sort((a, b) => a.name.localeCompare(b.name));

console.log(`  Found ${allIcons.length} 24Color icons.`);

// 3. Build the output file
const lines: string[] = [
  "// oxlint-disable sort-keys",
  "// Auto-generated by scripts/icon-gen.ts; do not edit manually.",
  `// Source: @fluentui/react-icons@${FLUENT_VERSION} (installed at build time)`,
  "// Each export is a raw SVG string (viewBox=\"0 0 24 24\").",
  "",
  "const ICONS: Record<string, string> = {",
];

for (const { name, nodes } of allIcons) {
  const svgChildren = nodes.map(nodeToHtml).join("\n");
  const outerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${svgChildren}</svg>`;
  // Escape for a JS string literal
  const escaped = outerSvg.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  lines.push(`  "${name}": "${escaped}",`);
}

lines.push("};", "", "export default ICONS;", "");

// Ensure output directory exists
await mkdir(join(PROJECT_ROOT, "src/components/ui/icon"), { recursive: true });
await writeFile(OUTPUT_FILE, lines.join("\n"), "utf8");

console.log(`\nWrote ${OUTPUT_FILE}`);
console.log(`  ${allIcons.length} icons exported.`);
