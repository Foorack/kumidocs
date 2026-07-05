import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import Checkbox from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toaster";
import { getFile, putFile } from "@/lib/api";
import type { BoardColumn, BoardConfig } from "@/lib/board";
import { boardToYaml, displayColumnId, yamlToBoard } from "@/lib/board";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

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
          id: col.id.toLowerCase().replace(/\s+/g, "-"),
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

          <div className="space-y-2">
            {config.columns.map((col, index) => (
              <div key={index} className="rounded border border-border p-2 space-y-1.5">
                {/* Line 1: color + name + remove */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={col.color}
                    onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                      updateColumn(index, "color", ev.target.value);
                    }}
                    className="w-8 h-9 cursor-pointer shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <Input
                      value={col.id}
                      onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                        const raw = ev.target.value
                          .replace(/[^a-zA-Z0-9\s-]/g, "")
                          .replace(/-/g, " ")
                          .toUpperCase();
                        updateColumn(index, "id", raw);
                      }}
                      className="h-8 text-sm w-full"
                      placeholder="column-id"
                    />
                    {col.id && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 px-1">
                        {displayColumnId(col.id)}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    onClick={() => {
                      removeColumn(index);
                    }}
                    title="Remove column"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Line 2: default radio + final checkbox */}
                <div className="flex items-center gap-4 pl-10">
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
            ))}
          </div>

          {config.columns.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No columns yet. Add at least one column.
            </p>
          )}
        </div>

        {/* Save */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BoardDetailPage;
