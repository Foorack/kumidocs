// Reference parser for the Kumidraw diagram format.
//
// The grammar is defined in docs/kumidraw-spec.md, Section 8. This parser is
// a single top-to-bottom pass over the source. It is lenient: it collects as
// many errors as it can find so an editor can show all issues at once, and it
// keeps any element that parses cleanly. A missing or invalid header is fatal,
// because nothing else in the file is trustworthy without it.
//
// A handful of pedantic lint rules are disabled for this file. A hand-written
// statement parser reads better with compact conditionals and switch clauses,
// so curly-brace and sort-keys churn would only bury the logic. No-null is
// disabled because the header uses a null "missing" sentinel. The rules below
// are style-only; none of them flag correctness bugs.

/* oxlint-disable
   eslint/complexity,
   eslint/curly,
   eslint/default-case,
   eslint/no-negated-condition,
   eslint/no-use-before-define,
   eslint/sort-keys,
   import/prefer-default-export,
   typescript/no-non-null-assertion,
   unicorn/no-negated-condition,
   unicorn/no-null,
   unicorn/switch-case-braces
*/

import type {
  Anchor,
  ArrowHeads,
  BoxElement,
  KumidrawDoc,
  KumidrawElement,
  KumidrawError,
  KumidrawHeader,
  LineElement,
  TextElement,
} from "./types";

const VERSION = 1;
const GRID = 10;

type Token =
  | { kind: "group"; a: number; b: number }
  | { kind: "word"; value: string }
  | { kind: "arrow"; value: "->" | "<-" | "<->" }
  | { kind: "color"; value: string }
  | { kind: "icon"; name: string }
  | { kind: "quoted"; text: string };

const ANCHORS: Record<string, Anchor | undefined> = {
  topleft: "topleft",
  top: "top",
  topright: "topright",
  left: "left",
  right: "right",
  bottom: "bottom",
};

function anchorFromWord(value: string): Anchor | null {
  return ANCHORS[value] ?? null;
}

function isHexDigit(c: string | undefined): boolean {
  return (
    c !== undefined && ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F"))
  );
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

function isWordChar(c: string | undefined): boolean {
  return (
    c !== undefined &&
    ((c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "-" ||
      c === "_")
  );
}

/** Throw a tokenize error. Kept at module scope so it is created once. */
function fail(message: string): never {
  throw new Error(message);
}

/**
 * Tokenize one statement line into a list of tokens. Throws a TokenizeError
 * on malformed input so the caller can attach a line number.
 */
function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  const n = line.length;
  let i = 0;

  while (i < n) {
    const c = line[i]!;

    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }

    if (c === '"') {
      // Quoted string: runs until the next uns escaped quote. Per the grammar,
      // there is no escaping; a quote always terminates the string.
      let text = "";
      i += 1;
      while (i < n && line[i] !== '"') {
        text += line[i];
        i += 1;
      }
      if (i >= n) {
        fail("unterminated string");
      }
      i += 1; // closing quote
      tokens.push({ kind: "quoted", text });
      continue;
    }

    if (c === "(") {
      // A geometry group: (a, b). Spaces around the comma are optional.
      i += 1;
      while (i < n && (line[i] === " " || line[i] === "\t")) i += 1;
      const a = readDigits(line, i, n, "expected a number in '(a, b)'");
      i = a.next;
      while (i < n && (line[i] === " " || line[i] === "\t")) i += 1;
      if (line[i] !== ",") fail("expected ',' inside '(a, b)'");
      i += 1;
      while (i < n && (line[i] === " " || line[i] === "\t")) i += 1;
      const b = readDigits(line, i, n, "expected a number in '(a, b)'");
      i = b.next;
      while (i < n && (line[i] === " " || line[i] === "\t")) i += 1;
      if (line[i] !== ")") fail("expected ')' to close '(a, b)'");
      i += 1;
      tokens.push({ kind: "group", a: a.value, b: b.value });
      continue;
    }

    if (c === ":") {
      // Icon name. Reads the bare name; the colon is not part of the name.
      i += 1;
      let name = "";
      while (i < n && isWordChar(line[i])) {
        name += line[i]!;
        i += 1;
      }
      if (name === "") fail("expected an icon name after ':'");
      tokens.push({ kind: "icon", name });
      continue;
    }

    if (c === "#") {
      // Fill color: exactly six hex digits.
      i += 1;
      let hex = "";
      while (i < n && isHexDigit(line[i])) {
        hex += line[i]!;
        i += 1;
      }
      if (hex.length !== 6) fail(`color must be six hex digits, got #${hex}`);
      tokens.push({ kind: "color", value: `#${hex}` });
      continue;
    }

    if (c === "<") {
      if (line[i + 1] === "-") {
        if (line[i + 2] === ">") {
          tokens.push({ kind: "arrow", value: "<->" });
          i += 3;
          continue;
        }
        tokens.push({ kind: "arrow", value: "<-" });
        i += 2;
        continue;
      }
      fail("unexpected character '<'");
    }

    if (c === "-") {
      if (line[i + 1] === ">") {
        tokens.push({ kind: "arrow", value: "->" });
        i += 2;
        continue;
      }
      fail("unexpected character '-'");
    }

    if (isWordChar(c)) {
      let word = "";
      while (i < n && isWordChar(line[i])) {
        word += line[i]!;
        i += 1;
      }
      tokens.push({ kind: "word", value: word });
      continue;
    }

    fail(`unexpected character '${c}'`);
  }

  return tokens;
}

function readDigits(
  line: string,
  start: number,
  n: number,
  what: string,
): { value: number; next: number } {
  let i = start;
  let s = "";
  while (i < n && isDigit(line[i])) {
    s += line[i]!;
    i += 1;
  }
  if (s === "") fail(what);
  return { value: Number(s), next: i };
}

/**
 * Parse the header line. Returns the header, or null plus an error message if
 * the line is not a valid header.
 */
function parseHeader(line: string): { header: KumidrawHeader | null; error: string | null } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("# kumidraw")) {
    return { header: null, error: "missing '# kumidraw' header line" };
  }
  const rest = trimmed.slice("# kumidraw".length).trim();
  const settings: Record<string, string> = {};
  for (const pair of rest.split(/\s+/u)) {
    const eq = pair.indexOf(":");
    if (eq < 1) {
      return { header: null, error: `invalid header setting '${pair}'` };
    }
    settings[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  const version = settings.v;
  const grid = settings.grid;
  if (version === undefined) {
    return { header: null, error: "header missing version (v:)" };
  }
  if (!/^[0-9]+$/u.test(version)) {
    return { header: null, error: `invalid format version '${version}'` };
  }
  if (Number(version) !== VERSION) {
    return { header: null, error: `unsupported format version '${version}'` };
  }
  if (grid === undefined) {
    return { header: null, error: "header missing grid (grid:)" };
  }
  if (!/^[0-9]+$/u.test(grid)) {
    return { header: null, error: `invalid grid value '${grid}'` };
  }
  if (Number(grid) !== GRID) {
    return { header: null, error: `unsupported grid '${grid}', only ${GRID} is valid` };
  }
  return {
    header: {
      version: VERSION,
      grid: GRID,
      settings,
    },
    error: null,
  };
}

function isGroup(t: Token | undefined): t is Extract<Token, { kind: "group" }> {
  return t?.kind === "group";
}

function isQuoted(t: Token | undefined): t is Extract<Token, { kind: "quoted" }> {
  return t?.kind === "quoted";
}

function parseBox(tokens: Token[], report: (msg: string) => void): BoxElement | null {
  const box: BoxElement = {
    kind: "box",
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    dashed: false,
    noborder: false,
  };

  const pos = tokens[1];
  const size = tokens[2];
  if (!isGroup(pos)) {
    report("box needs a position '(x, y)' after 'box'");
    return null;
  }
  if (!isGroup(size)) {
    report("box needs a size '(w, h)' after the position");
    return null;
  }
  box.x = pos.a;
  box.y = pos.b;
  box.w = size.a;
  box.h = size.b;
  if (box.x < 0 || box.y < 0) report("box position must be non-negative");
  if (box.w < 1 || box.h < 1) report("box size must be positive");

  for (const t of tokens.slice(3)) {
    switch (t.kind) {
      case "group":
        report("unexpected '(a, b)' in box decorations");
        break;
      case "color":
        if (box.fill !== undefined) report("box has more than one fill color");
        else box.fill = t.value;
        break;
      case "icon":
        if (box.icon !== undefined) report("box has more than one icon");
        else box.icon = t.name;
        break;
      case "quoted":
        if (box.label !== undefined) report("box has more than one label");
        else box.label = t.text;
        break;
      case "arrow":
        report("arrowheads are not allowed on a box");
        break;
      case "word":
        switch (t.value) {
          case "dashed":
            if (box.dashed) report("box has more than one 'dashed'");
            else box.dashed = true;
            break;
          case "noborder":
            if (box.noborder) report("box has more than one 'noborder'");
            else box.noborder = true;
            break;
          default: {
            const anchor = anchorFromWord(t.value);
            if (anchor === null) {
              report(`unknown box decoration '${t.value}'`);
            } else if (box.anchor !== undefined) {
              report("box has more than one anchor");
            } else {
              box.anchor = anchor;
            }
          }
        }
        break;
    }
  }
  return box;
}

function parseLineStmt(tokens: Token[], report: (msg: string) => void): LineElement | null {
  const line: LineElement = { kind: "line", points: [] };
  let idx = 1;

  // Points come first, one after another, until a non-group token appears.
  while (idx < tokens.length) {
    const t = tokens[idx];
    if (!isGroup(t)) break;
    line.points.push({ x: t.a, y: t.b });
    idx += 1;
  }
  if (line.points.length < 2) {
    report("line needs at least two points");
    return null;
  }

  for (; idx < tokens.length; idx += 1) {
    const t = tokens[idx]!;
    switch (t.kind) {
      case "group":
        report("point after line styling is not allowed");
        break;
      case "quoted":
        if (line.label !== undefined) report("line has more than one label");
        else line.label = t.text;
        break;
      case "arrow":
        if (line.arrows !== undefined) report("line has more than one arrowhead");
        else line.arrows = arrowFor(t.value);
        break;
      case "color":
        report("colors are not allowed on a line");
        break;
      case "icon":
        report("icons are not allowed on a line");
        break;
      case "word":
        switch (t.value) {
          case "ortho":
          case "ortho-hv":
          case "ortho-vh":
          case "curve":
            if (line.routing !== undefined)
              report(`line has more than one routing (${line.routing} and ${t.value})`);
            else line.routing = t.value;
            break;
          default:
            report(`unknown line style '${t.value}'`);
        }
        break;
    }
  }
  return line;
}

function arrowFor(value: "->" | "<-" | "<->"): ArrowHeads {
  if (value === "<->") return "both";
  if (value === "<-") return "start";
  return "end";
}

function parseTextStmt(tokens: Token[], report: (msg: string) => void): TextElement | null {
  const pos = tokens[1];
  const quoted = tokens[2];
  if (!isGroup(pos)) {
    report("text needs a position '(x, y)' after 'text'");
    return null;
  }
  if (!isQuoted(quoted)) {
    report("text needs a quoted string");
    return null;
  }
  if (tokens.length > 3) {
    report("text has too many tokens");
  }
  if (pos.a < 0 || pos.b < 0) report("text position must be non-negative");
  return { kind: "text", x: pos.a, y: pos.b, text: quoted.text };
}

/**
 * Turn an unknown thrown value into a readable message. The tokenizer only
 * throws Error, but catch gets a bare `unknown`.
 */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Parse a full Kumidraw source string.
 */
export function parseKumidraw(source: string): KumidrawDoc {
  const lines = source.split(/\r?\n/u);
  const errors: KumidrawError[] = [];

  // The header must be the first line. Anything after a fatal header error is
  // not trustworthy, so stop there.
  if (lines.length === 0) {
    return {
      header: null,
      elements: [],
      errors: [{ line: 1, message: "empty file, missing '# kumidraw' header" }],
    };
  }
  const headerResult = parseHeader(lines[0]!);
  if (headerResult.header === null) {
    return {
      header: null,
      elements: [],
      errors: [{ line: 1, message: headerResult.error ?? "invalid header" }],
    };
  }

  const elements: KumidrawElement[] = [];

  const addError = (lineNo: number, message: string): void => {
    errors.push({ line: lineNo, message });
  };

  for (let i = 1; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const trimmed = raw.trim();

    if (trimmed === "") continue; // blank
    if (trimmed.startsWith("#")) continue; // comment

    let tokens: Token[];
    try {
      tokens = tokenize(trimmed);
    } catch (error) {
      addError(lineNo, errorMessage(error));
      continue;
    }

    const first = tokens[0];
    const report = (message: string): void => {
      addError(lineNo, message);
    };

    const keyword = first?.kind === "word" ? first.value : undefined;
    if (keyword === "box") {
      const el = parseBox(tokens, report);
      if (el !== null) elements.push(el);
    } else if (keyword === "line") {
      const el = parseLineStmt(tokens, report);
      if (el !== null) elements.push(el);
    } else if (keyword === "text") {
      const el = parseTextStmt(tokens, report);
      if (el !== null) elements.push(el);
    } else {
      report("unknown statement");
    }
  }

  return { header: headerResult.header, elements, errors };
}
