/**
 * KumiIcon — unified icon/emoji renderer.
 *
 * - Pass `emoji` to render a Fluent Emoji (modern 3D style).
 * - Pass `icon` to render a Fluent React Icon component directly.
 * - Certain "generic" emojis are silently upgraded to the equivalent
 *   high-quality Fluent Color icon so they look sharp at any size.
 *
 * The `size` prop controls pixel dimensions for both paths, solving the
 * issue where Color SVG icons render smaller than their CSS class implies.
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
