// Element model for the Kumidraw diagram format.
//
// This is the shape every parser returns and every renderer consumes. It is
// deliberately small: a diagram is a header plus a flat list of independent
// elements (box, line, text). See docs/kumidraw-spec.md for the format.

type Anchor = "topleft" | "top" | "topright" | "left" | "right" | "bottom";

type LineRouting = "ortho" | "ortho-hv" | "ortho-vh" | "curve";

type ArrowHeads = "start" | "end" | "both";

interface Point {
  x: number;
  y: number;
}

interface BoxElement {
  kind: "box";
  x: number;
  y: number;
  w: number;
  h: number;
  dashed: boolean;
  noborder: boolean;
  fill?: string;
  icon?: string;
  label?: string;
  anchor?: Anchor;
}

interface LineElement {
  kind: "line";
  points: Point[];
  routing?: LineRouting;
  arrows?: ArrowHeads;
  label?: string;
}

interface TextElement {
  kind: "text";
  x: number;
  y: number;
  text: string;
}

type KumidrawElement = BoxElement | LineElement | TextElement;

interface KumidrawHeader {
  version: number;
  grid: number;
  // Any settings the parser does not recognize are kept here. The reader
  // ignores them but preserves them so a writer can round-trip a file.
  settings: Record<string, string>;
}

interface KumidrawError {
  line: number;
  message: string;
}

interface KumidrawDoc {
  // null means the header failed to parse and the file is not renderable.
  header: KumidrawHeader | null;
  elements: KumidrawElement[];
  errors: KumidrawError[];
}

export type {
  Anchor,
  ArrowHeads,
  BoxElement,
  KumidrawDoc,
  KumidrawElement,
  KumidrawError,
  KumidrawHeader,
  LineElement,
  LineRouting,
  Point,
  TextElement,
};
