/**
 * rehypeEmoji — rehype plugin that replaces native emoji in text nodes with
 * <kumi-emoji data-emoji="..."> HAST elements for component substitution.
 *
 * Register this plugin LAST in rehypePlugins (after sanitize / harden) so the
 * generated elements are never stripped by the sanitizer.
 *
 * Pair with the `kumi-emoji` Streamdown component to render each emoji as a
 * crisp Fluent SVG via <EmojiIcon>.
 *
 * Coverage: keycaps (#️⃣), regional indicator flag pairs (🇺🇸),
 * pictographic emoji with optional skin-tone/VS-16, and ZWJ sequences (👨‍💻).
 */
import type { Root, ElementContent, RootContent } from 'hast';

// Regex literal (not string) so \p{...} is a valid Unicode property escape.
const EMOJI_RE =
	/(?:[*#0-9]\uFE0F?\u20E3|[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}[\p{Emoji_Modifier}\uFE0F]?(?:\u200D(?:\p{Extended_Pictographic}|\u2640\uFE0F?|\u2642\uFE0F?)[\p{Emoji_Modifier}\uFE0F]?)*)/gu;

function splitText(text: string): ElementContent[] | null {
	const re = new RegExp(EMOJI_RE.source, EMOJI_RE.flags);
	const parts: ElementContent[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text)) !== null) {
		const emoji = match[0];
		const start = match.index;
		if (start > lastIndex) {
			parts.push({ type: 'text', value: text.slice(lastIndex, start) });
		}
		parts.push({
			type: 'element',
			tagName: 'kumi-emoji',
			properties: { dataEmoji: emoji },
			children: [],
		});
		lastIndex = start + emoji.length;
	}
	if (parts.length === 0) return null;
	if (lastIndex < text.length) {
		parts.push({ type: 'text', value: text.slice(lastIndex) });
	}
	return parts;
}

function walk(node: Root | RootContent): void {
	if (node.type === 'element' && (node.tagName === 'code' || node.tagName === 'pre')) return;
	if (!('children' in node)) return;
	const children = node.children as ElementContent[];
	let i = 0;
	while (i < children.length) {
		const child = children[i];
		if (child === undefined) {
			i++;
			continue;
		}
		if (child.type === 'text') {
			const parts = splitText(child.value);
			if (parts !== null) {
				children.splice(i, 1, ...parts);
				i += parts.length;
				continue;
			}
		} else if ('children' in child) {
			walk(child);
		}
		i++;
	}
}

export function rehypeEmojiPlugin(): (tree: Root) => undefined {
	return (tree: Root) => {
		walk(tree);
		return undefined;
	};
}
