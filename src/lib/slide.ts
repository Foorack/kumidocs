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
