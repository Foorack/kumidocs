interface BoardColumn {
  color: string;
  final: boolean;
  name: string;
}

interface BoardConfig {
  columns: BoardColumn[];
  name: string;
  prefix: string;
}

const DEFAULT_COLUMNS: BoardColumn[] = [
  { color: "#6b7280", final: false, name: "Backlog" },
  { color: "#3b82f6", final: false, name: "In Progress" },
  { color: "#f59e0b", final: false, name: "Review" },
  { color: "#22c55e", final: true, name: "Done" },
];

function defaultBoardConfig(name: string, prefix: string): BoardConfig {
  return {
    columns: DEFAULT_COLUMNS.map((col) => ({ ...col })),
    name,
    prefix,
  };
}

const YAML_HEAD_RE = /^---[\s\S]*?---\r?\n/u;

/** Serialize a board config to a YAML string (without frontmatter). */
function boardToYaml(config: BoardConfig): string {
  const parts: string[] = [
    `name: ${JSON.stringify(config.name)}`,
    `prefix: ${JSON.stringify(config.prefix)}`,
    "columns:",
    // oxlint-disable-next-line id-length
    ...config.columns.flatMap((col) => [
      `  - name: ${JSON.stringify(col.name)}`,
      `    color: ${JSON.stringify(col.color)}`,
      `    final: ${String(col.final)}`,
    ]),
    "",
  ];
  return parts.join("\n");
}

/** Parse YAML string into a BoardConfig. Returns undefined on failure. */
async function yamlToBoard(raw: string): Promise<BoardConfig | undefined> {
  let yaml = raw;
  const fmMatch = YAML_HEAD_RE.exec(yaml);
  if (fmMatch) {
    yaml = yaml.slice(fmMatch[0].length);
  }

  let parsed: unknown;
  try {
    const { load } = await import("js-yaml");
    parsed = load(yaml);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name !== "string" || typeof obj.prefix !== "string") {
    return undefined;
  }
  if (!Array.isArray(obj.columns)) {
    return undefined;
  }

  const columns: BoardColumn[] = [];
  // oxlint-disable-next-line id-length
  for (const col of obj.columns) {
    if (typeof col !== "object" || col === null) {
      continue;
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, id-length
    const rawCol = col as Record<string, unknown>;
    columns.push({
      color: typeof rawCol.color === "string" ? rawCol.color : "#6b7280",
      final: rawCol.final === true,
      name: typeof rawCol.name === "string" ? rawCol.name : "",
    });
  }

  return { columns, name: obj.name, prefix: obj.prefix };
}

export type { BoardColumn, BoardConfig };
export { boardToYaml, defaultBoardConfig, DEFAULT_COLUMNS, yamlToBoard };
