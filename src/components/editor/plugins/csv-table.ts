// oxlint-disable eslint/id-length, typescript/no-unnecessary-type-assertion, typescript/no-unnecessary-condition

/**
 * rehype plugin: transforms ```csv fenced code blocks into <table> elements.
 *
 * Uses ; (semicolon) as the delimiter. First row is treated as header (<thead>),
 * subsequent rows as body (<tbody>).
 *
 * Example:
 *   ```csv
 *   Name;Age;Role
 *   Alice;30;Engineer
 *   Bob;25;Designer
 *   ```
 */

import type { Element, ElementContent, Root } from "hast";

function parseCsvRow(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ";" && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cols.push(current.trim());
  return cols;
}

function buildCell(text: string, tag: "th" | "td"): Element {
  return {
    children: [{ type: "text", value: text }],
    properties: {},
    tagName: tag,
    type: "element",
  };
}

function buildRow(cells: string[], tag: "th" | "td"): Element {
  return {
    children: cells.map((cell) => buildCell(cell, tag)),
    properties: {},
    tagName: "tr",
    type: "element",
  };
}

function isCsvCodeBlock(node: Element): boolean {
  if (node.tagName !== "pre") {
    return false;
  }
  const code = node.children[0];
  if (code?.type !== "element" || code.tagName !== "code") {
    return false;
  }
  const className = code.properties?.className;
  return Array.isArray(className) && className.includes("language-csv");
}

function transformCsvBlock(pre: Element): Element {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const code = pre.children[0] as unknown as Element;
  const textNode = code.children[0];
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  const raw = textNode?.type === "text" ? textNode.value : "";

  const lines = raw.split("\n").filter((line: string) => line.trim() !== "");
  if (lines.length === 0) {
    return pre;
  }

  const headerRow = buildRow(parseCsvRow(lines[0] ?? ""), "th");
  const bodyRows = lines.slice(1).map((line: string) => buildRow(parseCsvRow(line), "td"));

  const thead: Element = {
    children: [headerRow],
    properties: {},
    tagName: "thead",
    type: "element",
  };

  const tbody: Element = {
    children: bodyRows,
    properties: {},
    tagName: "tbody",
    type: "element",
  };

  return {
    children: [thead, tbody],
    properties: { className: ["csv-table"] },
    tagName: "table",
    type: "element",
  };
}

/** Walk ElementContent children, replacing CSV code blocks with tables. */
function walk(children: ElementContent[]): void {
  for (let idx = 0; idx < children.length; idx++) {
    const node = children[idx];
    if (node?.type !== "element") {
      continue;
    }
    if (isCsvCodeBlock(node)) {
      children[idx] = transformCsvBlock(node);
    } else if (Array.isArray(node.children) && node.children.length > 0) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      walk(node.children as ElementContent[]);
    }
  }
}

// oxlint-disable-next-line import/prefer-default-export
export default function rehypeCsvTable(): (tree: Root) => void {
  return (tree: Root): void => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    walk(tree.children as ElementContent[]);
  };
}
