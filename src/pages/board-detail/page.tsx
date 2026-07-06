import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import Checkbox from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toaster";
import { deleteFile, getFile, getTree, putFile } from "@/lib/api";
import type { BoardColumn, BoardConfig } from "@/lib/board";
import { boardToYaml, displayColumnId, yamlToBoard } from "@/lib/board";
import type { DropResult } from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
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
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";

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

  const moveColumn = useCallback((from: number, to: number): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const cols = [...prev.columns];
      const moved = cols.splice(from, 1)[0];
      if (!moved) {
        return prev;
      }
      cols.splice(to, 0, moved);
      return { ...prev, columns: cols };
    });
  }, []);

  const handleDragEnd = useCallback(
    (result: DropResult): void => {
      if (!result.destination || result.source.index === result.destination.index) {
        return;
      }
      moveColumn(result.source.index, result.destination.index);
    },
    [moveColumn],
  );

  const removeColumn = useCallback((index: number): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, columns: prev.columns.filter((_unused, idx) => idx !== index) };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!config || !name) {
      return;
    }
    setSaving(true);
    try {
      // Normalize ids to storage format (lowercase with hyphens)
      const storageConfig = {
        ...config,
        columns: config.columns.map((col) => ({
          ...col,
          id: col.id.toLowerCase().replaceAll(/\s+/gu, "-"),
        })),
      };
      const yaml = boardToYaml(storageConfig);
      await putFile(`${name}.yaml`, yaml);
      toast.success("Board saved");
    } catch {
      toast.error("Failed to save board");
    } finally {
      setSaving(false);
    }
  }, [config, name]);

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
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Board not found
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Back link */}
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            void navigate("/bm");
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to boards
        </button>

        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="board-name">Board name</Label>
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

        {/* Prefix (locked after creation — matches board ID) */}
        <div className="space-y-1.5">
          <Label htmlFor="board-prefix">Ticket prefix</Label>
          <Input
            id="board-prefix"
            value={config.prefix}
            disabled
            className={`${INPUT_CLASS} w-32 font-mono uppercase opacity-60`}
            placeholder="PROJ"
            maxLength={10}
          />
          <p className="text-xs text-muted-foreground">
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

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="columns">
              {(droppableProvided) => (
                <div
                  ref={droppableProvided.innerRef}
                  {...droppableProvided.droppableProps}
                  className="space-y-2"
                >
                  {config.columns.map((col, index) => (
                    <Draggable
                      key={col.id || index}
                      draggableId={col.id || String(index)}
                      index={index}
                    >
                      {(draggableProvided) => (
                        // oxlint-disable typescript/no-unsafe-type-assertion
                        <div
                          ref={draggableProvided.innerRef}
                          {...(draggableProvided.draggableProps as React.HTMLAttributes<HTMLDivElement>)}
                          // oxlint-enable typescript/no-unsafe-type-assertion
                          className="rounded border-3 px-3 py-5 space-y-1.5"
                          style={{
                            backgroundColor: `${col.color}33`,
                            borderColor: col.color,
                          }}
                        >
                          {/* Line 1: grip + color + name + remove */}
                          <div className="flex items-center gap-2">
                            <div
                              {...draggableProvided.dragHandleProps}
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
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
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

                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
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
                      )}
                    </Draggable>
                  ))}
                  {droppableProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

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
            <p className="text-xs text-muted-foreground text-center py-4">
              No columns yet. Add at least one column.
            </p>
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
            <DialogTitle>Delete &ldquo;{config.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This action cannot be undone in the interface, but all history remains in Git.
            </DialogDescription>
          </DialogHeader>
          {deleteError !== "" && <p className="text-xs text-red px-6">{deleteError}</p>}
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
