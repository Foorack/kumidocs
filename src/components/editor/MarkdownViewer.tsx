import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { harden } from 'rehype-harden';
import { math } from '@streamdown/math';
import { memo } from 'react';
import { Streamdown, defaultRehypePlugins } from 'streamdown';
import type { Element } from 'hast';
import { EmojiIcon } from '../ui/EmojiIcon';
import { rehypeEmojiPlugin } from './rehypeEmojiPlugin';
import { rehypeHeadingIdsPlugin } from './rehypeHeadingIdsPlugin';
import { rehypeImageAttrsPlugin } from './rehypeImageAttrsPlugin';

interface MarkdownViewerProps {
	value: string;
}

export const MarkdownViewer = memo(function MarkdownViewer({ value }: MarkdownViewerProps) {
	return (
		<div className="prose prose-table:my-0 prose-img:my-0 prose-pre:my-0 prose-pre:bg-transparent dark:prose-invert max-w-none px-8 py-6">
			<Streamdown
				plugins={{
					cjk,
					code,
					math,
				}}
				shikiTheme={['github-light', 'github-dark']} // [light, dark]
				linkSafety={{ enabled: false }}
				components={{
					'kumi-emoji': ({ node }: { node?: Element }) => {
						const raw = node?.properties.dataEmoji;
						const emoji = typeof raw === 'string' ? raw : '';
						return emoji ? (
							<EmojiIcon emoji={emoji} size="1.07lh" className="align-middle" />
						) : null;
					},
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
					// // ---
					// // Allow elements in the source to be rendered as raw HTML.
					// // Must be first in the list so it runs before sanitize/harden.
					// // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					// defaultRehypePlugins.raw!,

					// ---
					// Sanitize dangerous content
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					defaultRehypePlugins.sanitize!,

					// ---
					// Harden links
					[
						harden,
						{
							allowedLinkPrefixes: ['*'],
							allowedImagePrefixes: ['*'],
						},
					],

					// ---
					// Custom anchor/slug plugin that adds id to headings
					rehypeHeadingIdsPlugin,

					// ---
					// Parse {width=…} attribute blocks after images
					rehypeImageAttrsPlugin,

					// ---
					// Replace native emoji with FluentUI icons.
					// Runs last so the sanitizer/harden never touches the
					// generated <kumi-emoji> elements.
					rehypeEmojiPlugin,
				]}
			>
				{value}
			</Streamdown>
		</div>
	);
});
