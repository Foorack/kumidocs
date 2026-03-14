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
import { splitAtSecondH2 } from '@/lib/slide';
import type { ParsedSlide } from '@/lib/slide';
import { cn } from '@/lib/utils';

// ── Shared Streamdown renderer ────────────────────────────────────────────────
// Same rehype pipeline as MarkdownViewer; without dark:prose-invert since slide
// themes control their own bg/fg via CSS custom properties on .slide-canvas.

function SlideStreamdown({ value }: { value: string }) {
	return (
		<Streamdown
			mode="static"
			plugins={{ cjk, code, math }}
			shikiTheme={['github-light', 'github-dark']}
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
							className="wrap-anywhere font-medium underline"
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
			rehypePlugins={[
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				defaultRehypePlugins.sanitize!,
				[harden, { allowedLinkPrefixes: ['*'], allowedImagePrefixes: ['*'] }],
				rehypeHeadingIdsPlugin,
				rehypeImageAttrsPlugin,
				rehypeEmojiPlugin,
			]}
		>
			{value}
		</Streamdown>
	);
}

// ── prose base ────────────────────────────────────────────────────────────────
// No dark:prose-invert — slide themes handle their own colors via .slide-canvas.
const PROSE_BASE =
	'prose prose-table:my-0 prose-img:my-0 prose-pre:my-0 prose-pre:bg-transparent max-w-none slide-prose';

// ── SlideMarkdownViewer ───────────────────────────────────────────────────────

interface SlideMarkdownViewerProps {
	slide: ParsedSlide;
}

export const SlideMarkdownViewer = memo(function SlideMarkdownViewer({
	slide,
}: SlideMarkdownViewerProps) {
	const { content, directives } = slide;

	const isTitle = directives.classes.includes('title');
	const isSection = directives.classes.includes('section');
	const isSplit = directives.classes.includes('split');
	const isCenter = isTitle || isSection || directives.classes.includes('center');
	const isBlank = directives.classes.includes('blank');

	// Override --slide-fg so that .prose inherits the directive color via
	// `color: var(--slide-fg)` in the CSS — avoids fighting Tailwind prose specificity.
	const colorStyle = directives.color
		? ({ '--slide-fg': directives.color } as React.CSSProperties)
		: undefined;

	// ── Split layout: two columns divided at the second ## heading ────────────
	if (isSplit) {
		const [left, right] = splitAtSecondH2(content);
		return (
			<div className="flex h-full overflow-hidden" style={colorStyle}>
				<div className="flex-1 overflow-hidden">
					<div className={cn(PROSE_BASE, 'px-6 py-5')}>
						<SlideStreamdown value={left} />
					</div>
				</div>
				{/* Vertical divider */}
				<div className="w-px shrink-0 bg-current opacity-15" />
				<div className="flex-1 overflow-hidden">
					<div className={cn(PROSE_BASE, 'px-6 py-5')}>
						<SlideStreamdown value={right} />
					</div>
				</div>
			</div>
		);
	}

	// ── Center / title / section layouts ─────────────────────────────────────
	if (isCenter) {
		return (
			<div
				className="h-full flex flex-col items-center justify-center text-center overflow-hidden"
				style={colorStyle}
			>
				<div
					className={cn(
						PROSE_BASE,
						'px-12 py-8',
						isTitle && 'slide-prose-title',
						isSection && 'slide-prose-section',
					)}
				>
					<SlideStreamdown value={content} />
				</div>
			</div>
		);
	}

	// ── Default layout ────────────────────────────────────────────────────────
	return (
		<div style={colorStyle}>
			<div className={cn(PROSE_BASE, isBlank ? 'p-0' : 'px-8 py-6')}>
				<SlideStreamdown value={content} />
			</div>
		</div>
	);
});
