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

// Djb2-inspired hash to fingerprint the applied style.
function styleFingerprint(attrs: Record<string, string>): number {
	const s = Object.entries(attrs)
		.map(([k, v]) => `${k}:${v}`)
		.join(';');
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) - h + s.charCodeAt(i)) | 0;
	}
	return ((h >>> 0) % 1_000_000) + 1;
}

// Apply a stylehash-N class to an element so Streamdown's memo comparators
// (which check className) see a change and force a re-render.
function applyHashToNode(el: Element, hash: string): void {
	const cls = el.properties.className;
	if (Array.isArray(cls)) {
		const filtered = cls.filter((c) => typeof c !== 'string' || !c.startsWith('stylehash-'));
		filtered.push(hash);
		el.properties.className = filtered;
	} else {
		const base = typeof cls === 'string' ? cls.replace(/\bstylehash-\S+/g, '').trim() : '';
		el.properties.className = base ? `${base} ${hash}` : hash;
	}
}

// Returns the hash that was applied, so callers can propagate it up the tree.
function applyAttrs(img: Element, attrs: Record<string, string>): string {
	const parts = Object.entries(attrs).map(([k, v]) => `${k}: ${v}`);
	const existing = typeof img.properties.style === 'string' ? img.properties.style : '';
	img.properties.style = existing ? `${existing}; ${parts.join('; ')}` : parts.join('; ');

	const fp = styleFingerprint(attrs);
	const hash = `stylehash-${String(fp)}`;
	applyHashToNode(img, hash);
	return hash;
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
						const hash = applyAttrs(child, attrs);
						// Also bust the parent element's memo (MemoParagraph wraps MemoImg
						// and has its own sameClassAndNode comparator — if the paragraph's
						// className doesn't change, MemoParagraph skips re-rendering entirely
						// and MemoImg never gets the updated props).
						if (node.type === 'element') {
							applyHashToNode(node, hash);
						}
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
