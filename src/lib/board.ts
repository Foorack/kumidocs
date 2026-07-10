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
  /** Emails of users who have bookmarked this ticket. */
  bookmarks?: string[];
  column: string;
  /** ISO 8601 timestamp of creation. Set server-side, never changed. */
  createdAt?: string;
  /** When true, this ticket is a "golden ticket" -- always sorted to the top. */
  golden?: boolean;
  id: string;
  /** The person who created the ticket (display name or email). */
  reporter?: string;
  /** Ordered list of all non-comment, non-approval events. */
  timeline?: TimelineEntry[];
  title: string;
  /** ISO 8601 timestamp of last modification. Set server-side. */
  updatedAt?: string;
  comments?: TicketComment[];
  approvals?: TicketApproval[];
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
  status?: "approved" | "rejected";
  /** True when the content the approval was based on no longer matches the current ticket. */
  outdated?: boolean;
}

interface TimelineEntry {
  type: "status" | "golden";
  timestamp: string;
  user: string;
  from?: string;
  to?: string;
  golden?: boolean;
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
    ? rawApprovals
        .filter(
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
        .map((appr): TicketApproval => {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const apprRaw = appr as unknown as Record<string, unknown>;
          // oxlint-disable-next-line id-length
          const st = apprRaw.status;
          const result: TicketApproval = {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            hash: apprRaw.hash as string,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            timestamp: apprRaw.timestamp as string,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            user: apprRaw.user as string,
          };
          const od = apprRaw.outdated;
          if (st === "approved" || st === "rejected") {
            result.status = st;
          }
          if (od === true) {
            result.outdated = true;
          }
          return result;
        })
    : undefined;

  // Parse timeline entries
  const rawTimeline = obj.timeline;
  const timeline: TimelineEntry[] | undefined = Array.isArray(rawTimeline)
    ? rawTimeline.filter(
        (entry): entry is TimelineEntry =>
          typeof entry === "object" &&
          entry !== null &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (entry as Record<string, unknown>).type === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (entry as Record<string, unknown>).timestamp === "string" &&
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          typeof (entry as Record<string, unknown>).user === "string",
      )
    : undefined;

  const rawBookmarks = obj.bookmarks;
  const bookmarks: string[] | undefined = Array.isArray(rawBookmarks)
    ? rawBookmarks.filter(
        (bm): bm is string => typeof bm === "string" && bm !== "",
      )
    : undefined;

  return {
    approvals: approvals !== undefined && approvals.length > 0 ? approvals : undefined,
    assignee: typeof obj.assignee === "string" && obj.assignee !== "" ? obj.assignee : undefined,
    bookmarks: bookmarks !== undefined && bookmarks.length > 0 ? bookmarks : undefined,
    boardSlug,
    column: rawColumn === "" ? fallbackColumn : rawColumn,
    comments: comments !== undefined && comments.length > 0 ? comments : undefined,
    createdAt:
      typeof obj.createdAt === "string" && obj.createdAt !== "" ? obj.createdAt : undefined,
    golden: obj.golden === true,
    id: ticketId,
    reporter: typeof obj.reporter === "string" && obj.reporter !== "" ? obj.reporter : undefined,
    timeline: timeline !== undefined && timeline.length > 0 ? timeline : undefined,
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
  bookmarks?: string[];
  column: string;
  comments?: TicketComment[];
  createdAt?: string;
  golden?: boolean;
  reporter?: string;
  timeline?: TimelineEntry[];
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
  if (data.golden === true) {
    lines.push("golden: true");
  }

  if (data.bookmarks !== undefined && data.bookmarks.length > 0) {
    lines.push("bookmarks:");
    for (const email of data.bookmarks) {
      lines.push(`  - ${JSON.stringify(email)}`);
    }
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
      if (approval.status !== undefined) {
        lines.push(`    status: ${approval.status}`);
      }
    }
  }

  if (data.timeline !== undefined && data.timeline.length > 0) {
    lines.push("timeline:");
    // oxlint-disable-next-line id-length
    for (const entry of data.timeline) {
      lines.push(
        `  - type: ${entry.type}`,
        `    timestamp: ${JSON.stringify(entry.timestamp)}`,
        `    user: ${JSON.stringify(entry.user)}`,
      );
      if (entry.from !== undefined) {
        lines.push(`    from: ${JSON.stringify(entry.from)}`);
      }
      if (entry.to !== undefined) {
        lines.push(`    to: ${JSON.stringify(entry.to)}`);
      }
      if (entry.golden !== undefined) {
        lines.push(`    golden: ${entry.golden ? "true" : "false"}`);
      }
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
  bookmarks?: string[];
  column: string;
  comments?: TicketComment[];
  createdAt?: string;
  golden?: boolean;
  reporter?: string;
  timeline?: TimelineEntry[];
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
/** Map an approval to the EmojiIcon fileType for the correct icon. */
function approvalFileType(appr: TicketApproval): "approve" | "reject" | "outdated" {
  if (appr.outdated === true) {
    return "outdated";
  }
  if (appr.status === "rejected") {
    return "reject";
  }
  return "approve";
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
    bookmarks: updates.bookmarks ?? existing.bookmarks,
    column: updates.column ?? existing.column,
    comments: updates.comments ?? existing.comments,
    createdAt: existing.createdAt,
    golden: updates.golden ?? existing.golden,
    reporter: updates.reporter ?? existing.reporter,
    timeline: updates.timeline ?? existing.timeline,
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
  TimelineEntry,
  TicketYamlData,
};
export {
  boardToYaml,
  defaultBoardConfig,
  DEFAULT_COLUMNS,
  approvalFileType,
  displayColumnId,
  parseTicketYaml,
  patchTicketYaml,
  serializeTicket,
  ticketToYaml,
  yamlToBoard,
};
