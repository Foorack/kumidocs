import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { harden } from 'rehype-harden';
import { math } from '@streamdown/math';
import { memo } from 'react';
import { Streamdown, defaultRehypePlugins } from 'streamdown';
import type { Root, Element, ElementContent, RootContent } from 'hast';

// Inline rehype plugin — adds `id` to headings with no extra dependencies.
// Slug: lowercase → strip non-alphanumeric → spaces/underscores to hyphens → collapse hyphens.
function rehypeHeadingIds(): (tree: Root) => undefined {
	function nodeText(node: Element | ElementContent | RootContent): string {
		if (node.type === 'text') return node.value;
		if ('children' in node) return node.children.map(nodeText).join('');
		return '';
	}

	return (tree: Root) => {
		function walk(node: Root | RootContent): void {
			if (node.type === 'element' && /^h[1-6]$/.test(node.tagName) && node.properties) {
				node.properties.id ??= nodeText(node)
					.toLowerCase()
					.replace(/[^\w\s-]/g, '') // Remove non-alphanumeric chars except space, underscore, hyphen
					.trim()
					.replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
					.replace(/-+/g, '-'); // Collapse multiple hyphens into one
			}
			if ('children' in node) {
				for (const child of node.children) walk(child);
			}
		}
		walk(tree);
		return undefined;
	};
}

interface DocViewerProps {
	value: string;
}

export const DocViewer = memo(function DocViewer({ value }: DocViewerProps) {
	return (
		<div className="prose prose-table:my-0 prose-pre:my-0 prose-pre:bg-transparent dark:prose-invert max-w-none px-8 py-6">
			<Streamdown
				plugins={{
					cjk,
					code,
					math,
				}}
				shikiTheme={['github-light', 'github-dark']} // [light, dark]
				linkSafety={{ enabled: false }}
				components={{
					a: ({ href, children }) => {
						let target = href?.startsWith('#') ? '_self' : '_blank';
						if (href?.startsWith('mailto:')) target = '_blank';
						return (
							<a
								className="wrap-anywhere font-medium text-primary underline"
								data-incomplete="false"
								data-streamdown="link"
								href={href}
								rel="noopener noreferrer"
								target={target}
							>
								{children}
							</a>
						);
					},
				}}
				// When overriding rehypePlugins, always include defaultRehypePlugins.sanitize
				// to preserve XSS protection. The rehypePlugins prop replaces the entire
				// default array — it does not merge.
				rehypePlugins={[
					// COMMENTED OUT TO DISABLE RAW HTML
					// // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					// defaultRehypePlugins.raw!,

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					defaultRehypePlugins.sanitize!,

					[
						harden,
						{
							allowedProtocols: ['https', 'mailto'],
						},
					],

					// Custom anchor/slug plugin that adds id to headings
					rehypeHeadingIds,
				]}
			>
				{value}
			</Streamdown>
		</div>
	);
});
