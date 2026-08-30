import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { deleteFile, getFile, getTree, putFile } from "@/lib/api";
import type { BoardColumn, BoardConfig } from "@/lib/board";
import cn from "@/lib/utils";
import { boardToYaml, displayColumnId, yamlToBoard } from "@/lib/board";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ColorPicker,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerOutput,
  ColorPickerSelection,
} from "@/components/ui/color-picker";
import EmojiPickerPopover from "@/components/ui/emoji-picker-popover";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import SortableColumn from "./sortable-column";

interface OutletCtx {
  instanceName: string;
}

const INPUT_CLASS = "h-8 text-sm";

function BoardDetailPage(): JSX.Element {
  const { instanceName } = useOutletContext<OutletCtx>();
  const params = useParams<{ name: string }>();
  const name = params.name ?? "";
  const navigate = useNavigate();
  const [config, setConfig] = useState<BoardConfig | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [colorPickerColumn, setColorPickerColumn] = useState<number | undefined>(undefined);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  // YAML snapshot of the last persisted board state, used to detect unsaved
  // edits so navigating away can flush them first.
  const savedYamlRef = useRef<string | undefined>(undefined);
  const configRef = useRef<BoardConfig | undefined>(undefined);
  configRef.current = config;

  useEffect(() => {
    if (name === "") {
      return;
    }
    setLoading(true);
    const load = async (): Promise<void> => {
      try {
        const resp = await getFile(`${name}.yaml`);
        const parsed = await yamlToBoard(resp.content);
        if (parsed) {
          // Convert ids to display format (uppercase with spaces)
          parsed.columns = parsed.columns.map((col) => ({
            ...col,
            id: displayColumnId(col.id),
          }));
          setConfig(parsed);
          savedYamlRef.current = boardToYaml(parsed);
        }
      } catch {
        // Board not found or invalid YAML
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [name]);

  useEffect(() => {
    document.title = config ? `${config.name} | ${instanceName}` : `${name} | ${instanceName}`;
  }, [config, instanceName, name]);

  const updateName = useCallback((val: string) => {
    setConfig((prev) => (prev ? { ...prev, name: val } : prev));
  }, []);

  const updateIcon = useCallback((emoji: string) => {
    setConfig((prev) => (prev ? { ...prev, icon: emoji } : prev));
  }, []);

  const updateColumn = useCallback(
    (index: number, field: keyof BoardColumn, value: string | boolean) => {
      setConfig((prev) => {
        if (!prev) {
          return prev;
        }
        const cols = prev.columns.map((col, idx) =>
          idx === index ? { ...col, [field]: value } : col,
        );
        return { ...prev, columns: cols };
      });
    },
    [],
  );

  const setDefaultColumn = useCallback((index: number): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        columns: prev.columns.map((col, idx) => ({
          ...col,
          default: idx === index,
        })),
      };
    });
  }, []);

  const addColumn = useCallback((): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        columns: [...prev.columns, { color: "#6b7280", final: false, id: "" }],
      };
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const items = prev.columns.map((col, index) => col.id || String(index));
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) {
        return prev;
      }

      const cols = [...prev.columns];
      const moved = cols.splice(oldIndex, 1)[0];
      if (!moved) {
        return prev;
      }
      cols.splice(newIndex, 0, moved);
      return { ...prev, columns: cols };
    });
  }, []);

  const removeColumn = useCallback((index: number): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, columns: prev.columns.filter((_unused, idx) => idx !== index) };
    });
  }, []);

  // Normalize the working config to its storage YAML (ids become lowercase
  // with hyphens). Both handleSave and goBack use this, so they never differ.
  const storageYaml = useCallback(
    (cfg: BoardConfig): string =>
      boardToYaml({
        ...cfg,
        columns: cfg.columns.map((col) => ({
          ...col,
          id: col.id.toLowerCase().replaceAll(/\s+/gu, "-"),
        })),
      }),
    [],
  );

  const handleSave = useCallback(async () => {
    if (!config || !name) {
      return;
    }
    setSaving(true);
    try {
      const yaml = storageYaml(config);
      await putFile(`${name}.yaml`, yaml);
      savedYamlRef.current = yaml;
      toast.success("Board saved");
    } catch {
      toast.error("Failed to save board");
    } finally {
      setSaving(false);
    }
  }, [config, name, storageYaml]);

  // Navigate back to the board list, flushing any unsaved edits so they are
  // not silently dropped by leaving without pressing Save.
  const goBack = useCallback(async (): Promise<void> => {
    const cfg = configRef.current;
    if (cfg && name) {
      try {
        const yaml = storageYaml(cfg);
        if (yaml !== savedYamlRef.current) {
          await putFile(`${name}.yaml`, yaml);
          savedYamlRef.current = yaml;
        }
      } catch {
        toast.error("Failed to save board on exit");
      }
    }
    void navigate("/bm");
  }, [name, navigate, storageYaml]);

  const handleDelete = useCallback(async () => {
    if (!name || !config) {
      return;
    }
    setDeleteError("");
    setDeleting(true);
    try {
      // Collect final column ids (both display and storage format)
      const finalIds = new Set<string>();
      for (const col of config.columns) {
        if (col.final === true) {
          finalIds.add(col.id);
          finalIds.add(col.id.toLowerCase().replaceAll(/\s+/gu, "-"));
        }
      }

      // Check tickets in the board's directory
      const tree = await getTree();
      // oxlint-disable-next-line id-length
      const boardDir = tree.find((node) => node.type === "dir" && node.name === name);
      const ticketFiles =
        boardDir?.children?.filter(
          (child) => child.type === "file" && child.path.endsWith(".yaml"),
        ) ?? [];

      const results = await Promise.all(
        ticketFiles.map(async (child) => {
          try {
            const resp = await getFile(child.path);
            const { load } = await import("js-yaml");
            const parsed = load(resp.content);
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            const ticket = parsed as Record<string, unknown> | null;
            const ticketCol =
              typeof ticket?.column === "string" ? displayColumnId(ticket.column) : "";
            return { isOpen: ticketCol !== "" && !finalIds.has(ticketCol), name: child.name };
          } catch {
            return { isOpen: false, name: child.name };
          }
        }),
      );

      const openTickets = results.filter((result) => result.isOpen).map((result) => result.name);

      if (openTickets.length > 0) {
        setDeleteError(
          `Cannot delete board: ${openTickets.length} ticket(s) not in a final column. Move them to a final column first.`,
        );
        setDeleting(false);
        return;
      }

      await deleteFile(`${name}.yaml`);
      toast.success("Board deleted");
      setDeleteOpen(false);
      void navigate("/bm");
    } catch {
      setDeleteError("Failed to delete board");
    } finally {
      setDeleting(false);
    }
  }, [config, name, navigate]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  }

  if (!config) {
    return <div className="flex-1 flex items-center justify-center">Board not found</div>;
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Back link */}
        <button
          type="button"
          className="flex items-center gap-1 hover:opacity-70"
          onClick={() => {
            void goBack();
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to boards
        </button>

        {/* Icon + Name */}
        <div className="space-y-1.5">
          <Label htmlFor="board-name">Board name</Label>
          <div className="flex items-center gap-3">
            <EmojiPickerPopover
              emoji={config.icon}
              fileType="board"
              size={28}
              onSelect={updateIcon}
            />
            <Input
              id="board-name"
              value={config.name}
              onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                updateName(ev.target.value);
              }}
              className={INPUT_CLASS}
              placeholder="My Board"
            />
          </div>
        </div>

        {/* Prefix (matches board ID, locked after creation) */}
        <div className="space-y-1.5">
          <Label htmlFor="board-prefix">Ticket prefix</Label>
          <Input
            id="board-prefix"
            value={config.prefix}
            disabled
            className={cn(INPUT_CLASS, "w-32 font-mono uppercase opacity-60")}
            placeholder="PROJ"
            maxLength={10}
          />
          <p>
            Tickets will be numbered like {config.prefix || "PROJ"}-1, {config.prefix || "PROJ"}-2,
            etc.
          </p>
        </div>

        {/* Columns */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Columns</Label>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={addColumn}>
              <Plus className="w-3.5 h-3.5" />
              Add column
            </Button>
          </div>

          <DndContext onDragEnd={handleDragEnd}>
            <SortableContext
              items={config.columns.map((col, index) => col.id || String(index))}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {config.columns.map((col, index) => (
                  <SortableColumn
                    key={col.id || index}
                    col={col}
                    index={index}
                    updateColumn={updateColumn}
                    setDefaultColumn={setDefaultColumn}
                    removeColumn={removeColumn}
                    setColorPickerColumn={setColorPickerColumn}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <Dialog
            open={colorPickerColumn !== undefined}
            onOpenChange={(open) => {
              if (!open) {
                setColorPickerColumn(undefined);
              }
            }}
          >
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Column color</DialogTitle>
              </DialogHeader>
              {colorPickerColumn !== undefined && config.columns[colorPickerColumn] && (
                <ColorPicker
                  defaultValue={config.columns[colorPickerColumn].color}
                  className="h-auto"
                  onChange={(value: unknown) => {
                    const rgb: number[] = Array.isArray(value)
                      ? value.filter((val): val is number => typeof val === "number")
                      : [0, 0, 0];
                    const [red = 0, green = 0, blue = 0] = rgb;
                    const hex = `#${[red, green, blue]
                      .map((val) => Math.round(val).toString(16).padStart(2, "0"))
                      .join("")}`;
                    updateColumn(colorPickerColumn, "color", hex);
                  }}
                >
                  <ColorPickerSelection className="h-36 rounded-lg" />
                  <ColorPickerHue />
                  <div className="flex items-center gap-2">
                    <ColorPickerOutput />
                    <ColorPickerFormat />
                  </div>
                </ColorPicker>
              )}
            </DialogContent>
          </Dialog>

          {config.columns.length === 0 && (
            <p className="text-center py-4">No columns yet. Add at least one column.</p>
          )}
        </div>

        {/* Save + Delete */}
        <div className="flex justify-between pt-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red border-red/30 hover:border-red"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Delete board
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &quot;{config.name}&quot;?</DialogTitle>
            <DialogDescription>
              This action cannot be undone in the interface, but all history remains in Git.
            </DialogDescription>
          </DialogHeader>
          {deleteError !== "" && <p className="text-red px-6">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteError("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BoardDetailPage;
