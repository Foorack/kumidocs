import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import Checkbox from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toaster";
import { getFile, putFile } from "@/lib/api";
import type { BoardColumn, BoardConfig } from "@/lib/board";
import { boardToYaml, yamlToBoard } from "@/lib/board";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const INPUT_CLASS = "h-8 text-sm";

function BoardDetailPage(): JSX.Element {
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

  const updateName = useCallback((val: string) => {
    setConfig((prev) => (prev ? { ...prev, name: val } : prev));
  }, []);

  const updatePrefix = useCallback((val: string) => {
    setConfig((prev) => (prev ? { ...prev, prefix: val } : prev));
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

  const addColumn = useCallback((): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        columns: [...prev.columns, { color: "#6b7280", final: false, name: "" }],
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
      const yaml = boardToYaml(config);
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

        {/* Prefix */}
        <div className="space-y-1.5">
          <Label htmlFor="board-prefix">Ticket prefix</Label>
          <Input
            id="board-prefix"
            value={config.prefix}
            onChange={(ev: ChangeEvent<HTMLInputElement>) => {
              updatePrefix(ev.target.value.toUpperCase());
            }}
            className={`${INPUT_CLASS} w-32 font-mono uppercase`}
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
              <div key={index} className="flex items-center gap-2 rounded border border-border p-2">
                {/* Color picker */}
                <input
                  type="color"
                  value={col.color}
                  onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                    updateColumn(index, "color", ev.target.value);
                  }}
                  className="w-8 h-8 rounded cursor-pointer border border-border"
                />

                {/* Column name */}
                <Input
                  value={col.name}
                  onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                    updateColumn(index, "name", ev.target.value);
                  }}
                  className="h-8 text-sm flex-1"
                  placeholder="Column name"
                />

                {/* Final toggle */}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                  <Checkbox
                    checked={col.final}
                    onCheckedChange={(checked) => {
                      updateColumn(index, "final", checked === true);
                    }}
                  />
                  Final
                </label>

                {/* Remove */}
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
                  onClick={() => {
                    removeColumn(index);
                  }}
                  title="Remove column"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
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
