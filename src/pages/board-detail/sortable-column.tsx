import type { ChangeEvent, JSX } from "react";
import type { BoardColumn } from "@/lib/board";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import Input from "@/components/ui/input";
import Checkbox from "@/components/ui/checkbox";

export default function SortableColumn({
  col,
  index,
  updateColumn,
  setDefaultColumn,
  removeColumn,
  setColorPickerColumn,
}: {
  col: BoardColumn;
  index: number;
  updateColumn: (index: number, field: keyof BoardColumn, value: string | boolean) => void;
  setDefaultColumn: (index: number) => void;
  removeColumn: (index: number) => void;
  setColorPickerColumn: (index: number | undefined) => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id || String(index),
  });

  const style = {
    backgroundColor: `${col.color}33`,
    borderColor: col.color,
    opacity: isDragging ? 0.5 : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded border-3 px-3 py-5 space-y-1.5">
      {/* Line 1: grip + color + name + remove */}
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <button
          type="button"
          className="w-8 h-9 shrink-0 rounded border border-border cursor-pointer"
          style={{ backgroundColor: col.color }}
          onClick={() => {
            setColorPickerColumn(index);
          }}
          title="Pick color"
        />

        <Input
          value={col.id}
          onChange={(ev: ChangeEvent<HTMLInputElement>) => {
            const raw = ev.target.value
              .replaceAll(/[^a-zA-Z0-9\s-]/gu, "")
              .replaceAll("-", " ")
              .toUpperCase();
            updateColumn(index, "id", raw);
          }}
          className="h-8 text-sm w-full"
          placeholder="column-id"
        />

        <button
          type="button"
          className="p-1 rounded text-muted-foreground hover:text-red transition-colors shrink-0"
          onClick={() => {
            removeColumn(index);
          }}
          title="Remove column"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Line 2: default radio + final checkbox */}
      <div className="flex items-center gap-4 pl-[3.25rem]">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="default-column"
            checked={col.default === true}
            onChange={() => {
              setDefaultColumn(index);
            }}
            className="accent-border"
          />
          Default
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox
            checked={col.final}
            onCheckedChange={(checked) => {
              updateColumn(index, "final", checked === true);
            }}
          />
          Final
        </label>
      </div>
    </div>
  );
}
