// SVG renderer for a parsed Kumidraw document.
//
// Follows docs/kumidraw-spec.md, Section 7 (Rendering Rules). Everything is
// drawn at exact computed coordinates the parser produced; nothing is snapped.
// The component is a pure function of the parsed doc, so the same element is
// used both inside markdown (via the kumidraw streamdown component) and in a
// full-page view.
//
// A handful of pedantic lint rules are disabled for this file. Geometry code
// reads better with compact switch clauses and direct index access into
// guaranteed-nonempty point arrays; the assertion and sort-keys churn would
// only bury the math. None of these rules flag correctness bugs.

/* oxlint-disable
   eslint/sort-keys,
   typescript/no-unsafe-type-assertion,
   typescript/non-nullable-type-assertion-style,
   typescript/switch-exhaustiveness-check,
   unicorn/prefer-at,
   unicorn/switch-case-braces
*/

import type {
  BoxElement,
  KumidrawDoc,
  KumidrawElement,
  LineElement,
  Point,
  TextElement,
} from "./types";
import { resolveKumidrawIconHref } from "./icons";
import { useId } from "react";

const BORDER = 2;
const PAD = 20;
const ICON_SIZE = 32;
const INNER_PAD = 10;
const FONT_SIZE = 13;

interface BoxAnchor {
  icon: { x: number; y: number };
  label: { x: number; y: number };
  labelAnchor: "start" | "middle" | "end";
}

/** Compute where a box's icon and label sit, per the anchor token. */
function boxAnchor(box: BoxElement): BoxAnchor {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const innerLeft = box.x + INNER_PAD;
  const innerTop = box.y + INNER_PAD;
  const innerRight = box.x + box.w - INNER_PAD;
  const innerBottom = box.y + box.h - INNER_PAD;
  const iconHalf = ICON_SIZE / 2;

  switch (box.anchor) {
    case "topleft":
      return {
        icon: { x: innerLeft + iconHalf, y: innerTop + iconHalf },
        label: { x: innerLeft + ICON_SIZE + 8, y: innerTop + iconHalf + FONT_SIZE / 2 - 1 },
        labelAnchor: "start",
      };
    case "top":
      return {
        icon: { x: cx, y: innerTop + iconHalf },
        label: { x: cx, y: innerTop + ICON_SIZE + FONT_SIZE },
        labelAnchor: "middle",
      };
    case "topright":
      return {
        icon: { x: innerRight - iconHalf, y: innerTop + iconHalf },
        label: { x: innerRight, y: innerTop + iconHalf + FONT_SIZE / 2 - 1 },
        labelAnchor: "end",
      };
    case "left":
      return {
        icon: { x: innerLeft + iconHalf, y: cy },
        label: { x: innerLeft + ICON_SIZE + 8, y: cy + FONT_SIZE / 2 - 1 },
        labelAnchor: "start",
      };
    case "right":
      return {
        icon: { x: innerRight - iconHalf, y: cy },
        label: { x: innerRight, y: cy + FONT_SIZE / 2 - 1 },
        labelAnchor: "end",
      };
    case "bottom":
      return {
        icon: { x: cx, y: innerBottom - iconHalf },
        label: { x: cx, y: innerBottom + FONT_SIZE },
        labelAnchor: "middle",
      };
    default:
      // No anchor: icon above the label, both centered on the box.
      return {
        icon: { x: cx, y: box.y + box.h / 2 - 20 },
        label: { x: cx, y: box.y + box.h / 2 + 22 },
        labelAnchor: "middle",
      };
  }
}

function boxStroke(box: BoxElement): string {
  if (box.noborder) {
    return "none";
  }
  return "#64748b";
}

function renderBox(box: BoxElement, key: string): JSX.Element {
  const anchor = boxAnchor(box);
  const fill = box.fill ?? "none";
  const stroke = boxStroke(box);
  const dash = box.dashed ? "6 4" : undefined;

  return (
    <g key={key}>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill={fill}
        stroke={stroke}
        strokeWidth={BORDER}
        strokeDasharray={dash}
      />
      {box.icon !== undefined && (
        <image
          href={resolveKumidrawIconHref(box.icon, ICON_SIZE)}
          x={anchor.icon.x - ICON_SIZE / 2}
          y={anchor.icon.y - ICON_SIZE / 2}
          width={ICON_SIZE}
          height={ICON_SIZE}
          pointerEvents="none"
        />
      )}
      {box.label !== undefined && (
        <text
          x={anchor.label.x}
          y={anchor.label.y}
          textAnchor={anchor.labelAnchor}
          fontSize={FONT_SIZE}
          fill="#1e293b"
        >
          {box.label}
        </text>
      )}
    </g>
  );
}

/** Build the straight or ortho polyline vertex list for a line. */
function lineVertices(line: LineElement): Point[] {
  if (line.routing === "curve") {
    return line.points;
  }
  if (line.routing === undefined) {
    return line.points;
  }
  // Ortho family: expand each segment into an elbow so every run is axis-aligned.
  const out: Point[] = [line.points[0] as Point];
  for (let i = 1; i < line.points.length; i += 1) {
    const prev = line.points[i - 1] as Point;
    const curr = line.points[i] as Point;
    if (line.routing === "ortho-vh") {
      out.push({ x: prev.x, y: curr.y });
    } else {
      // "ortho" and "ortho-hv" bend horizontal-then-vertical.
      out.push({ x: curr.x, y: prev.y });
    }
    out.push(curr);
  }
  return out;
}

function buildPolylinePath(points: Point[]): string {
  const first = points[0] as Point;
  let d = `M ${first.x} ${first.y}`;
  for (const p of points.slice(1)) {
    d += ` L ${p.x} ${p.y}`;
  }
  return d;
}

/** Catmull-Rom through all points, converted to cubic Beziers. */
function buildCurvePath(points: Point[]): string {
  if (points.length === 2) {
    return buildPolylinePath(points);
  }
  const p0 = points[0] as Point;
  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i] as Point;
    const p2 = points[i + 1] as Point;
    const prev = points[i - 1] ?? p1;
    const next = points[i + 2] ?? p2;
    const c1 = {
      x: p1.x + (p2.x - prev.x) / 6,
      y: p1.y + (p2.y - prev.y) / 6,
    };
    const c2 = {
      x: p2.x - (next.x - p1.x) / 6,
      y: p2.y - (next.y - p1.y) / 6,
    };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function arrowPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = 10;
  const perpX = -uy * size;
  const perpY = ux * size;
  // The tip sits just past the line end in the direction of travel, and the
  // base is a perpendicular fin at the end point. This makes the arrow point
  // FORWARD (from -> to) instead of back along the line.
  const tipX = to.x + ux * size;
  const tipY = to.y + uy * size;
  return `${tipX},${tipY} ${to.x + perpX},${to.y + perpY} ${to.x - perpX},${to.y - perpY}`;
}

function lineLabelPoint(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function renderLine(line: LineElement, key: string): JSX.Element {
  const vertices = lineVertices(line);
  const d = line.routing === "curve" ? buildCurvePath(vertices) : buildPolylinePath(vertices);
  const first = vertices[0] as Point;
  const last = vertices[vertices.length - 1] as Point;

  return (
    <g key={key}>
      <path d={d} fill="none" stroke="#475569" strokeWidth={BORDER} />
      {line.arrows === "start" && (
        <polygon points={arrowPath(vertices[1] as Point, first)} fill="#475569" />
      )}
      {line.arrows === "end" && (
        <polygon points={arrowPath(vertices[vertices.length - 2] as Point, last)} fill="#475569" />
      )}
      {line.arrows === "both" && (
        <g>
          <polygon points={arrowPath(vertices[1] as Point, first)} fill="#475569" />
          <polygon
            points={arrowPath(vertices[vertices.length - 2] as Point, last)}
            fill="#475569"
          />
        </g>
      )}
      {line.label !== undefined && (
        <g>
          <rect
            x={lineLabelPoint(vertices).x - 30}
            y={lineLabelPoint(vertices).y - 12}
            width={60}
            height={18}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          <text
            x={lineLabelPoint(vertices).x}
            y={lineLabelPoint(vertices).y + 4}
            textAnchor="middle"
            fontSize={FONT_SIZE - 4}
            fill="#1e293b"
          >
            {line.label}
          </text>
        </g>
      )}
    </g>
  );
}

function renderText(text: TextElement, key: string): JSX.Element {
  return (
    <text key={key} x={text.x} y={text.y + FONT_SIZE} fontSize={FONT_SIZE} fill="#1e293b">
      {text.text}
    </text>
  );
}

interface Span {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function elementSpan(el: KumidrawElement): Span {
  if (el.kind === "box") {
    return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
  }
  if (el.kind === "text") {
    return { minX: el.x, minY: el.y, maxX: el.x, maxY: el.y + FONT_SIZE };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of el.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function docExtents(doc: KumidrawDoc): Span {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const el of doc.elements) {
    const s = elementSpan(el);
    minX = Math.min(minX, s.minX);
    minY = Math.min(minY, s.minY);
    maxX = Math.max(maxX, s.maxX);
    maxY = Math.max(maxY, s.maxY);
  }
  if (Number.isFinite(minX)) {
    minX = Math.max(0, minX - PAD);
    minY = Math.max(0, minY - PAD);
  }
  return {
    minX,
    minY,
    maxX: maxX + PAD,
    maxY: maxY + PAD,
  };
}

/** The natural width and height of a rendered diagram, before scaling. */
function kumidrawDimensions(doc: KumidrawDoc): { width: number; height: number } {
  const e = docExtents(doc);
  return { width: Math.max(1, e.maxX - e.minX), height: Math.max(1, e.maxY - e.minY) };
}

interface KumidrawDiagramProps {
  doc: KumidrawDoc;
  title?: string;
  className?: string;
}

/**
 * Render a parsed Kumidraw document to SVG. Uses `svg` viewBox units that match
 * the format's coordinate space 1:1, so positions are pixel-accurate. Embed with
 * `width=100%` when you want the diagram to scale to its container.
 */
function KumidrawDiagram({ doc, className }: KumidrawDiagramProps): JSX.Element {
  const e = docExtents(doc);
  const ids = useId();

  return (
    <svg
      className={className}
      viewBox={`${e.minX} ${e.minY} ${e.maxX - e.minX} ${e.maxY - e.minY}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden={doc.header === null}
    >
      {doc.elements.map((el, i) => {
        if (el.kind === "box") {
          return renderBox(el, `${ids}-box-${i}`);
        }
        if (el.kind === "line") {
          return renderLine(el, `${ids}-line-${i}`);
        }
        return renderText(el, `${ids}-text-${i}`);
      })}
    </svg>
  );
}

export { kumidrawDimensions, KumidrawDiagram, type KumidrawDiagramProps };
