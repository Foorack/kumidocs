/**
 * rehypeImageAttrs — rehype plugin that parses `{key=value …}` attribute blocks
 * written immediately after an image in Markdown, and applies them as inline CSS.
 *
 * Supported syntax (no spaces inside the braces):
 *   ![alt](/url){width=200px}
 *   ![alt](/url){width=50% height=auto}
 *   ![alt](/url){width=300px height=200px}
 *
 * Supported keys:  width, height, max-width, min-width, max-height, min-height
 * Values may be any valid CSS length: px, %, em, rem, vw, vh, or the keyword "auto".
 *
 * The block is removed from the rendered output after parsing.
 */
import type { Root, Element, ElementContent } from 'hast';

// Matches a {key=value …} block — no nested braces.
const ATTRS_RE = /^\{([^}]+)\}/;
// Matches individual key=value pairs. Values: alphanumeric chars plus - . % (no spaces).
const PAIR_RE = /([a-zA-Z-]+)=([\w.%]+)/g;

// CSS properties we allow to be set via this syntax.
const ALLOWED: ReadonlySet<string> = new Set([
	'width',
	'height',
	'max-width',
	'min-width',
	'max-height',
	'min-height',
]);

function parseBlock(raw: string): Record<string, string> | null {
	const attrs: Record<string, string> = {};
	let matched = false;
	let m: RegExpExecArray | null;
	PAIR_RE.lastIndex = 0;
	while ((m = PAIR_RE.exec(raw)) !== null) {
		const key = m[1];
		const val = m[2];
		if (key !== undefined && val !== undefined && ALLOWED.has(key.toLowerCase())) {
			attrs[key.toLowerCase()] = val;
			matched = true;
		}
	}
	return matched ? attrs : null;
}

function applyAttrs(img: Element, attrs: Record<string, string>): void {
	const parts = Object.entries(attrs).map(([k, v]) => `${k}: ${v}`);
	const existing = typeof img.properties.style === 'string' ? img.properties.style : '';
	img.properties.style = existing ? `${existing}; ${parts.join('; ')}` : parts.join('; ');
}

function walk(node: Root | Element): void {
	const children = node.children as ElementContent[];
	let i = 0;
	while (i < children.length) {
		const child = children[i];
		if (child === undefined) {
			i++;
			continue;
		}

		if (child.type === 'element' && child.tagName === 'img') {
			const sibling = children[i + 1];
			if (sibling?.type === 'text') {
				const m = ATTRS_RE.exec(sibling.value);
				if (m !== null) {
					const rawAttrs = m[1];
					if (rawAttrs === undefined) {
						i++;
						continue;
					}
					const attrs = parseBlock(rawAttrs);
					if (attrs !== null) {
						applyAttrs(child, attrs);
						const remaining = sibling.value.slice(m[0].length);
						if (remaining.trim()) {
							children.splice(i + 1, 1, { type: 'text', value: remaining });
						} else {
							children.splice(i + 1, 1);
						}
						i++;
						continue;
					}
				}
			}
		} else if ('children' in child) {
			walk(child);
		}

		i++;
	}
}

export function rehypeImageAttrsPlugin(): (tree: Root) => undefined {
	return (tree: Root) => {
		walk(tree);
		return undefined;
	};
}
