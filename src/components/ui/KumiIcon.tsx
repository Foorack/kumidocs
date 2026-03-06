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
	TextBulletListSquare20Color,
	SlideTextSparkle20Color,
	NumberSymbolSquare20Color,
} from '@fluentui/react-icons';

// Map specific emoji codepoints → Fluent Color icon components
// (keeps app-specific logic out of every call site)
const EMOJI_ICON_OVERRIDES: Record<string, FC<{ style?: CSSProperties; className?: string }>> = {
	'\u{1F4C4}': TextBulletListSquare20Color, // 📄 Page Facing Up
	'\u{1F4DD}': SlideTextSparkle20Color, // 📝 Memo
	'\u0023\uFE0F\u20E3': NumberSymbolSquare20Color, // #️⃣ Keycap #
};

interface KumiIconProps {
	/** Emoji character to render (may be overridden to a Color icon). */
	emoji?: string;
	/** Fluent React Icon component to render directly. */
	icon?: FC<{ style?: CSSProperties; className?: string }>;
	/** Pixel size for both the icon and the emoji. Default: 16. */
	size?: number;
	className?: string;
}

export function KumiIcon({ emoji, icon, size = 16, className }: KumiIconProps) {
	const style: CSSProperties = { width: size, height: size, flexShrink: 0 };

	// Emoji path — check for overrides first
	if (emoji) {
		const Override = EMOJI_ICON_OVERRIDES[emoji];
		if (Override) return <Override style={style} className={className} />;
		return <FluentEmoji emoji={emoji} size={size} type="modern" />;
	}

	// Explicit icon path
	if (icon) {
		const Icon = icon;
		return <Icon style={style} className={className} />;
	}

	return null;
}
