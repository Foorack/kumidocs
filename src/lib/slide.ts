/** Per-slide directives parsed from <!-- key: value --> HTML comments (Marp-compatible). */
export interface SlideDirectives {
	/**
	 * Layout / style classes applied to the slide canvas.
	 * Supported values: 'title' | 'section' | 'split' | 'invert' | 'blank' | 'center'
	 */
	classes: string[];
	/** CSS background value: hex color, named color, hsl(), rgb(), linear-gradient(), url() */
	bg?: string;
	/** CSS color override for all text on this slide */
	color?: string;
}

export interface ParsedSlide {
	/** Markdown content with all directives stripped */
	content: string;
	directives: SlideDirectives;
}

/**
 * Parse Marp-compatible <!-- key: value --> directives from a single slide's markdown.
 * Recognized keys: class / _class (layout), bg (background), color (text color).
 * Returns the cleaned content (directives removed) and the extracted directives.
 */
export function parseSlideDirectives(raw: string): ParsedSlide {
	const directives: SlideDirectives = { classes: [] };
	const content = raw.replace(
		/<!--\s*([\w-]+)\s*:\s*([\s\S]*?)\s*-->/gi,
		(_: string, key: string, value: string) => {
			const k = key.trim().toLowerCase();
			const v = value.trim();
			switch (k) {
				case 'class':
				case '_class':
					directives.classes.push(...v.split(/\s+/).filter(Boolean));
					break;
				case 'bg':
					directives.bg = v;
					break;
				case 'color':
					directives.color = v;
					break;
			}
			return '';
		},
	);
	return { content: content.trim(), directives };
}

// ── Custom theme system ───────────────────────────────────────────────────────

export type SlideThemeElement =
	| {
			type: 'rect';
			fill: string;
			left?: number;
			right?: number;
			width?: number;
			top?: number;
			bottom?: number;
			height?: number;
	  }
	| {
			type: 'text';
			content: string;
			color?: string;
			fontSize?: number;
			bold?: boolean;
			align?: 'left' | 'center' | 'right';
			left?: number;
			right?: number;
			centerX?: boolean;
			top?: number;
			bottom?: number;
			centerY?: boolean;
	  }
	| {
			type: 'image';
			src: string;
			opacity?: number;
			left?: number;
			right?: number;
			width?: number;
			centerX?: boolean;
			top?: number;
			bottom?: number;
			height?: number;
			centerY?: boolean;
	  };

export interface SlideThemeDef {
	bg?: string;
	fg?: string;
	contentPadding?: { top?: number; right?: number; bottom?: number; left?: number };
	elements?: SlideThemeElement[];
	layouts?: Record<string, Omit<SlideThemeDef, 'layouts'>>;
}

export type SlideThemeMap = Record<string, SlideThemeDef>;

/**
 * Returns true if a CSS color string represents a dark background.
 * Handles hex (#rrggbb / #rgb) and oklch(L ...) formats.
 */
export function isBgDark(color: string): boolean {
	const hex = /^#([0-9a-f]{3,6})$/i.exec(color.trim())?.[1];
	if (hex) {
		const full =
			hex.length === 3
				? hex
						.split('')
						.map((c) => c + c)
						.join('')
				: hex;
		const r = parseInt(full.slice(0, 2), 16);
		const g = parseInt(full.slice(2, 4), 16);
		const b = parseInt(full.slice(4, 6), 16);
		return 0.299 * r + 0.587 * g + 0.114 * b < 128;
	}
	const l = /oklch\(\s*([\d.]+)/.exec(color);
	if (l) return parseFloat(l[1] ?? '1') < 0.4;
	return false;
}

/** Built-in slide themes expressed as code. 'default' is intentionally absent — it inherits app tokens via .slide-canvas CSS. */
export const BUILTIN_SLIDE_THEMES: SlideThemeMap = {
	dark: {
		bg: 'oklch(0.13 0 0)',
		fg: 'oklch(0.93 0 0)',
	},
	corporate: {
		bg: '#ffffff',
		fg: '#1a1a1a',
		contentPadding: { bottom: 36 },
		elements: [{ type: 'rect', fill: '#005251', left: 0, right: 0, bottom: 0, height: 36 }],
		layouts: {
			title: {
				bg: '#005251',
				fg: '#ffffff',
				contentPadding: { top: 80, left: 60, right: 60, bottom: 60 },
				elements: [],
			},
		},
	},
	minimal: {
		bg: 'oklch(0.96 0.005 240)',
		fg: 'oklch(0.18 0.01 240)',
	},
	gradient: {
		bg: 'linear-gradient(72.44deg, rgb(156, 246, 250) 0%, rgb(227, 237, 185) 100%)',
		fg: '#1a2020',
	},
};

/** Resolve a theme for a slide: user-defined custom themes take priority over built-ins. */
export function resolveTheme(
	slideThemes: SlideThemeMap | undefined,
	themeName: string,
	layoutClass: string,
): Omit<SlideThemeDef, 'layouts'> | null {
	if (slideThemes) {
		const custom = resolveCustomTheme(slideThemes, themeName, layoutClass);
		if (custom) return custom;
	}
	return resolveCustomTheme(BUILTIN_SLIDE_THEMES, themeName, layoutClass);
}

/** Resolve effective theme def for a slide, checking layout override first. */
export function resolveCustomTheme(
	map: SlideThemeMap,
	themeName: string,
	layoutClass: string,
): Omit<SlideThemeDef, 'layouts'> | null {
	const base = map[themeName];
	if (!base) return null;
	const layoutKey = layoutClass || 'default';
	const override = base.layouts?.[layoutKey];
	if (override) return override;
	// Strip `layouts` from the base definition before returning
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { layouts: _layoutsOmit, ...baseDef } = base;
	return baseDef;
}

/**
 * Split slide content into two columns for the 'split' layout.
 * Splits at the second top-level '## ' heading.
 * Falls back to a midpoint split if no second heading exists.
 */
export function splitAtSecondH2(content: string): [string, string] {
	const lines = content.split('\n');
	let h2Count = 0;
	for (let i = 0; i < lines.length; i++) {
		if ((lines[i] ?? '').startsWith('## ')) {
			h2Count++;
			if (h2Count === 2) {
				return [lines.slice(0, i).join('\n').trim(), lines.slice(i).join('\n').trim()];
			}
		}
	}
	// Fallback: midpoint split
	const mid = Math.ceil(lines.length / 2);
	return [lines.slice(0, mid).join('\n').trim(), lines.slice(mid).join('\n').trim()];
}
