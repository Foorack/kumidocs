import type React from 'react';
import type { SlideThemeElement } from '@/lib/slide';

// ── Canvas dimensions must match SlideViewer ─────────────────────────────────
const CANVAS_W = 960;
const CANVAS_H = 540;

// ── Position helper ───────────────────────────────────────────────────────────

function computePositionStyle(el: SlideThemeElement): React.CSSProperties {
	const s: React.CSSProperties = { position: 'absolute' };

	if (el.type === 'rect') {
		if (el.left !== undefined) s.left = el.left;
		if (el.right !== undefined) s.right = el.right;
		if (el.top !== undefined) s.top = el.top;
		if (el.bottom !== undefined) s.bottom = el.bottom;
		if (el.width !== undefined) {
			s.width = el.width;
		} else if (el.left !== undefined && el.right !== undefined) {
			s.width = CANVAS_W - el.left - el.right;
		}
		if (el.height !== undefined) {
			s.height = el.height;
		} else if (el.top !== undefined && el.bottom !== undefined) {
			s.height = CANVAS_H - el.top - el.bottom;
		}
	}

	if (el.type === 'text') {
		if (el.centerX) {
			s.left = '50%';
			s.transform = 'translateX(-50%)';
		} else {
			if (el.left !== undefined) s.left = el.left;
			if (el.right !== undefined) s.right = el.right;
		}
		if (el.centerY) {
			s.top = '50%';
			s.transform = (s.transform ? s.transform + ' ' : '') + 'translateY(-50%)';
		} else {
			if (el.top !== undefined) s.top = el.top;
			if (el.bottom !== undefined) s.bottom = el.bottom;
		}
	}

	if (el.type === 'image') {
		if (el.centerX) {
			s.left = '50%';
			s.transform = 'translateX(-50%)';
		} else {
			if (el.left !== undefined) s.left = el.left;
			if (el.right !== undefined) s.right = el.right;
		}
		if (el.centerY) {
			s.top = '50%';
			s.transform = (s.transform ? s.transform + ' ' : '') + 'translateY(-50%)';
		} else {
			if (el.top !== undefined) s.top = el.top;
			if (el.bottom !== undefined) s.bottom = el.bottom;
		}
		if (el.width !== undefined) {
			s.width = el.width;
		} else if (!el.centerX && el.left !== undefined && el.right !== undefined) {
			s.width = CANVAS_W - el.left - el.right;
		}
		if (el.height !== undefined) {
			s.height = el.height;
		} else if (!el.centerY && el.top !== undefined && el.bottom !== undefined) {
			s.height = CANVAS_H - el.top - el.bottom;
		}
	}

	return s;
}

// ── Template variable interpolation ──────────────────────────────────────────

function interpolate(
	template: string,
	vars: { slideNum: number; slideTotal: number; title: string },
	customVars?: Record<string, string>,
): string {
	let result = template
		.replace(/\{\{slideNum\}\}/g, String(vars.slideNum))
		.replace(/\{\{slideTotal\}\}/g, String(vars.slideTotal))
		.replace(/\{\{title\}\}/g, vars.title)
		.replace(/\{\{date:([^}]+)\}\}/g, (_, fmt: string) => {
			const now = new Date();
			return fmt
				.replace(/YYYY/g, String(now.getFullYear()))
				.replace(/MM/g, String(now.getMonth() + 1).padStart(2, '0'))
				.replace(/DD/g, String(now.getDate()).padStart(2, '0'));
		})
		.replace(/\{\{date\}\}/g, new Date().toISOString().slice(0, 10));
	if (customVars) {
		for (const [k, v] of Object.entries(customVars)) {
			result = result.replaceAll(`{{${k}}}`, v);
		}
	}
	return result;
}

// ── SVG dimension patcher ─────────────────────────────────────────────────────
// html2canvas renders <img src="...svg..."> at the SVG's own intrinsic size,
// ignoring CSS width/height, which crops the image to the top-left corner.
// Patching the SVG root's width/height attributes to match the display size
// before rendering tells html2canvas the correct raster dimensions.

function patchSvgDimensions(src: string, width?: number, height?: number): string {
	if (!src.startsWith('data:image/svg+xml;base64,') || !width || !height) return src;
	try {
		const b64 = src.slice('data:image/svg+xml;base64,'.length);
		let svg = atob(b64);
		svg = svg.replace(/<svg([^>]*)>/i, (_match, attrs: string) => {
			const cleaned = attrs
				.replace(/\s+width="[^"]*"/g, '')
				.replace(/\s+height="[^"]*"/g, '');
			return `<svg${cleaned} width="${width}" height="${height}">`;
		});
		return 'data:image/svg+xml;base64,' + btoa(svg);
	} catch {
		return src;
	}
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SlideOverlayProps {
	elements: SlideThemeElement[];
	slideNum: number;
	total: number;
	title: string;
	/** User-defined theme variables from frontmatter (theme-var-* fields) */
	themeVars?: Record<string, string>;
}

export function SlideOverlay({ elements, slideNum, total, title, themeVars }: SlideOverlayProps) {
	return (
		<>
			{elements.map((el, i) => {
				const posStyle = computePositionStyle(el);

				if (el.type === 'rect') {
					return <div key={i} style={{ background: el.fill, ...posStyle }} />;
				}

				if (el.type === 'text') {
					const text = interpolate(
						el.content,
						{ slideNum, slideTotal: total, title },
						themeVars,
					);
					return (
						<div
							key={i}
							style={{
								color: el.color,
								fontSize: el.fontSize,
								fontWeight: el.bold ? 'bold' : undefined,
								textAlign: el.align,
								whiteSpace: 'pre',
								lineHeight: 1.2,
								...posStyle,
							}}
						>
							{text}
						</div>
					);
				}

				// el.type === 'image' — only remaining union member
				return (
					<img
						key={i}
						src={patchSvgDimensions(el.src, el.width, el.height)}
						alt=""
						style={{
							opacity: el.opacity,
							objectFit: 'contain',
							objectPosition: 'left center',
							...posStyle,
						}}
					/>
				);
			})}
		</>
	);
}
