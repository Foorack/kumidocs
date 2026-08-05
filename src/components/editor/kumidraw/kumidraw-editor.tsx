// Interactive editor for Kumidraw diagrams.
//
// Mirrors the CSV grid pattern: the diagram is shown on an interactive SVG
// canvas and the whole file is re-serialized on every edit, so the model and
// the source text never drift apart. A toolbar offers drawing tools (box,
// line, text), select/move/resize, per-element properties, and a Raw toggle
// back to the plain text editor.
//
// Coordinates snap to the fixed grid (10) on the way in and out, matching
// what the renderer and parser already guarantee.
//
// A few pedantic lint rules are disabled for the interactive bits. The pointer
// handlers and the string-to-union conversions for arrowheads and routing read
// more clearly with shorthand arrow bodies and direct casts; the complexity
// and formatting-pedantry churn would only bury the interaction logic. None of
// these disabled rules flag correctness bugs.

/* oxlint-disable
   eslint/complexity,
   eslint/no-use-before-define,
   eslint/no-nested-ternary,
   eslint/sort-keys,
   oxc/branches-sharing-code,
   typescript/no-confusing-void-expression,
   typescript/no-unsafe-type-assertion,
   typescript/no-unnecessary-type-assertion,
   typescript/non-nullable-type-assertion-style,
   typescript/prefer-nullish-coalescing,
   typescript/prefer-optional-chain,
   unicorn/no-nested-ternary,
   unicorn/prefer-spread
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BoxElement,
  KumidrawDoc,
  KumidrawElement,
  LineElement,
  TextElement,
} from "@/lib/kumidraw/types";
import { parseKumidraw } from "@/lib/kumidraw/parser";
import { serializeKumidraw } from "@/lib/kumidraw/serialize";
import { FONT_SIZE, PAD, lineVertices, renderBox, renderLine, renderText } from "@/lib/kumidraw/render";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import Separator from "@/components/ui/separator";
import Checkbox from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Box as BoxIcon,
  CodeXml,
  Delete,
  MousePointer2,
  Minus,
  Type,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ChangeEvent, ReactNode } from "react";

interface KumidrawEditorProps {
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
}

type Tool = "select" | "box" | "line" | "text";
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const GRID = 10;
const HANDLE_SIZE = 8;
const SELECT_COLOR = "#3b82f6";
const ZOOM = 1;

interface Point {
  x: number;
  y: number;
}

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function snap(value: number): number {
  return Math.max(0, Math.round(value / GRID) * GRID);
}

function snapPoint(p: Point): Point {
  return { x: snap(p.x), y: snap(p.y) };
}

/** Which box-resize corner handle, if any, a pointer is over. */
function handleAt(p: Point, el: BoxElement): Handle | undefined {
  const x = snap(p.x);
  const y = snap(p.y);
  const hit = 6;
  if (x >= el.x - hit && x <= el.x + hit && y >= el.y - hit && y <= el.y + hit) {
    return "nw";
  }
  if (x >= el.x + el.w - hit && x <= el.x + el.w + hit && y >= el.y - hit && y <= el.y + hit) {
    return "ne";
  }
  if (x >= el.x - hit && x <= el.x + hit && y >= el.y + el.h - hit && y <= el.y + el.h + hit) {
    return "sw";
  }
  if (x >= el.x + el.w - hit && x <= el.x + el.w + hit && y >= el.y + el.h - hit && y <= el.y + el.h + hit) {
    return "se";
  }
  return undefined;
}

function boxHit(box: BoxElement, p: Point): boolean {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

function textHit(text: TextElement, p: Point): boolean {
  const w = Math.max(40, text.text.length * FONT_SIZE * 0.62);
  return p.x >= text.x && p.x <= text.x + w && p.y >= text.y && p.y <= text.y + FONT_SIZE + 6;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function lineHit(line: LineElement, p: Point): boolean {
  const verts = lineVertices(line);
  const HIT = 6;
  for (let i = 0; i < verts.length - 1; i += 1) {
    if (distToSegment(p, verts[i] as Point, verts[i + 1] as Point) <= HIT) {
      return true;
    }
  }
  return false;
}

/** Shallow structural equality for two element arrays (flat, independent elements). */
function sameElements(a: KumidrawElement[], b: KumidrawElement[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (!sameElement(a[i] as KumidrawElement, b[i] as KumidrawElement)) {
      return false;
    }
  }
  return true;
}

function sameElement(a: KumidrawElement, b: KumidrawElement): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "box") {
    return sameBox(a, b as BoxElement);
  }
  if (a.kind === "text") {
    return sameText(a, b as TextElement);
  }
  return sameLine(a as LineElement, b as LineElement);
}

function sameBox(a: BoxElement, b: BoxElement): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.filled === b.filled &&
    a.dashed === b.dashed &&
    a.color === b.color &&
    a.icon === b.icon &&
    a.label === b.label
  );
}

function sameText(a: TextElement, b: TextElement): boolean {
  return a.x === b.x && a.y === b.y && a.text === b.text;
}

function sameLine(a: LineElement, b: LineElement): boolean {
  if (
    a.routing !== b.routing ||
    a.arrows !== b.arrows ||
    a.dashed !== b.dashed ||
    a.color !== b.color ||
    a.label !== b.label ||
    a.points.length !== b.points.length
  ) {
    return false;
  }
  for (let i = 0; i < a.points.length; i += 1) {
    const pa = a.points[i] as Point;
    const pb = b.points[i] as Point;
    if (pa.x !== pb.x || pa.y !== pb.y) {
      return false;
    }
  }
  return true;
}

function docExtents(doc: KumidrawDoc): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const el of doc.elements) {
    if (el.kind === "box") {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.w);
      maxY = Math.max(maxY, el.y + el.h);
    } else if (el.kind === "text") {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + 120);
      maxY = Math.max(maxY, el.y + FONT_SIZE);
    } else {
      for (const pt of el.points) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    }
  }
  const width = Math.max(400, maxX - minX + PAD * 2);
  const height = Math.max(300, maxY - minY + PAD * 2);
  return { minX: Math.max(0, minX - PAD), minY: Math.max(0, minY - PAD), maxX: minX - PAD + width, maxY: minY - PAD + height };
}

type DragState =
  | { mode: "move"; index: number; grab: Point; start: Point }
  | { mode: "resize"; index: number; handle: Handle; anchor: BoxRect; start: Point }
  | { mode: "draw-box"; start: Point; current: Point }
  | { mode: "draw-line"; start: Point; current: Point }
  | undefined;

function KumidrawEditor({
  value,
  readOnly = false,
  onChange,
  onSave,
}: KumidrawEditorProps): JSX.Element {
  const parsed = useMemo(() => parseKumidraw(value), [value]);
  const [elements, setElements] = useState<KumidrawElement[]>(parsed.elements);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [tool, setTool] = useState<Tool>("select");
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState(value);
  const dragRef = useRef<DragState>(undefined);
  const svgRef = useRef<SVGSVGElement>(null);

  // Sync from external value changes (server push) unless we are mid-edit.
  // Keep the current selection when the pushed content matches what we last
  // produced, so an auto-save round-trip does not drop the open property panel.
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current && dragRef.current === undefined) {
    prevValueRef.current = value;
    const pushed = parseKumidraw(value).elements;
    setElements(pushed);
    setRawText(value);
    if (!sameElements(pushed, elements)) {
      setSelected(undefined);
    }
  }

  // Re-parse raw text back into elements when switching off raw mode.
  const prevRawMode = useRef(rawMode);
  if (rawMode !== prevRawMode.current) {
    prevRawMode.current = rawMode;
    if (!rawMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElements(parseKumidraw(rawText).elements);
      setSelected(undefined);
    }
  }

  const header = parsed.header;

  const commit = useCallback(
    (next: KumidrawElement[]): void => {
      setElements(next);
      const text = serializeKumidraw({ header, elements: next, errors: [] });
      setRawText(text);
      onChange?.(text);
    },
    [header, onChange],
  );

  const updateElement = useCallback(
    (index: number, mutate: (el: KumidrawElement) => void): void => {
      setElements((prev) => {
        const next = prev.slice();
        const el = next[index] as KumidrawElement | undefined;
        if (el === undefined) {
          return prev;
        }
        mutate(el);
        commit(next);
        return next;
      });
    },
    [commit],
  );

  const extents = useMemo(
    () => docExtents({ header, elements, errors: [] }),
    [header, elements],
  );
  const worldW = Math.max(1, extents.maxX - extents.minX);
  const worldH = Math.max(1, extents.maxY - extents.minY);

  const screenToUser = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (svg === null) {
      return { x: 0, y: 0 };
    }
    const ctm = svg.getScreenCTM();
    if (ctm === null) {
      return { x: 0, y: 0 };
    }
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const user = pt.matrixTransform(ctm.inverse());
    return { x: user.x, y: user.y };
  }, []);

  const hitTest = useCallback(
    (p: Point): number => {
      for (let i = elements.length - 1; i >= 0; i -= 1) {
        const el = elements[i] as KumidrawElement | undefined;
        if (el === undefined) {
          continue;
        }
        if (el.kind === "box" && boxHit(el, p)) {
          return i;
        }
        if (el.kind === "text" && textHit(el, p)) {
          return i;
        }
        if (el.kind === "line" && lineHit(el, p)) {
          return i;
        }
      }
      return -1;
    },
    [elements],
  );

  const resize = useCallback(
    (index: number, handle: Handle, anchor: BoxRect, start: Point, current: Point): void => {
      updateElement(index, (target) => {
        if (target.kind !== "box") {
          return;
        }
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        let { x, y, w, h } = anchor;
        if (handle.includes("w")) {
          x += dx;
          w -= dx;
        }
        if (handle.includes("e")) {
          w += dx;
        }
        if (handle.includes("n")) {
          y += dy;
          h -= dy;
        }
        if (handle.includes("s")) {
          h += dy;
        }
        w = Math.max(20, w);
        h = Math.max(20, h);
        target.x = snap(x);
        target.y = snap(y);
        target.w = snap(w);
        target.h = snap(h);
      });
    },
    [updateElement],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => {
      if (readOnly) {
        return;
      }
      const p = screenToUser(event.clientX, event.clientY);

      if (tool === "box" || tool === "line") {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          mode: tool === "box" ? "draw-box" : "draw-line",
          start: p,
          current: p,
        };
        setSelected(undefined);
        return;
      }

      if (tool === "text") {
        const target: TextElement = { kind: "text", x: snap(p.x), y: snap(p.y), text: "text" };
        setElements((prev) => {
          const next = prev.slice();
          next.push(target);
          setSelected(next.length - 1);
          commit(next);
          return next;
        });
        return;
      }

      // select tool: pick what is under the pointer (resize handle first,
      // then an element), else clear the selection.
      const index = hitTest(p);
      if (index === -1) {
        setSelected(undefined);
        return;
      }
      const el = elements[index] as KumidrawElement | undefined;
      if (el === undefined) {
        return;
      }
      setSelected(index);
      event.currentTarget.setPointerCapture(event.pointerId);
      if (el.kind === "box") {
        const handle = handleAt(p, el);
        if (handle !== undefined) {
          dragRef.current = {
            mode: "resize",
            index,
            handle,
            anchor: { x: el.x, y: el.y, w: el.w, h: el.h },
            start: p,
          };
          return;
        }
      }
      const grab = {
        x: p.x - (el.kind === "line" ? 0 : el.x),
        y: p.y - (el.kind === "line" ? 0 : el.y),
      };
      dragRef.current = { mode: "move", index, grab, start: p };
    },
    [readOnly, screenToUser, tool, hitTest, elements, commit, handleAt],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => {
      const drag = dragRef.current;
      if (drag === undefined) {
        return;
      }
      const p = screenToUser(event.clientX, event.clientY);

      if (drag.mode === "draw-box" || drag.mode === "draw-line") {
        dragRef.current = { ...drag, current: p };
        return;
      }

      if (drag.mode === "resize") {
        resize(drag.index, drag.handle, drag.anchor, drag.start, p);
        return;
      }

      // move
      updateElement(drag.index, (el) => {
        if (el.kind === "line") {
          const dx = p.x - drag.start.x;
          const dy = p.y - drag.start.y;
          for (const pt of el.points) {
            pt.x = snap(pt.x + dx);
            pt.y = snap(pt.y + dy);
          }
        } else {
          el.x = snap(p.x - drag.grab.x);
          el.y = snap(p.y - drag.grab.y);
        }
      });
    },
    [screenToUser, resize, updateElement],
  );

  const handlePointerUp = useCallback((): void => {
    const drag = dragRef.current;
    if (drag !== undefined && (drag.mode === "draw-box" || drag.mode === "draw-line")) {
      const from = snapPoint(drag.start);
      const to = snapPoint(drag.current);
      setElements((prev) => {
        const next = prev.slice();
        if (drag.mode === "draw-box") {
          const x = Math.min(from.x, to.x);
          const y = Math.min(from.y, to.y);
          const w = Math.max(20, Math.abs(to.x - from.x));
          const h = Math.max(20, Math.abs(to.y - from.y));
          next.push({ kind: "box", x, y, w, h, filled: false, dashed: false });
          setSelected(next.length - 1);
        } else {
          next.push({ kind: "line", points: [from, to], dashed: false });
          setSelected(next.length - 1);
        }
        commit(next);
        return next;
      });
    }
    dragRef.current = undefined;
  }, [commit]);

  const deleteSelected = useCallback((): void => {
    if (selected === undefined) {
      return;
    }
    setElements((prev) => {
      const next = prev.slice();
      next.splice(selected, 1);
      setSelected(undefined);
      commit(next);
      return next;
    });
  }, [selected, commit]);

  useEffect(() => {
    const handler = (ev: globalThis.KeyboardEvent): void => {
      if ((ev.key === "Delete" || ev.key === "Backspace") && selected !== undefined) {
        ev.preventDefault();
        deleteSelected();
      }
      if (ev.key === "Escape") {
        setSelected(undefined);
      }
    };
    window.addEventListener("keydown", handler);
    return (): void => window.removeEventListener("keydown", handler);
  }, [selected, deleteSelected]);

  const selectedElement = selected === undefined ? undefined : (elements[selected] as KumidrawElement | undefined);

  const toolbar = (
    <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5 shrink-0">
      <Button
        variant={tool === "select" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(): void => setTool("select")}
        title="Select / move"
      >
        <MousePointer2 />
      </Button>
      <Button
        variant={tool === "box" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(): void => setTool("box")}
        title="Draw box (click-drag)"
      >
        <BoxIcon />
      </Button>
      <Button
        variant={tool === "line" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(): void => setTool("line")}
        title="Draw line (click-drag)"
      >
        <Minus />
      </Button>
      <Button
        variant={tool === "text" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(): void => setTool("text")}
        title="Add text (click)"
      >
        <Type />
      </Button>
      <div className="w-px h-4 bg-border mx-1" />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={deleteSelected}
        disabled={selected === undefined}
        title="Delete selected (Del)"
      >
        <Delete />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(): void => setRawMode(!rawMode)}
        title="Toggle between Diagram/Raw"
      >
        <CodeXml />
      </Button>
      <div className="flex-1" />
      <span className="text-xs text-muted-foreground font-mono">{elements.length} elements</span>
      <Button variant="ghost" size="sm" className="ml-2" onClick={onSave} disabled={onSave === undefined}>
        Save
      </Button>
    </div>
  );

  // --- Raw text edit mode ---
  if (rawMode) {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <textarea
          className="h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-sm text-foreground focus:outline-none"
          value={rawText}
          onChange={(ev): void => {
            setRawText(ev.target.value);
            onChange?.(ev.target.value);
          }}
          spellCheck={false}
        />
      </div>
    );
  }

  const drag = dragRef.current;

  return (
    <div className="flex flex-col h-full">
      {toolbar}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-auto">
          <svg
            ref={svgRef}
            className="h-full w-full"
            viewBox={`${extents.minX} ${extents.minY} ${worldW} ${worldH}`}
            xmlns="http://www.w3.org/2000/svg"
            style={{
              touchAction: "none",
              cursor: tool === "select" ? "default" : "crosshair",
              backgroundColor: "#ffffff",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <pattern id="kd-grid" width={GRID * ZOOM} height={GRID * ZOOM} patternUnits="userSpaceOnUse">
                <path
                  d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth={0.5 * ZOOM}
                />
              </pattern>
            </defs>
            <rect
              x={extents.minX}
              y={extents.minY}
              width={worldW}
              height={worldH}
              fill="url(#kd-grid)"
              stroke="#cbd5e1"
            />
            {elements.map((el, i) =>
              el.kind === "box" ? (
                renderBox(el, `kd-box-${i}`)
              ) : el.kind === "line" ? (
                renderLine(el, `kd-line-${i}`)
              ) : (
                renderText(el, `kd-text-${i}`)
              ),
            )}
            {drag !== undefined && (drag.mode === "draw-box" || drag.mode === "draw-line") && (
              <Drafter mode={drag.mode} start={drag.start} current={drag.current} />
            )}
            {selectedElement !== undefined && selectedElement.kind === "box" && (
              <SelectionChrome box={selectedElement} />
            )}
          </svg>
        </div>
        {selected !== undefined && selectedElement !== undefined && (
          <div className="w-60 border-l border-border bg-background overflow-y-auto p-3 shrink-0 space-y-3">
            <PropertyPanel
              element={selectedElement}
              onChange={(el): void => updateElement(selected, (target) => replaceProps(target, el))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function replaceProps(target: KumidrawElement, source: KumidrawElement): void {
  if (target.kind === "box" && source.kind === "box") {
    target.label = source.label;
    target.icon = source.icon;
    target.color = source.color;
    target.filled = source.filled;
    target.dashed = source.dashed;
  } else if (target.kind === "line" && source.kind === "line") {
    target.dashed = source.dashed;
    target.color = source.color;
    target.routing = source.routing;
    target.arrows = source.arrows;
    target.label = source.label;
  } else if (target.kind === "text" && source.kind === "text") {
    target.text = source.text;
  }
}

function Drafter({ mode, start, current }: { mode: "draw-box" | "draw-line"; start: Point; current: Point }): JSX.Element {
  if (mode === "draw-line") {
    return (
      <line
        x1={snap(start.x)}
        y1={snap(start.y)}
        x2={snap(current.x)}
        y2={snap(current.y)}
        stroke="#475569"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
    );
  }
  const x = Math.min(snap(start.x), snap(current.x));
  const y = Math.min(snap(start.y), snap(current.y));
  const w = Math.abs(snap(current.x) - snap(start.x));
  const h = Math.abs(snap(current.y) - snap(start.y));
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill="rgba(59,130,246,0.15)"
      stroke={SELECT_COLOR}
      strokeDasharray="4 4"
    />
  );
}

function SelectionChrome({ box }: { box: BoxElement }): JSX.Element {
  const pts: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  return (
    <g pointerEvents="none">
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="none"
        stroke={SELECT_COLOR}
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      {pts.map((p, i) => (
        <rect
          key={i}
          x={p.x - HANDLE_SIZE / 2}
          y={p.y - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill="#ffffff"
          stroke={SELECT_COLOR}
          strokeWidth={1.5}
        />
      ))}
    </g>
  );
}

const LABEL_COLORS = [
  "#64748b",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#e2e8f0",
];

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function BoxPanel({
  element,
  onChange,
}: {
  element: BoxElement;
  onChange: (el: KumidrawElement) => void;
}): JSX.Element {
  const set = (patch: Partial<BoxElement>): void => onChange({ ...element, ...patch });
  return (
    <div className="space-y-3">
      <Field label="Label">
        <Input
          value={element.label ?? ""}
          placeholder="(none)"
          onChange={(ev: ChangeEvent<HTMLInputElement>): void => set({ label: ev.target.value === "" ? undefined : ev.target.value })}
        />
      </Field>
      <Field label="Icon">
        <Input
          value={element.icon ?? ""}
          placeholder=":icon-name"
          onChange={(ev: ChangeEvent<HTMLInputElement>): void => set({ icon: ev.target.value === "" ? undefined : ev.target.value })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          id="kd-fill"
          checked={element.filled}
          onCheckedChange={(v: boolean | "indeterminate"): void => set({ dashed: v === true ? false : element.dashed, filled: v === true })}
        />
        <Label htmlFor="kd-fill" className="text-xs">Fill</Label>
        <Checkbox
          id="kd-dashed"
          checked={element.dashed}
          disabled={element.filled}
          onCheckedChange={(v: boolean | "indeterminate"): void => set({ dashed: v === true })}
        />
        <Label htmlFor="kd-dashed" className="text-xs">Dashed</Label>
      </div>
      <Field label="Color">
        <div className="flex flex-wrap gap-1">
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={(): void => set({ color: c === LABEL_COLORS[0] ? undefined : c })}
              className="h-6 w-6 rounded border border-border"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

function LinePanel({
  element,
  onChange,
}: {
  element: LineElement;
  onChange: (el: KumidrawElement) => void;
}): JSX.Element {
  const set = (patch: Partial<LineElement>): void => onChange({ ...element, ...patch });
  return (
    <div className="space-y-3">
      <Field label="Label">
        <Input
          value={element.label ?? ""}
          placeholder="(none)"
          onChange={(ev: ChangeEvent<HTMLInputElement>): void => set({ label: ev.target.value === "" ? undefined : ev.target.value })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          id="kd-line-dashed"
          checked={element.dashed}
          onCheckedChange={(v: boolean | "indeterminate"): void => set({ dashed: v === true })}
        />
        <Label htmlFor="kd-line-dashed" className="text-xs">Dashed</Label>
      </div>
      <Field label="Arrow">
        <Select
          value={element.arrows ?? "none"}
          onValueChange={(v: string): void => set({ arrows: v === "none" ? undefined : (v as LineElement["arrows"]) })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="end">→</SelectItem>
            <SelectItem value="start">←</SelectItem>
            <SelectItem value="both">↔</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Routing">
        <Select
          value={element.routing ?? "straight"}
          onValueChange={(v: string): void => set({ routing: v === "straight" ? undefined : (v as LineElement["routing"]) })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="straight">Straight</SelectItem>
            <SelectItem value="ortho">Ortho</SelectItem>
            <SelectItem value="ortho-hv">Ortho H-V</SelectItem>
            <SelectItem value="ortho-vh">Ortho V-H</SelectItem>
            <SelectItem value="curve">Curve</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Color">
        <div className="flex flex-wrap gap-1">
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={(): void => set({ color: c === LABEL_COLORS[0] ? undefined : c })}
              className="h-6 w-6 rounded border border-border"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

function TextPanel({
  element,
  onChange,
}: {
  element: TextElement;
  onChange: (el: KumidrawElement) => void;
}): JSX.Element {
  return (
    <Field label="Text">
      <Input
        value={element.text}
        onChange={(ev: ChangeEvent<HTMLInputElement>): void => onChange({ ...element, text: ev.target.value })}
      />
    </Field>
  );
}

function PropertyPanel({
  element,
  onChange,
}: {
  element: KumidrawElement;
  onChange: (el: KumidrawElement) => void;
}): JSX.Element {
  return (
    <>
      <div className="text-sm font-bold">Properties</div>
      <Separator />
      {element.kind === "box" && <BoxPanel element={element} onChange={onChange} />}
      {element.kind === "line" && <LinePanel element={element} onChange={onChange} />}
      {element.kind === "text" && <TextPanel element={element} onChange={onChange} />}
    </>
  );
}

export default KumidrawEditor;
