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
import { resolveKumidrawIconHref } from "@/client/kumidraw-icons";
import { useCallback, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

const BORDER = 2;
const PAD = 20;
const ICON_SIZE = 32;
const CHIP_PAD = 4;
const CHIP_RADIUS = 4;
const FONT_SIZE = 13;
const BOX_BORDER = "#64748b";
const BOX_FILL = "#e2e8f0";
const TEXT_COLOR = "#1e293b";
const LINE_COLOR = "#475569";
const LINE_DASH = "6 4";

interface BoxCorner {
  /** Top-left position of the icon chip. */
  iconTopLeft: { x: number; y: number };
  /** Position (and anchoring) of the label to the right of the icon. */
  label: { x: number; y: number };
}

/** Compute where a box's icon and label sit. Placement is always top-left,
 * flush against the box frame with no inset. */
function boxCorner(box: BoxElement): BoxCorner {
  const iconX = box.x;
  const iconY = box.y;
  return {
    iconTopLeft: { x: iconX, y: iconY },
    label: {
      x: iconX + ICON_SIZE + 8,
      y: iconY + ICON_SIZE / 2 + FONT_SIZE / 2 - 1,
    },
  };
}

function renderBox(box: BoxElement, key: string): JSX.Element {
  const corner = boxCorner(box);
  const chipSize = ICON_SIZE + CHIP_PAD * 2;

  if (box.filled) {
    // Fill mode: a solid color block with no outline.
    const fillColor = box.color ?? BOX_FILL;
    return (
      <g key={key}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={fillColor} stroke="none" />
        {box.icon !== undefined && (
          <image
            href={resolveKumidrawIconHref(box.icon, ICON_SIZE)}
            x={corner.iconTopLeft.x}
            y={corner.iconTopLeft.y}
            width={ICON_SIZE}
            height={ICON_SIZE}
            pointerEvents="none"
          />
        )}
        {box.label !== undefined && (
          <text
            x={corner.label.x}
            y={corner.label.y}
            textAnchor="start"
            fontSize={FONT_SIZE}
            fill={TEXT_COLOR}
          >
            {box.label}
          </text>
        )}
      </g>
    );
  }

  // Border mode (default): an outline with a transparent interior.
  const borderColor = box.color ?? BOX_BORDER;
  const dash = box.dashed ? LINE_DASH : undefined;
  return (
    <g key={key}>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="none"
        stroke={borderColor}
        strokeWidth={BORDER}
        strokeDasharray={dash}
      />
      {box.icon !== undefined && (
        <rect
          x={corner.iconTopLeft.x}
          y={corner.iconTopLeft.y}
          width={chipSize}
          height={chipSize}
          rx={CHIP_RADIUS}
          fill={borderColor}
        />
      )}
      {box.icon !== undefined && (
        <image
          href={resolveKumidrawIconHref(box.icon, ICON_SIZE)}
          x={corner.iconTopLeft.x + CHIP_PAD}
          y={corner.iconTopLeft.y + CHIP_PAD}
          width={ICON_SIZE}
          height={ICON_SIZE}
          pointerEvents="none"
        />
      )}
      {box.label !== undefined && (
        <text
          x={corner.label.x}
          y={corner.label.y}
          textAnchor="start"
          fontSize={FONT_SIZE}
          fill={borderColor}
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
  const color = line.color ?? LINE_COLOR;
  const dash = line.dashed ? LINE_DASH : undefined;

  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={BORDER} strokeDasharray={dash} />
      {line.arrows === "start" && (
        <polygon points={arrowPath(vertices[1] as Point, first)} fill={color} />
      )}
      {line.arrows === "end" && (
        <polygon points={arrowPath(vertices[vertices.length - 2] as Point, last)} fill={color} />
      )}
      {line.arrows === "both" && (
        <g>
          <polygon points={arrowPath(vertices[1] as Point, first)} fill={color} />
          <polygon points={arrowPath(vertices[vertices.length - 2] as Point, last)} fill={color} />
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
            fill={TEXT_COLOR}
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
    <text key={key} x={text.x} y={text.y + FONT_SIZE} fontSize={FONT_SIZE} fill={TEXT_COLOR}>
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

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.15;

interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * Render a parsed Kumidraw document to SVG with interactive pan and zoom.
 * Scroll to zoom in/out around the cursor; click-and-drag to pan. Uses `svg`
 * viewBox units that match the format's coordinate space 1:1.
 */
function KumidrawDiagram({ doc, className }: KumidrawDiagramProps): JSX.Element {
  const e = docExtents(doc);
  const ids = useId();
  const baseW = Math.max(1, e.maxX - e.minX);
  const baseH = Math.max(1, e.maxY - e.minY);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; view: ViewState } | undefined>(
    undefined,
  );

  // The viewBox for scale=1, no pan centers the base extents.
  const [view, setView] = useState<ViewState>({ scale: 1, tx: e.minX, ty: e.minY });

  const handleWheel = useCallback(
    (event: ReactWheelEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (svg === null) {
        return;
      }
      const ctm = svg.getScreenCTM();
      if (ctm === null) {
        return;
      }
      // Invert the full screen transform (including CSS scaling and
      // preserveAspectRatio letterboxing) to get the user-space point under
      // the cursor, then zoom keeping that point fixed.
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const user = point.matrixTransform(ctm.inverse());
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale * factor));
      const ratio = newScale / view.scale;
      const nx = user.x - (user.x - view.tx) / ratio;
      const ny = user.y - (user.y - view.ty) / ratio;
      setView({ scale: newScale, tx: nx, ty: ny });
    },
    [view],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      dragRef.current = { startX: event.clientX, startY: event.clientY, view };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [view],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (drag === undefined || svg === null) {
      return;
    }
    const ctm = svg.getScreenCTM();
    if (ctm === null) {
      return;
    }
    const inv = ctm.inverse();
    // Translate by the pointer's movement in user units so panning stays
    // correct even when the SVG is scaled or letterboxed.
    const start = svg.createSVGPoint();
    start.x = drag.startX;
    start.y = drag.startY;
    const startUser = start.matrixTransform(inv);
    const current = svg.createSVGPoint();
    current.x = event.clientX;
    current.y = event.clientY;
    const currentUser = current.matrixTransform(inv);
    const dx = currentUser.x - startUser.x;
    const dy = currentUser.y - startUser.y;
    setView({
      scale: drag.view.scale,
      tx: drag.view.tx - dx,
      ty: drag.view.ty - dy,
    });
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = undefined;
  }, []);

  // The rendered viewBox is derived from the interactive view state.
  const renderedBox = `${view.tx} ${view.ty} ${baseW / view.scale} ${baseH / view.scale}`;

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={renderedBox}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden={doc.header === null}
      style={{
        cursor: dragRef.current === undefined ? "grab" : "grabbing",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onDoubleClick={() => {
        setView({ scale: 1, tx: e.minX, ty: e.minY });
      }}
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

export {
  kumidrawDimensions,
  KumidrawDiagram,
  renderBox,
  renderLine,
  renderText,
  boxCorner,
  lineVertices,
  arrowPath,
  BORDER,
  PAD,
  FONT_SIZE,
  ICON_SIZE,
  BOX_BORDER,
  BOX_FILL,
  TEXT_COLOR,
  LINE_COLOR,
  LINE_DASH,
  type BoxCorner,
  type KumidrawDiagramProps,
};
