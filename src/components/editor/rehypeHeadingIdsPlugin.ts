/**
 * rehypeHeadingIds — rehype plugin that adds `id` attributes to h1–h6 elements.
 *
 * Slug algorithm: lowercase → strip non-alphanumeric (keep space, _, -) → trim
 * → collapse spaces/underscores to hyphens → collapse repeated hyphens.
 */
import type { Root, Element, ElementContent, RootContent } from 'hast';

function nodeText(node: Element | ElementContent | RootContent): string {
	if (node.type === 'text') return node.value;
	if ('children' in node) return node.children.map(nodeText).join('');
	return '';
}

function walk(node: Root | RootContent): void {
	if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
		node.properties.id ??= nodeText(node)
			.toLowerCase()
			.replace(/[^\w\s-]/g, '') // strip non-alphanumeric except space, underscore, hyphen
			.trim()
			.replace(/[\s_]+/g, '-') // spaces and underscores → hyphens
			.replace(/-+/g, '-'); // collapse repeated hyphens
	}
	if ('children' in node) {
		for (const child of node.children) walk(child);
	}
}

export function rehypeHeadingIdsPlugin(): (tree: Root) => undefined {
	return (tree: Root) => {
		walk(tree);
		return undefined;
	};
}
