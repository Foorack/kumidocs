import cn from "@/lib/utils";
import { useCallback, useMemo, useRef, useState } from "react";
import { columnLetter, parseCsv, serializeCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  CodeXml,
  Copy,
  Download,
  ListMinus,
  ListPlus,
  MapMinus,
  MapPlus,
  SmilePlus,
  Undo2,
} from "lucide-react";
import EmojiPicker from "@/components/ui/emoji-picker";
import { Popover } from "radix-ui";
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
  "sticky top-0 z-10 bg-muted font-bold text-muted-foreground text-xs " +
  "border-r border-b border-border px-2 py-1 text-center";

const ROW_HEADER_CLASS =
  "sticky left-0 z-10 bg-muted font-bold text-muted-foreground text-xs " +
  "border-r border-b border-border px-2 py-1 text-center min-w-[36px] w-[36px]";

function CsvGrid({ value, readOnly = false, onChange, onSave }: CsvGridProps): JSX.Element {
  const initialData = useMemo(() => parseCsv(value), [value]);
  const [data, setData] = useState<string[][]>(initialData);
  const [focusedCell, setFocusedCell] = useState<{ col: number; row: number } | undefined>(
    undefined,
  );
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState(value);
  const [undoStack, setUndoStack] = useState<string[][][]>([]);
  const [focusMode, setFocusMode] = useState(false);

  // Sync internal data when `value` changes from external (server push)
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    setData(initialData);
    setRawText(value);
    setUndoStack([]);
  }

  // Re-parse raw text back into grid data when switching from raw to sheet mode
  const prevRawMode = useRef(rawMode);
  if (rawMode !== prevRawMode.current) {
    prevRawMode.current = rawMode;
    if (!rawMode) {
      setData(parseCsv(rawText));
    }
  }

  const rows = data.length;
  // oxlint-disable-next-line id-length
  const colCount = data.length > 0 ? Math.max(...data.map((r) => r.length), 1) : 1;

  const pushUndo = useCallback((): void => {
    setUndoStack((prev) => [...prev.slice(-30), data]);
  }, [data]);

  const persist = useCallback(
    (next: string[][]): void => {
      setData(next);
      const csv = serializeCsv(next);
      setRawText(csv);
      onChange?.(csv);
    },
    [onChange],
  );

  const handleUndo = useCallback((): void => {
    const last = undoStack.at(-1);
    if (last === undefined) {
      return;
    }
    setUndoStack((prev) => prev.slice(0, -1));
    persist(last);
  }, [undoStack, persist]);

  const handleCellChange = useCallback(
    (row: number, col: number, newValue: string): void => {
      pushUndo();
      // oxlint-disable-next-line id-length
      const next = data.map((r) => [...r]);
      const targetRow = next[row] ?? [];
      while (targetRow.length <= col) {
        targetRow.push("");
      }
      targetRow[col] = newValue;
      next[row] = targetRow;
      persist(next);
    },
    [data, persist, pushUndo],
  );

  const focusCell = useCallback((row: number, col: number): void => {
    setFocusedCell({ col, row });
    const key = `${row}-${col}`;
    setTimeout(() => {
      inputRefs.current.get(key)?.focus();
    }, 0);
  }, []);

  const handleInputRef = useCallback((el: HTMLInputElement | null): void => {
    if (el === null) {
      return;
    }
    const rowAttr = el.dataset.row;
    const colAttr = el.dataset.col;
    if (rowAttr !== undefined && colAttr !== undefined) {
      inputRefs.current.set(`${rowAttr}-${colAttr}`, el);
    }
  }, []);

  const handleKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLInputElement>, row: number, col: number): void => {
      if (onSave && (ev.ctrlKey || ev.metaKey) && ev.key === "s") {
        ev.preventDefault();
        onSave();
        return;
      }

      // F2 toggles focus mode
      if (ev.key === "F2") {
        ev.preventDefault();
        setFocusMode((prev) => !prev);
        return;
      }

      // Escape exits focus mode
      if (ev.key === "Escape" && focusMode) {
        ev.preventDefault();
        setFocusMode(false);
        return;
      }

      // In focus mode, arrow/Home/End work natively inside the input (text cursor)
      if (focusMode) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          setFocusMode(false);
          const nextRow = Math.max(0, Math.min(rows - 1, row + 1));
          focusCell(nextRow, col);
        }
        return;
      }

      const navigate = (dRow: number, dCol: number): void => {
        ev.preventDefault();
        focusCell(
          Math.max(0, Math.min(rows - 1, row + dRow)),
          Math.max(0, Math.min(colCount - 1, col + dCol)),
        );
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
        case "Home": {
          navigate(0, -col);
          break;
        }
        case "End": {
          navigate(0, colCount - 1 - col);
          break;
        }
        default: {
          break;
        }
      }
    },
    [rows, colCount, focusCell, onSave, focusMode],
  );

  // Column headers: A, B, ..., Z, AA, AB, ...
  // oxlint-disable-next-line id-length
  const colHeaders = Array.from({ length: colCount }, (_, idx) => columnLetter(idx));

  const thCornerStyle = { left: 0, top: 0, zIndex: 20 } as const;

  // --- Toolbar actions ---

  const handleCopy = useCallback((): void => {
    void navigator.clipboard.writeText(value);
    toast.success("CSV copied to clipboard");
  }, [value]);

  const handleDownload = useCallback((): void => {
    const blob = new Blob([value], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "data.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [value]);

  const handleAddRow = useCallback((): void => {
    pushUndo();
    const insertAt = focusedCell === undefined ? rows : focusedCell.row + 1;
    // oxlint-disable-next-line id-length
    const newRow = Array.from<string>({ length: colCount }).fill("");
    const next = [...data];
    next.splice(insertAt, 0, newRow);
    persist(next);
  }, [data, colCount, focusedCell, rows, persist, pushUndo]);

  const handleRemoveRow = useCallback((): void => {
    if (rows <= 1) {
      return;
    }
    pushUndo();
    const removeAt = focusedCell?.row ?? rows - 1;
    // oxlint-disable-next-line id-length
    const next = data.filter((_row, idx) => idx !== removeAt);
    persist(next);
    setFocusedCell(undefined);
  }, [data, rows, focusedCell, persist, pushUndo]);

  const handleAddCol = useCallback((): void => {
    pushUndo();
    const insertAt = focusedCell === undefined ? colCount : focusedCell.col + 1;
    // oxlint-disable-next-line id-length
    const next = data.map((r) => {
      const newRow = [...r];
      newRow.splice(insertAt, 0, "");
      return newRow;
    });
    persist(next);
  }, [data, colCount, focusedCell, persist, pushUndo]);

  const handleRemoveCol = useCallback((): void => {
    if (colCount <= 1) {
      return;
    }
    pushUndo();
    const removeAt = focusedCell?.col ?? colCount - 1;
    // oxlint-disable-next-line id-length
    const next = data.map((r) => r.filter((_cell, idx) => idx !== removeAt));
    persist(next);
    setFocusedCell(undefined);
  }, [data, colCount, focusedCell, persist, pushUndo]);

  const handleEmoji = useCallback(
    (emoji: string): void => {
      if (focusedCell === undefined) {
        return;
      }
      const { row, col } = focusedCell;
      const cellValue = (data[row] ?? [])[col] ?? "";
      handleCellChange(row, col, cellValue + emoji);
    },
    [focusedCell, data, handleCellChange],
  );

  // --- Shared cell renderer ---

  const renderCell = useCallback(
    (row: string[], rIdx: number, cIdx: number): JSX.Element => {
      const cellValue = row[cIdx] ?? "";
      if (readOnly) {
        return (
          <td key={cIdx} className={cn(CELL_CLASS, "bg-background")}>
            {cellValue}
          </td>
        );
      }
      const isFocused = (focusedCell?.row ?? -1) === rIdx && (focusedCell?.col ?? -1) === cIdx;
      let cellBorder = "";
      if (isFocused && focusMode) {
        cellBorder = "ring-1 ring-red ring-inset";
      } else if (isFocused) {
        cellBorder = "ring-1 ring-primary ring-inset";
      }
      return (
        <td key={cIdx} className="p-0">
          <input
            data-row={rIdx}
            data-col={cIdx}
            ref={handleInputRef}
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
            className={cn(CELL_CLASS, "h-full w-full bg-background", cellBorder)}
          />
        </td>
      );
    },
    [readOnly, focusedCell, handleInputRef, handleCellChange, handleKeyDown, focusMode],
  );

  // --- Shared table renderer ---

  const renderTable = useCallback(
    (): JSX.Element => (
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
              {Array.from({ length: colCount }, (_unused, cIdx) => renderCell(row, rIdx, cIdx))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    [data, colCount, colHeaders, thCornerStyle, renderCell],
  );

  // --- Toolbar rendering ---

  const toolbar = (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border shrink-0">
      {readOnly ? (
        <div />
      ) : (
        <div className="flex items-center gap-1">
          {rawMode ? (
            <></>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-green"
                onClick={handleAddRow}
                title="Add row below"
              >
                <ListPlus />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red"
                onClick={handleRemoveRow}
                title="Remove row"
              >
                <ListMinus />
              </Button>
              <div className="w-px h-4 bg-border mx-0.5" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-green"
                onClick={handleAddCol}
                title="Add column right"
              >
                <MapPlus />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red"
                onClick={handleRemoveCol}
                title="Remove column"
              >
                <MapMinus />
              </Button>
              <div className="w-px h-4 bg-border mx-0.5" />
            </>
          )}
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Insert emoji">
                <SmilePlus />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="bottom" align="start" sideOffset={4} className="z-50">
                <EmojiPicker
                  onEmojiSelect={(emoji: string): void => {
                    handleEmoji(emoji);
                  }}
                  autoFocus
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleUndo}
            title="Undo"
          >
            <Undo2 />
          </Button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(): void => {
              setRawMode(!rawMode);
            }}
            title="Toggle between Sheet/Raw"
          >
            <CodeXml />
          </Button>
        </div>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleCopy}
          title="Copy CSV"
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleDownload}
          title="Download CSV"
        >
          <Download />
        </Button>
      </div>
    </div>
  );

  // --- Raw text edit mode ---

  if (!readOnly && rawMode) {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <textarea
          className="h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-sm text-foreground focus:outline-none"
          value={rawText}
          onChange={(ev: ChangeEvent<HTMLTextAreaElement>): void => {
            setRawText(ev.target.value);
            onChange?.(ev.target.value);
          }}
          spellCheck={false}
        />
      </div>
    );
  }

  // --- Sheet view ---

  return (
    <div className="flex flex-col h-full">
      {toolbar}
      <div className="flex-1 overflow-auto">{renderTable()}</div>
    </div>
  );
}

export default CsvGrid;
