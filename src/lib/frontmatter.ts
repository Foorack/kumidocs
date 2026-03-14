/**
 * Minimal client-side frontmatter parser for KumiDocs metadata.
 * Only reads the fields KumiDocs manages; all other YAML fields are intentionally
 * discarded — KumiDocs does not attempt to round-trip arbitrary frontmatter.
 *
 * Server-side code (filestore.ts, search.ts) uses gray-matter for full parsing.
 * This module exists to avoid a gray-matter browser-compatibility dependency.
 */

/** Whitelisted KumiDocs frontmatter fields. */
export interface PageMeta {
	emoji?: string;
	slides?: boolean;
	/** Deck-level theme for slide presentations: 'default' | 'dark' | 'corporate' | 'minimal' | 'gradient' */
	theme?: string;
	/** When true, slide numbers are shown on each slide canvas */
	paginate?: boolean;
	/** Custom variables substituted into theme element content strings via {{key}} */
	themeVars?: Record<string, string>;
}

/** Parse only the whitelisted KumiDocs frontmatter fields from a raw markdown string. */
export function parseFrontmatter(raw: string): { data: PageMeta; content: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { data: {}, content: raw };
	const block = match[1] ?? '';
	const content = raw.slice(match[0].length);
	const data: PageMeta = {};
	for (const line of block.split('\n')) {
		const kv = /^([\w-]+):\s*(.*)$/.exec(line.trim());
		if (!kv) continue;
		const key = kv[1];
		const val = kv[2] ?? '';
		if (!key) continue;
		if (key === 'emoji') data.emoji = val.trim();
		if (key === 'slides' && val.trim() === 'true') data.slides = true;
		if (key === 'theme') data.theme = val.trim();
		if (key === 'paginate' && val.trim() === 'true') data.paginate = true;
		if (key.startsWith('theme-var-')) {
			const varName = key.slice('theme-var-'.length);
			if (varName) (data.themeVars ??= {})[varName] = val.trim();
		}
	}
	return { data, content };
}

/** Serialise only the whitelisted KumiDocs frontmatter fields back to a YAML block. */
export function buildFrontmatter(meta: PageMeta): string {
	const lines: string[] = [];
	if (meta.emoji) lines.push(`emoji: ${meta.emoji}`);
	if (meta.slides) lines.push('slides: true');
	if (meta.theme && meta.theme !== 'default') lines.push(`theme: ${meta.theme}`);
	if (meta.paginate) lines.push('paginate: true');
	if (meta.themeVars) {
		for (const [k, v] of Object.entries(meta.themeVars)) {
			lines.push(`theme-var-${k}: ${v}`);
		}
	}
	if (lines.length === 0) return '';
	return `---\n${lines.join('\n')}\n---\n`;
}

/** Return the text of the first `# Heading` line in a markdown body, or null. */
export function extractHeadingTitle(body: string): string | null {
	for (const line of body.split('\n')) {
		if (line.startsWith('# ')) return line.slice(2).trim();
	}
	return null;
}
