/** Minimal frontmatter parser. Only whitelisted fields are extracted. */

/** Whitelisted KumiDocs frontmatter fields. */
interface PageMeta {
  emoji?: string;
  slides?: boolean;
  /** Template name for page-mode rendering (e.g. "email-announcement"). */
  page?: string;
  /** Custom variables for page template interpolation via {{key}}. */
  pageVars?: Record<string, string>;
  /** Deck-level theme for slide presentations: 'default' | 'dark' | 'corporate' | 'minimal' | 'gradient' */
  theme?: string;
  /** When true, slide numbers are shown on each slide canvas */
  paginate?: boolean;
  /** Deck-level header text applied to every slide (may be overridden per-slide via directive) */
  header?: string;
  /** Deck-level footer text applied to every slide (may be overridden per-slide via directive) */
  footer?: string;
  /** Custom variables substituted into theme element content strings via {{key}} */
  themeVars?: Record<string, string>;
}

/** Apply a single key/value pair parsed from frontmatter to the PageMeta accumulator. */
const applyKv = (data: PageMeta, key: string, val: string): void => {
  const trimmedVal = val.trim();
  if (key === "emoji") {
    data.emoji = trimmedVal;
  }
  if (key === "slides" && trimmedVal === "true") {
    data.slides = true;
  }
  if (key === "theme") {
    data.theme = trimmedVal;
  }
  if (key === "paginate" && trimmedVal === "true") {
    data.paginate = true;
  }
  if (key === "header") {
    data.header = trimmedVal;
  }
  if (key === "footer") {
    data.footer = trimmedVal;
  }
  if (key.startsWith("theme-var-")) {
    const varName = key.slice("theme-var-".length);
    if (varName) {
      (data.themeVars ??= {})[varName] = trimmedVal;
    }
  }
  if (key === "page") {
    data.page = trimmedVal;
  }
  if (key.startsWith("page-var-")) {
    const varName = key.slice("page-var-".length);
    if (varName) {
      (data.pageVars ??= {})[varName] = trimmedVal;
    }
  }
};

/** Parse only the whitelisted KumiDocs frontmatter fields from a raw markdown string. */
const parseFrontmatter = (raw: string): { data: PageMeta; content: string } => {
  const match = /^---\r?\n(?<block>[\s\S]*?)\r?\n---\r?\n?/u.exec(raw);
  if (!match) {
    return { content: raw, data: {} };
  }
  const fullMatch = match.at(0) ?? "";
  const block = match.at(1) ?? "";
  const content = raw.slice(fullMatch.length);
  const data: PageMeta = {};
  for (const line of block.split("\n")) {
    const kv = /^(?<key>[\w-]+):\s*(?<value>.*)$/u.exec(line.trim());
    if (kv) {
      const key = kv.at(1);
      const val = kv.at(2) ?? "";
      if (key !== undefined && key !== "") {
        applyKv(data, key, val);
      }
    }
  }
  return { content, data };
};

/** Serialise only the whitelisted KumiDocs frontmatter fields back to a YAML block. */
const buildFrontmatter = (meta: PageMeta): string => {
  const lines: string[] = [];
  if (meta.emoji !== undefined && meta.emoji !== "") {
    lines.push(`emoji: ${meta.emoji}`);
  }
  if (meta.slides === true) {
    lines.push("slides: true");
  }
  if (meta.theme !== undefined && meta.theme !== "" && meta.theme !== "default") {
    lines.push(`theme: ${meta.theme}`);
  }
  if (meta.paginate === true) {
    lines.push("paginate: true");
  }
  if (meta.header !== undefined && meta.header !== "") {
    lines.push(`header: ${meta.header}`);
  }
  if (meta.footer !== undefined && meta.footer !== "") {
    lines.push(`footer: ${meta.footer}`);
  }
  if (meta.themeVars) {
    for (const [varKey, varValue] of Object.entries(meta.themeVars)) {
      lines.push(`theme-var-${varKey}: ${varValue}`);
    }
  }
  if (meta.page !== undefined && meta.page !== "") {
    lines.push(`page: ${meta.page}`);
  }
  if (meta.pageVars) {
    for (const [varKey, varValue] of Object.entries(meta.pageVars)) {
      lines.push(`page-var-${varKey}: ${varValue}`);
    }
  }
  if (lines.length === 0) {
    return "";
  }
  return `---\n${lines.join("\n")}\n---\n`;
};

/** Return the text of the first `# Heading` line in a markdown body, or undefined. */
const extractHeadingTitle = (body: string): string | undefined => {
  const HEADING_PREFIX = "# ";
  for (const line of body.split("\n")) {
    if (line.startsWith(HEADING_PREFIX)) {
      return line.slice(HEADING_PREFIX.length).trim();
    }
  }
  return undefined;
};

export type { PageMeta };
export { parseFrontmatter, buildFrontmatter, extractHeadingTitle };
