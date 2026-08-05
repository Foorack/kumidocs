// Serialize a Kumidraw element list back to canonical `.kumidraw` source.
//
// This is the inverse of the parser: it takes parsed elements and emits the
// statement lines for each, plus the required header. It is used by the
// interactive editor so edits to the model can be written back to the file.
//
// The output is intentionally canonical. Comments, blank lines, and any
// original arrangement are not preserved; the editor rewrites the whole file
// on each change, just like the CSV grid rewrites the spreadsheet.

import type { BoxElement, KumidrawDoc, LineElement, TextElement } from "./types";

const HEADER = "# kumidraw v:1 grid:10";
const GRID = 10;

/** Round a coordinate or size to the fixed grid, clamped to non-negative. */
function snap(value: number): number {
  return Math.max(0, Math.round(value / GRID) * GRID);
}

function boxLine(box: BoxElement): string {
  const parts = [`box (${snap(box.x)}, ${snap(box.y)}) (${snap(box.w)}, ${snap(box.h)})`];
  if (box.filled) {
    parts.push("fill");
  }
  if (box.dashed && !box.filled) {
    parts.push("dashed");
  }
  if (box.color !== undefined) {
    parts.push(box.color);
  }
  if (box.icon !== undefined) {
    parts.push(`:${box.icon}`);
  }
  if (box.label !== undefined) {
    parts.push(`"${box.label}"`);
  }
  return parts.join(" ");
}

function lineLine(line: LineElement): string {
  const parts = ["line"];
  for (const p of line.points) {
    parts.push(`(${snap(p.x)}, ${snap(p.y)})`);
  }
  if (line.dashed) {
    parts.push("dashed");
  }
  if (line.color !== undefined) {
    parts.push(line.color);
  }
  if (line.routing !== undefined) {
    parts.push(line.routing);
  }
  if (line.arrows !== undefined) {
    const arrow = { both: "<->", end: "->", start: "<-" }[line.arrows];
    parts.push(arrow);
  }
  if (line.label !== undefined) {
    parts.push(`"${line.label}"`);
  }
  return parts.join(" ");
}

function textLine(text: TextElement): string {
  return `text (${snap(text.x)}, ${snap(text.y)}) "${text.text}"`;
}

/** Serialize a parsed document to canonical Kumidraw source text. */
// oxlint-disable-next-line import/prefer-default-export
export function serializeKumidraw(doc: KumidrawDoc): string {
  if (doc.header === null) {
    // Not a valid diagram; emit nothing parseable beyond a placeholder header.
    return `${HEADER}\n\n`;
  }
  const lines = [HEADER, ""];
  for (const el of doc.elements) {
    if (el.kind === "box") {
      lines.push(boxLine(el));
    } else if (el.kind === "line") {
      lines.push(lineLine(el));
    } else {
      lines.push(textLine(el));
    }
  }
  return `${lines.join("\n")}\n`;
}
