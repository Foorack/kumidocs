/**
 * KumiIcon — unified icon/emoji renderer.
 *
 * Two distinct icon libraries serve different purposes in KumiDocs:
 *
 *   @fluentui/react-icons  — SYSTEM ICONS
 *     UI chrome: file-type indicators, buttons, toolbar actions, etc.
 *     Use the `icon` prop to render one of these directly.
 *
 *   @lobehub/fluent-emoji  — SELECTABLE PAGE ICONS
 *     User-chosen emoji on pages/documents (modern 3D Fluent style).
 *     Use the `emoji` prop to render a character from this set.
 *
 * Certain generic fallback emojis (📄 📝 #️⃣) are automatically promoted
 * to the equivalent Fluent Color system icon — they look identical to the
 * user but render crisply at any size via SVG rather than text/bitmap.
 *
 * The `size` prop controls pixel dimensions for both paths, working around
 * the issue where Fluent Color SVGs ignore Tailwind `w-N h-N` classes.
 */
import type { FC, CSSProperties } from 'react';
import { FluentEmoji } from '@lobehub/fluent-emoji';
import {
	TextBulletListSquare24Color,
	SlideTextSparkle24Color,
	NumberSymbolSquare24Color,
	CodeRegular,
	ImageRegular,
	DocumentRegular,
} from '@fluentui/react-icons';

// Map specific emoji codepoints → Fluent Color icon components
// (keeps app-specific logic out of every call site)
const EMOJI_ICON_OVERRIDES: Record<string, FC<{ style?: CSSProperties; className?: string }>> = {
	'\u{1F4C4}': TextBulletListSquare24Color, // 📄 Page Facing Up
	'\u{1F4DD}': SlideTextSparkle24Color, // 📝 Memo
	'\u0023\uFE0F\u20E3': NumberSymbolSquare24Color, // #️⃣ Keycap #
};

// File type strings for KumiIcon — well-known values listed for autocomplete, open to any string
export type KumiFileType = 'doc' | 'slide' | 'code' | 'image' | (string & {});
const FILE_TYPE_ICONS: Record<string, FC<{ style?: CSSProperties; className?: string }>> = {
	doc: TextBulletListSquare24Color,
	slide: SlideTextSparkle24Color,
	code: CodeRegular,
	image: ImageRegular,
};

interface KumiIconProps {
	/** Emoji character to render (may be overridden to a Color icon). */
	emoji?: string;
	/** File type string ('doc' | 'slide' | 'code' | 'image') — rendered when no emoji is set. */
	fileType?: KumiFileType;
	/** Fluent React Icon component to render directly (lowest priority). */
	icon?: FC<{ style?: CSSProperties; className?: string }>;
	/** Pixel size for both the icon and the emoji. Default: 16. */
	size?: number;
	className?: string;
}

export function KumiIcon({ emoji, fileType, icon, size = 16, className }: KumiIconProps) {
	const wrapStyle: CSSProperties = {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: size,
		height: size,
		flexShrink: 0,
	};
	// Force the inner SVG/img to fill the wrapper exactly,
	// overriding any hardcoded width/height attributes.
	const innerStyle: CSSProperties = { width: '100%', height: '100%' };

	// Emoji path — check for overrides first
	if (emoji) {
		const Override = EMOJI_ICON_OVERRIDES[emoji];
		if (Override)
			return (
				<span style={wrapStyle} className={className}>
					<Override style={innerStyle} />
				</span>
			);
		return <FluentEmoji emoji={emoji} size={size} type="modern" />;
	}

	// File-type path — resolve icon from central map, fall back to DocumentRegular
	if (fileType) {
		const TypeIcon = FILE_TYPE_ICONS[fileType] ?? DocumentRegular;
		const isMuted = fileType === 'code' || fileType === 'image';
		return (
			<span style={wrapStyle} className={isMuted ? 'text-muted-foreground' : className}>
				<TypeIcon style={innerStyle} />
			</span>
		);
	}

	// Explicit icon path
	if (icon) {
		const Icon = icon;
		return (
			<span style={wrapStyle} className={className}>
				<Icon style={innerStyle} />
			</span>
		);
	}

	return null;
}
