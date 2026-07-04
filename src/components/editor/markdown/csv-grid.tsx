import { useCallback, useMemo, useRef, useState } from "react";
import { columnLetter, parseCsv, serializeCsv } from "@/lib/csv";
import type { ChangeEvent, KeyboardEvent } from "react";

interface CsvGridProps {
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
}

const CELL_CLASS =
  "min-w-[80px] border-r border-b border-border px-2 py-1 text-sm " +
  "focus:outline-none focus:ring-1 focus:ring-primary focus:ring-inset";

const HEADER_CLASS =
  "sticky top-0 z-10 bg-muted font-semibold text-muted-foreground text-xs " +
  "border-r border-b border-border px-2 py-1 text-center";

const ROW_HEADER_CLASS =
  "sticky left-0 z-10 bg-muted font-semibold text-muted-foreground text-xs " +
  "border-r border-b border-border px-2 py-1 text-center min-w-[36px] w-[36px]";

function CsvGrid({ value, readOnly = false, onChange, onSave }: CsvGridProps): JSX.Element {
  const initialData = useMemo(() => parseCsv(value), [value]);
  const [data, setData] = useState<string[][]>(initialData);
  const [focusedCell, setFocusedCell] = useState<{ col: number; row: number } | undefined>(
    undefined,
  );
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Sync internal data when `value` changes from external (server push)
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    setData(initialData);
  }

  const rows = data.length;
  // oxlint-disable-next-line id-length
  const colCount = data.length > 0 ? Math.max(...data.map((r) => r.length), 1) : 1;

  const handleCellChange = useCallback(
    (row: number, col: number, newValue: string) => {
      // oxlint-disable-next-line id-length
      const next: string[][] = data.map((r, rIdx) => {
        if (rIdx === row) {
          // Target row: update the specific cell
          // oxlint-disable-next-line id-length
          const updated = r.map((c, cIdx) => (cIdx === col ? newValue : c));
          return updated;
        }
        if (rIdx > row && r.length < colCount) {
          // Pad shorter rows to match column count
          // oxlint-disable-next-line id-length
          return [...r, ...Array.from<string>({ length: colCount - r.length }).fill("")];
        }
        return r;
      });
      // Ensure target row exists and has enough columns
      const targetRow: string[] = next[row] ?? [];
      while (targetRow.length <= col) {
        targetRow.push("");
      }
      targetRow[col] = newValue;
      next[row] = targetRow;
      setData(next);
      onChange?.(serializeCsv(next));
    },
    [data, colCount, onChange],
  );

  const focusCell = useCallback((row: number, col: number): void => {
    setFocusedCell({ col, row });
    const key = `${row}-${col}`;
    requestAnimationFrame(() => {
      inputRefs.current.get(key)?.focus();
    });
  }, []);

  const handleKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLInputElement>, row: number, col: number): void => {
      if (onSave && (ev.ctrlKey || ev.metaKey) && ev.key === "s") {
        ev.preventDefault();
        onSave();
        return;
      }

      const navigate = (dRow: number, dCol: number): void => {
        ev.preventDefault();
        const nextRow = Math.max(0, Math.min(rows - 1, row + dRow));
        const nextCol = Math.max(0, Math.min(colCount - 1, col + dCol));
        focusCell(nextRow, nextCol);
      };

      switch (ev.key) {
        case "ArrowUp": {
          navigate(-1, 0);
          break;
        }
        case "ArrowDown": {
          navigate(1, 0);
          break;
        }
        case "ArrowLeft": {
          navigate(0, -1);
          break;
        }
        case "ArrowRight": {
          navigate(0, 1);
          break;
        }
        case "Tab": {
          navigate(0, ev.shiftKey ? -1 : 1);
          break;
        }
        case "Enter": {
          navigate(1, 0);
          break;
        }
        default: {
          break;
        }
      }
    },
    [rows, colCount, focusCell, onSave],
  );

  const setInputRef = useCallback(
    (row: number, col: number): ((el: HTMLInputElement | null) => void) =>
      (el: HTMLInputElement | null): void => {
        const key = `${row}-${col}`;
        if (el) {
          inputRefs.current.set(key, el);
        } else {
          inputRefs.current.delete(key);
        }
      },
    [],
  );

  // Column headers: A, B, ..., Z, AA, AB, ...
  // oxlint-disable-next-line id-length
  const colHeaders = Array.from({ length: colCount }, (_, idx) => columnLetter(idx));

  const thCornerStyle = { left: 0, top: 0, zIndex: 20 } as const;

  if (readOnly) {
    return (
      <div className="h-full overflow-auto">
        <table className="w-full border-separate border-spacing-0 border-l border-border">
          <thead>
            <tr>
              <th className={ROW_HEADER_CLASS} style={thCornerStyle}>
                #
              </th>
              {colHeaders.map((letter, cIdx) => (
                <th key={cIdx} className={HEADER_CLASS}>
                  {letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rIdx) => (
              <tr key={rIdx}>
                <td className={ROW_HEADER_CLASS} style={{ left: 0 }}>
                  {rIdx + 1}
                </td>
                {Array.from({ length: colCount }, (_unused, cIdx) => (
                  <td key={cIdx} className={`${CELL_CLASS} bg-background`}>
                    {row[cIdx] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Edit mode: editable grid
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-separate border-spacing-0 border-l border-border">
        <thead>
          <tr>
            <th className={ROW_HEADER_CLASS} style={thCornerStyle}>
              #
            </th>
            {colHeaders.map((letter, cIdx) => (
              <th key={cIdx} className={HEADER_CLASS}>
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rIdx) => (
            <tr key={rIdx}>
              <td className={ROW_HEADER_CLASS} style={{ left: 0 }}>
                {rIdx + 1}
              </td>
              {Array.from({ length: colCount }, (_unused, cIdx) => {
                const cellValue = row[cIdx] ?? "";
                const isFocused =
                  (focusedCell?.row ?? -1) === rIdx && (focusedCell?.col ?? -1) === cIdx;
                return (
                  <td key={cIdx} className="p-0">
                    <input
                      ref={setInputRef(rIdx, cIdx)}
                      value={cellValue}
                      onChange={(ev: ChangeEvent<HTMLInputElement>): void => {
                        handleCellChange(rIdx, cIdx, ev.target.value);
                      }}
                      onFocus={(): void => {
                        setFocusedCell({ col: cIdx, row: rIdx });
                      }}
                      onKeyDown={(ev: KeyboardEvent<HTMLInputElement>): void => {
                        handleKeyDown(ev, rIdx, cIdx);
                      }}
                      className={`${CELL_CLASS} h-full w-full bg-background ${
                        isFocused ? "ring-1 ring-primary ring-inset" : ""
                      }`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CsvGrid;
