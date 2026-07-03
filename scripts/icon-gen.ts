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

import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FLUENT_VERSION = "2.0.331";
const TEMP_DIR = "/tmp/fluent-icon-gen";
const CHUNKS_DIR = path.join(TEMP_DIR, "node_modules/@fluentui/react-icons/lib/sizedIcons");
const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "src/components/ui/icon/fluent.ts");

// ---------------------------------------------------------------------------
// SVG node tree helpers
// ---------------------------------------------------------------------------

interface SvgNode {
  attrs: Record<string, string> | undefined;
  children: SvgNode[];
  tag: string;
}

/**
 * Parse a single SVG node from its JSON-like Array representation.
 *
 * Input format (as it appears in the chunk JS):
 *   ["path", { "d": "...", "fill": "..." }]
 *   ["defs", null, ["linearGradient", { ... }, ["stop", { ... }]]]
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null;
}

function parseNode(raw: unknown): SvgNode {
  if (!Array.isArray(raw) || raw.length < 2) {
    return { attrs: undefined, children: [], tag: "unknown" };
  }
  const tag = String(raw[0] ?? "");
  const rawAttrs: unknown = raw[1];
  const attrs: Record<string, string> | undefined = isStringRecord(rawAttrs) ? rawAttrs : undefined;
  const children: SvgNode[] = [];
  for (let index = 2; index < raw.length; index++) {
    const child: unknown = raw[index];
    if (Array.isArray(child)) {
      children.push(parseNode(child));
    }
  }
  return { attrs, children, tag };
}

/**
 * Convert a JSX camelCase attribute name to the correct SVG attribute name.
 *
 * Most SVG attributes are kebab-case in raw HTML (stopColor -> stop-color),
 * but a few are natively camelCase in the SVG spec.
 */
const SVG_CAMEL_ATTRS = new Set([
  "baseFrequency",
  "calcMode",
  "clipPath",
  "edgeMode",
  "gradientTransform",
  "gradientUnits",
  "numOctaves",
  "preserveAlpha",
  "stdDeviation",
  "viewBox",
  "xlinkHref",
  "xmlns",
]);
function svgAttrName(key: string): string {
  if (SVG_CAMEL_ATTRS.has(key)) {
    return key;
  }
  // Convert camelCase to kebab-case: fillOpacity -> fill-opacity
  return key.replaceAll(/(?<letter>[A-Z])/gu, "-$<letter>").toLowerCase();
}

const VOID_ELEMENTS = new Set([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "stop",
  "use",
]);

function xmlEscape(str: string): string {
  return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Serialise an SVG node tree back to an SVG element string. */
function nodeToHtml(node: SvgNode): string {
  const attrString = node.attrs
    ? Object.entries(node.attrs)
        .map(([key, value]) => ` ${svgAttrName(key)}="${xmlEscape(value)}"`)
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

// ---------------------------------------------------------------------------
// Chunk-file parsing
// ---------------------------------------------------------------------------

/**
 * Locate the start of the third argument (an array `[...]`) in a
 * createFluentIcon(...) call.
 *
 *   createFluentIcon("Foo24Color", "24", [...])
 *                                         ^-- here
 */
function findThirdArgArray(source: string, callStart: number): number {
  let depth = 0;
  let argNum = 0;
  let inString: string | undefined;
  let index = callStart;

  while (index < source.length) {
    const ch = source.charAt(index);

    if (inString !== undefined) {
      if (ch === "\\") {
        index += 2;
        continue;
      }
      if (ch === inString) {
        inString = undefined;
      }
      index++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      index++;
      continue;
    }

    if (ch === "(") {
      depth++;
      index++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        break;
      }
      index++;
      continue;
    }

    if (ch === "," && depth === 1) {
      argNum++;
      if (argNum === 2) {
        // Next non-whitespace char should be the array start
        let nextIdx = index + 1;
        while (nextIdx < source.length && source.charAt(nextIdx).trim() === "") {
          nextIdx++;
        }
        if (source.charAt(nextIdx) === "[") {
          return nextIdx;
        }
        return -1;
      }
    }

    index++;
  }

  return -1;
}

/**
 * Starting from an opening `[`, find the matching `]` respecting nesting and
 * strings, and return the bracketed content.
 */
function parseBracketed(source: string, start: number): { end: number; value: string } {
  const stack: number[] = [];
  let inString: string | undefined;
  let index = start;

  while (index < source.length) {
    const ch = source.charAt(index);

    if (inString !== undefined) {
      if (ch === "\\") {
        index += 2;
        continue;
      }
      if (ch === inString) {
        inString = undefined;
      }
      index++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      index++;
      continue;
    }

    if (ch === "[" || ch === "(" || ch === "{") {
      stack.push(index);
      index++;
      continue;
    }

    if (ch === "]" || ch === ")" || ch === "}") {
      const opener = stack.pop();
      if (opener === start) {
        return {
          end: index + 1,
          value: source.slice(start, index + 1),
        };
      }
      index++;
      continue;
    }

    index++;
  }

  return { end: start, value: "" };
}

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
function extractIconsFromChunk(source: string): { name: string; nodes: SvgNode[] }[] {
  const results: { name: string; nodes: SvgNode[] }[] = [];

  // Find all export declarations for 24Color icons
  const nameRe = /\bexport\s+const\s+(?<iconName>\w+24Color)\s*=/gu;
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = nameRe.exec(source)) !== null) {
    const nameGroup = nameMatch.groups?.iconName;
    if (nameGroup === undefined || nameGroup === "") {
      continue;
    }

    // Find the createFluentIcon call that follows
    const callStart = source.indexOf("createFluentIcon(", nameMatch.index);
    if (callStart === -1) {
      continue;
    }

    // We need the third argument (the array of SVG nodes).
    // Walk forward from callStart past the string args to find the array.
    const arrayStart = findThirdArgArray(source, callStart);
    if (arrayStart === -1) {
      continue;
    }

    const { value: arrayValue } = parseBracketed(source, arrayStart);
    if (!arrayValue) {
      continue;
    }

    // Replace JS single-line comments within the array, then parse as JSON.
    const cleaned = arrayValue.replaceAll(/\/\/.*$/gmu, "");
    let parsed: unknown[];
    try {
      const result: unknown = JSON.parse(cleaned);
      if (Array.isArray(result)) {
        parsed = result as unknown[];
      } else {
        continue;
      }
    } catch {
      continue;
    }

    const nodes = parsed.map((item) => parseNode(item));
    results.push({ name: nameGroup, nodes });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("Icon gen: installing @fluentui/react-icons...");

// 1. Clean + create temp directory
try {
  await access(TEMP_DIR);
  await rm(TEMP_DIR, { force: true, recursive: true });
} catch {
  // Directory doesn't exist, no need to clean
}
await mkdir(TEMP_DIR, { recursive: true });

// Minimal package.json so `bun add` creates a simple tree
await writeFile(
  path.join(TEMP_DIR, "package.json"),
  JSON.stringify({ name: "tmp", private: true }),
  "utf8",
);

// Install the exact version without touching the real project files
await $`cd ${TEMP_DIR} && bun add @fluentui/react-icons@${FLUENT_VERSION}`.quiet();

console.log("  Package installed. Extracting 24Color icons...");

// 2. Read all chunk files
const allIcons: { name: string; nodes: SvgNode[] }[] = [];

const chunkFiles = await Array.fromAsync(
  // Bun's glob API
  // oxlint-disable-next-line unicorn/no-array-method-this-argument
  new Bun.Glob("chunk-*.js").scan({ absolute: true, cwd: CHUNKS_DIR }),
);
chunkFiles.sort();

const iconResults = await Promise.all(
  chunkFiles.map(async (filePath) => {
    const source = await readFile(filePath, "utf8");
    return extractIconsFromChunk(source);
  }),
);
for (const icons of iconResults) {
  allIcons.push(...icons);
}

// Sort by name for deterministic output
allIcons.sort((left, right) => left.name.localeCompare(right.name));

console.log(`  Found ${allIcons.length} 24Color icons.`);

// 3. Build the output file
const lines: string[] = [
  "// oxlint-disable sort-keys",
  "// Auto-generated by scripts/icon-gen.ts; do not edit manually.",
  `// Source: @fluentui/react-icons@${FLUENT_VERSION} (installed at build time)`,
  '// Each export is a raw SVG string (viewBox="0 0 24 24").',
  "",
  "const ICONS: Record<string, string> = {",
];

for (const { name, nodes } of allIcons) {
  const svgChildren = nodes.map((node) => nodeToHtml(node)).join("\n");
  const outerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${svgChildren}</svg>`;
  // Escape for a JS string literal
  const escaped = outerSvg
    .replaceAll("\\", String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll("\n", String.raw`\n`);
  lines.push(`  "${name}": "${escaped}",`);
}

lines.push("};", "", "export default ICONS;", "");

// Ensure output directory exists
await mkdir(path.join(PROJECT_ROOT, "src/components/ui/icon"), { recursive: true });
await writeFile(OUTPUT_FILE, lines.join("\n"), "utf8");

console.log(`\nWrote ${OUTPUT_FILE}`);
console.log(`  ${allIcons.length} icons exported.`);
