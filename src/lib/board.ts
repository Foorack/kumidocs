interface BoardColumn {
  color: string;
  default?: boolean;
  final?: boolean;
  id: string;
}

interface BoardConfig {
  columns: BoardColumn[];
  name: string;
  prefix: string;
}

interface TicketData {
  id: string;
  title: string;
  column: string;
  /** The board this ticket belongs to. */
  boardSlug: string;
}

const DEFAULT_COLUMNS: BoardColumn[] = [
  { color: "#bfbfbf", id: "not-now" },
  { color: "#1677ff", default: true, id: "maybe" },
  { color: "#faad14", id: "in-progress" },
  { color: "#13c2c2", id: "verify" },
  { color: "#52c41a", final: true, id: "done" },
];

function defaultBoardConfig(name: string, prefix: string): BoardConfig {
  return {
    columns: DEFAULT_COLUMNS.map((col) => ({ ...col })),
    name,
    prefix,
  };
}

const YAML_HEAD_RE = /^---[\s\S]*?---\r?\n/u;

/** Convert a column id (e.g. "in-review") to a display label (e.g. "IN REVIEW"). */
function displayColumnId(id: string): string {
  return id.replaceAll("-", " ").toUpperCase();
}

/** Serialize a board config to a YAML string (without frontmatter). */
function boardToYaml(config: BoardConfig): string {
  const parts: string[] = [
    `name: ${JSON.stringify(config.name)}`,
    `prefix: ${JSON.stringify(config.prefix)}`,
    "columns:",
    // oxlint-disable-next-line id-length
    ...config.columns.flatMap((col) => {
      const lines = [
        `  - id: ${JSON.stringify(col.id)}`,
        `    color: ${JSON.stringify(col.color)}`,
      ];
      if (col.final === true) {
        lines.push("    final: true");
      }
      if (col.default === true) {
        lines.push("    default: true");
      }
      return lines;
    }),
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
      default: rawCol.default === true,
      final: rawCol.final === true,
      id: typeof rawCol.id === "string" ? rawCol.id : "",
    });
  }

  return { columns, name: obj.name, prefix: obj.prefix };
}

/** Parse a ticket's YAML string into TicketData. */
async function parseTicketYaml(
  raw: string,
  boardSlug: string,
  ticketId: string,
): Promise<TicketData> {
  const defaultData: TicketData = { boardSlug, column: "", id: ticketId, title: ticketId };

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
    return defaultData;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return defaultData;
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const obj = parsed as Record<string, unknown>;
  return {
    boardSlug,
    column: typeof obj.column === "string" ? obj.column : "",
    id: ticketId,
    title: typeof obj.title === "string" && obj.title !== "" ? obj.title : ticketId,
  };
}

export type { BoardColumn, BoardConfig, TicketData };
export {
  boardToYaml,
  defaultBoardConfig,
  DEFAULT_COLUMNS,
  displayColumnId,
  parseTicketYaml,
  yamlToBoard,
};
