interface BoardColumn {
  color: string;
  default?: boolean;
  final?: boolean;
  id: string;
}

interface BoardConfig {
  columns: BoardColumn[];
  icon?: string;
  name: string;
  prefix: string;
}

interface TicketData {
  /** The person assigned to the ticket. */
  assignee?: string;
  /** The board this ticket belongs to. */
  boardSlug: string;
  column: string;
  /** ISO 8601 timestamp of creation. Set server-side, never changed. */
  createdAt?: string;
  id: string;
  /** The person who created the ticket (display name or email). */
  reporter?: string;
  title: string;
  /** ISO 8601 timestamp of last modification. Set server-side. */
  updatedAt?: string;
  comments?: TicketComment[];
  approvals?: TicketApproval[];
  statusHistory?: StatusEntry[];
}

interface TicketComment {
  user: string;
  timestamp: string;
  /** Markdown message body. */
  message: string;
}

interface TicketApproval {
  user: string;
  timestamp: string;
  /** SHA-256 of lower(email)+ticketId+title+body at time of approval. */
  hash: string;
}

interface StatusEntry {
  from: string;
  to: string;
  timestamp: string;
  user: string;
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
  ];
  if (config.icon !== undefined && config.icon !== "") {
    parts.push(`icon: ${JSON.stringify(config.icon)}`);
  }
  // oxlint-disable-next-line id-length
  parts.push(
    "columns:",
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
  );
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

  return {
    columns,
    icon: typeof obj.icon === "string" && obj.icon !== "" ? obj.icon : undefined,
    name: obj.name,
    prefix: obj.prefix,
  };
}

/** Parse a ticket's YAML string into TicketData. */
// oxlint-disable-next-line complexity
async function parseTicketYaml(
  raw: string,
  boardSlug: string,
  ticketId: string,
  defaultColumn = "",
): Promise<TicketData> {
  const fallbackColumn = defaultColumn;
  const defaultData: TicketData = {
    boardSlug,
    column: fallbackColumn,
    id: ticketId,
    title: ticketId,
  };

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
  const rawColumn = typeof obj.column === "string" ? obj.column : "";

  // Parse comments
  const rawComments = obj.comments;
  const comments: TicketComment[] | undefined = Array.isArray(rawComments)
    ? rawComments.filter(
        // oxlint-disable-next-line id-length
        (comment): comment is TicketComment =>
          typeof comment === "object" &&
          comment !== null &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (comment as Record<string, unknown>).user === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (comment as Record<string, unknown>).timestamp === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (comment as Record<string, unknown>).message === "string",
      )
    : undefined;

  // Parse approvals
  const rawApprovals = obj.approvals;
  const approvals: TicketApproval[] | undefined = Array.isArray(rawApprovals)
    ? rawApprovals.filter(
        // oxlint-disable-next-line id-length
        (approval): approval is TicketApproval =>
          typeof approval === "object" &&
          approval !== null &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (approval as Record<string, unknown>).user === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (approval as Record<string, unknown>).timestamp === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (approval as Record<string, unknown>).hash === "string",
      )
    : undefined;

  // Parse status history
  const rawHistory = obj.statusHistory;
  const statusHistory: StatusEntry[] | undefined = Array.isArray(rawHistory)
    ? rawHistory.filter(
        // oxlint-disable-next-line id-length
        (entry): entry is StatusEntry =>
          typeof entry === "object" &&
          entry !== null &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (entry as Record<string, unknown>).from === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (entry as Record<string, unknown>).to === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (entry as Record<string, unknown>).timestamp === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (entry as Record<string, unknown>).user === "string",
      )
    : undefined;

  return {
    approvals: approvals !== undefined && approvals.length > 0 ? approvals : undefined,
    assignee: typeof obj.assignee === "string" && obj.assignee !== "" ? obj.assignee : undefined,
    boardSlug,
    column: rawColumn === "" ? fallbackColumn : rawColumn,
    comments: comments !== undefined && comments.length > 0 ? comments : undefined,
    createdAt:
      typeof obj.createdAt === "string" && obj.createdAt !== "" ? obj.createdAt : undefined,
    id: ticketId,
    reporter: typeof obj.reporter === "string" && obj.reporter !== "" ? obj.reporter : undefined,
    statusHistory:
      statusHistory !== undefined && statusHistory.length > 0 ? statusHistory : undefined,
    title: typeof obj.title === "string" && obj.title !== "" ? obj.title : ticketId,
    updatedAt:
      typeof obj.updatedAt === "string" && obj.updatedAt !== "" ? obj.updatedAt : undefined,
  };
}

/** Serialize a ticket to a YAML string (without frontmatter). */
// oxlint-disable-next-line complexity
function ticketToYaml(data: {
  approvals?: TicketApproval[];
  assignee?: string;
  body?: string;
  column: string;
  comments?: TicketComment[];
  createdAt?: string;
  reporter?: string;
  statusHistory?: StatusEntry[];
  title: string;
  updatedAt?: string;
}): string {
  const lines: string[] = [
    `title: ${JSON.stringify(data.title)}`,
    `column: ${JSON.stringify(data.column)}`,
  ];
  if (data.createdAt !== undefined && data.createdAt !== "") {
    lines.push(`createdAt: ${JSON.stringify(data.createdAt)}`);
  }
  if (data.updatedAt !== undefined && data.updatedAt !== "") {
    lines.push(`updatedAt: ${JSON.stringify(data.updatedAt)}`);
  }
  if (data.reporter !== undefined && data.reporter !== "") {
    lines.push(`reporter: ${JSON.stringify(data.reporter)}`);
  }
  if (data.assignee !== undefined && data.assignee !== "") {
    lines.push(`assignee: ${JSON.stringify(data.assignee)}`);
  }

  // Serialize structured arrays as YAML
  if (data.comments !== undefined && data.comments.length > 0) {
    lines.push("comments:");
    // oxlint-disable-next-line id-length
    for (const comment of data.comments) {
      lines.push(
        `  - user: ${JSON.stringify(comment.user)}`,
        `    timestamp: ${JSON.stringify(comment.timestamp)}`,
      );
      if (comment.message.includes("\n")) {
        lines.push(`    message: |`);
        for (const ml of comment.message.split("\n")) {
          lines.push(`      ${ml}`);
        }
      } else {
        lines.push(`    message: ${JSON.stringify(comment.message)}`);
      }
    }
  }

  if (data.approvals !== undefined && data.approvals.length > 0) {
    lines.push("approvals:");
    // oxlint-disable-next-line id-length
    for (const approval of data.approvals) {
      lines.push(
        `  - user: ${JSON.stringify(approval.user)}`,
        `    timestamp: ${JSON.stringify(approval.timestamp)}`,
        `    hash: ${JSON.stringify(approval.hash)}`,
      );
    }
  }

  if (data.statusHistory !== undefined && data.statusHistory.length > 0) {
    lines.push("statusHistory:");
    // oxlint-disable-next-line id-length
    for (const entry of data.statusHistory) {
      lines.push(
        `  - from: ${JSON.stringify(entry.from)}`,
        `    to: ${JSON.stringify(entry.to)}`,
        `    timestamp: ${JSON.stringify(entry.timestamp)}`,
        `    user: ${JSON.stringify(entry.user)}`,
      );
    }
  }

  if (data.body !== undefined && data.body !== "") {
    // Use literal block scalar for multi-line body
    if (data.body.includes("\n")) {
      lines.push(`body: |`);
      for (const line of data.body.split("\n")) {
        lines.push(`  ${line}`);
      }
    } else {
      lines.push(`body: ${JSON.stringify(data.body)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

interface TicketYamlData {
  approvals?: TicketApproval[];
  assignee?: string;
  body?: string;
  column: string;
  comments?: TicketComment[];
  createdAt?: string;
  reporter?: string;
  statusHistory?: StatusEntry[];
  title: string;
  updatedAt?: string;
}

/**
 * Centralized function for building ticket YAML.
 * Every code path that updates a ticket must call this instead of
 * constructing ticketToYaml() args manually. If a field is added to
 * TicketYamlData, TypeScript will flag every call site, preventing
 * future bugs like data loss on drag / save / comment submission.
 */
function serializeTicket(data: TicketYamlData): string {
  return ticketToYaml(data);
}

/**
 * Read existing YAML, apply only the specified updates, serialize back.
 * Every other field is preserved automatically. Use this for partial
 * updates (e.g. dragging a ticket to a new column) -- instead of
 * listing every field, just say what changed.
 */
async function patchTicketYaml(
  raw: string,
  boardSlug: string,
  ticketId: string,
  updates: Partial<TicketYamlData>,
  defaultColumn?: string,
): Promise<string> {
  const { load } = await import("js-yaml");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsed = load(raw) as Record<string, unknown>;
  const existing = await parseTicketYaml(raw, boardSlug, ticketId, defaultColumn);

  return serializeTicket({
    approvals: updates.approvals ?? existing.approvals,
    assignee: updates.assignee ?? existing.assignee,
    body: updates.body ?? (typeof parsed.body === "string" ? parsed.body : undefined),
    column: updates.column ?? existing.column,
    comments: updates.comments ?? existing.comments,
    createdAt: existing.createdAt,
    reporter: updates.reporter ?? existing.reporter,
    statusHistory: updates.statusHistory ?? existing.statusHistory,
    title: updates.title ?? existing.title,
    updatedAt: existing.updatedAt,
  });
}

export type {
  BoardColumn,
  BoardConfig,
  TicketData,
  TicketComment,
  TicketApproval,
  StatusEntry,
  TicketYamlData,
};
export {
  boardToYaml,
  defaultBoardConfig,
  DEFAULT_COLUMNS,
  displayColumnId,
  parseTicketYaml,
  patchTicketYaml,
  serializeTicket,
  ticketToYaml,
  yamlToBoard,
};
