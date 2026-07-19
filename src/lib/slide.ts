/** Prefixes allowed in slide background-image `url(...)` references. */
const ALLOWED_BG_URL_PREFIXES = ["/images/", "data:image/"];

/**
 * Validate that all `url(...)` references in a CSS value point to allowed origins.
 * Pure colours and gradients without URLs always pass.
 */
const cssUrlsAreSafe = (cssValue: string): boolean => {
  const URL_RE = /url\(\s*['"]?\s*(?<url>[^)'"]+\s*)['"]?\s*\)/giu;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(cssValue)) !== null) {
    const url = (match[1] ?? "").trim();
    const allowed = ALLOWED_BG_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
    if (!allowed) {
      return false;
    }
  }
  return true;
};

/** Per-slide directives parsed from <!-- key: value --> HTML comments (Marp-compatible). */
interface SlideDirectives {
  /**
   * Layout / style classes applied to the slide canvas.
   * Supported values: 'title' | 'section' | 'split' | 'invert' | 'blank' | 'center'
   */
  classes: string[];
  /**
   * CSS background shorthand value, set by `bg` or `background` directive.
   * Overrides all individual background-* properties when set.
   * Accepts colours, gradients, and image URLs.
   */
  background?: string;
  /** Individual background properties (set by Marp-compatible directives) */
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundSize?: string;
  /** CSS filter applied to the background layer (KumiDocs extension, not in Marp) */
  backgroundFilter?: string;
  /** Per-slide header text that overrides the deck-level frontmatter header for this slide */
  header?: string;
  /** Per-slide footer text that overrides the deck-level frontmatter footer for this slide */
  footer?: string;
  /** CSS color override for all text on this slide */
  color?: string;
}

interface ParsedSlide {
  /** Markdown content with all directives stripped */
  content: string;
  directives: SlideDirectives;
}

/**
 * Parse <!-- key: value --> directives from a single slide's markdown.
 *
 * Supported keys (all may be prefixed with `_` for Marp spot-directive compatibility):
 *   class: layout class (title, section, split, center, blank, invert)
 *   bg / background: CSS background shorthand (colours, gradients, image URLs)
 *   backgroundColor: individual background-color
 *   backgroundImage: individual background-image
 *   backgroundPosition: individual background-position
 *   backgroundRepeat: individual background-repeat
 *   backgroundSize: individual background-size
 *   backgroundFilter: CSS filter for the background (KumiDocs extension)
 *   header: per-slide header text (overrides deck-level frontmatter)
 *   footer: per-slide footer text (overrides deck-level frontmatter)
 *   color: text colour override
 *
 * URL values in `background*` directives are validated against the allowed prefix
 * allowlist. Disallowed URLs are silently discarded.
 */
const parseSlideDirectives = (raw: string): ParsedSlide => {
  const directives: SlideDirectives = { classes: [] };
  const content = raw.replaceAll(
    /<!--\s*(?<key>[\w-]+)\s*:\s*(?<value>[\s\S]*?)\s*-->/giu,
    (_match: string, key: string, value: string) => {
      // Strip leading _ (Marp spot-directive prefix); all our directives are already per-slide
      const directiveKey = key.trim().toLowerCase().replace(/^_/u, "");
      const directiveValue = value.trim();

      switch (directiveKey) {
        case "class": {
          directives.classes.push(...directiveValue.split(/\s+/u).filter(Boolean));
          break;
        }
        case "bg":
        case "background": {
          if (cssUrlsAreSafe(directiveValue)) {
            directives.background = directiveValue;
          }
          break;
        }
        case "backgroundcolor": {
          if (cssUrlsAreSafe(directiveValue)) {
            directives.backgroundColor = directiveValue;
          }
          break;
        }
        case "backgroundimage": {
          if (cssUrlsAreSafe(directiveValue)) {
            directives.backgroundImage = directiveValue;
          }
          break;
        }
        case "backgroundposition": {
          directives.backgroundPosition = directiveValue;
          break;
        }
        case "backgroundrepeat": {
          directives.backgroundRepeat = directiveValue;
          break;
        }
        case "backgroundsize": {
          directives.backgroundSize = directiveValue;
          break;
        }
        case "backgroundfilter": {
          directives.backgroundFilter = directiveValue;
          break;
        }
        case "header": {
          directives.header = directiveValue;
          break;
        }
        case "footer": {
          directives.footer = directiveValue;
          break;
        }
        case "color": {
          directives.color = directiveValue;
          break;
        }
        default: {
          break;
        }
      }
      return "";
    },
  );
  return { content: content.trim(), directives };
};

// Custom theme system

type SlideThemeElement =
  | {
      type: "rect";
      fill: string;
      left?: number;
      right?: number;
      width?: number;
      top?: number;
      bottom?: number;
      height?: number;
    }
  | {
      type: "text";
      content: string;
      color?: string;
      fontSize?: number;
      bold?: boolean;
      align?: "left" | "center" | "right";
      left?: number;
      right?: number;
      centerX?: boolean;
      top?: number;
      bottom?: number;
      centerY?: boolean;
    }
  | {
      type: "image";
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

interface SlideThemeDef {
  bg?: string;
  fg?: string;
  /** CSS font-family value applied to the entire slide canvas. Inherits to all content. */
  fontFamily?: string;
  contentPadding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Horizontal text alignment for center-type layouts (title, section, center). Default: "center". */
  contentAlign?: "left" | "center" | "right";
  /** Vertical content alignment for center-type layouts (title, section, center). Default: "center". */
  contentVAlign?: "top" | "center" | "bottom";
  /** Per-heading style overrides for this theme/layout. Keys are heading levels 1-6. */
  headers?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, { color?: string; fontSize?: number }>>;
  elements?: SlideThemeElement[];
  layouts?: Record<string, Omit<SlideThemeDef, "layouts">>;
}

type SlideThemeMap = Record<string, SlideThemeDef>;

/**
 * Returns true if a CSS color string represents a dark background.
 * Handles hex (#rrggbb / #rgb) and oklch(L ...) formats.
 */
const isBgDark = (color: string): boolean => {
  const SHORT_HEX_LENGTH = 3;
  const HEX_G_END = 4;
  const HEX_B_END = 6;
  const RED_LUMINANCE = 0.299;
  const GREEN_LUMINANCE = 0.587;
  const BLUE_LUMINANCE = 0.114;
  const DARK_THRESHOLD = 128;
  const OKLCH_DARK_LIGHTNESS = 0.4;

  const hexMatch = /^#(?<hex>[0-9a-f]{3,6})$/iu.exec(color.trim());
  if (hexMatch) {
    const hexValue = hexMatch.at(1) ?? "";
    let full = hexValue;
    if (hexValue.length === SHORT_HEX_LENGTH) {
      // oxlint-disable-next-line typescript/no-misused-spread
      full = [...hexValue].map((hexChar) => hexChar + hexChar).join("");
    }
    const redChannel = Number.parseInt(full.slice(0, 2), 16);
    const greenChannel = Number.parseInt(full.slice(2, HEX_G_END), 16);
    const blueChannel = Number.parseInt(full.slice(HEX_G_END, HEX_B_END), 16);
    return (
      RED_LUMINANCE * redChannel + GREEN_LUMINANCE * greenChannel + BLUE_LUMINANCE * blueChannel <
      DARK_THRESHOLD
    );
  }
  const oklchMatch = /oklch\(\s*(?<lightness>[\d.]+)/u.exec(color);
  if (oklchMatch) {
    return Number(oklchMatch.at(1) ?? "1") < OKLCH_DARK_LIGHTNESS;
  }
  return false;
};

/** Built-in slide themes expressed as code. 'default' is intentionally absent; it inherits app tokens via .slide-canvas CSS. */
const BUILTIN_SLIDE_THEMES: SlideThemeMap = {
  corporate: {
    bg: "#ffffff",
    contentPadding: { bottom: 36 },
    elements: [{ bottom: 0, fill: "#005251", height: 36, left: 0, right: 0, type: "rect" }],
    fg: "#1a1a1a",
    fontFamily: "Georgia, 'Times New Roman', serif",
    layouts: {
      title: {
        bg: "#005251",
        contentPadding: { bottom: 60, left: 60, right: 60, top: 80 },
        elements: [],
        fg: "#ffffff",
      },
    },
  },
  dark: {
    bg: "oklch(0.13 0 0)",
    fg: "oklch(0.93 0 0)",
  },
  gradient: {
    bg: "linear-gradient(72.44deg, rgb(156, 246, 250) 0%, rgb(227, 237, 185) 100%)",
    fg: "#1a2020",
  },
  minimal: {
    bg: "oklch(0.96 0.005 240)",
    fg: "oklch(0.18 0.01 240)",
  },
};

/** Resolve effective theme def for a slide, checking layout override first. */
const resolveCustomTheme = (
  map: SlideThemeMap,
  themeName: string,
  layoutClass: string,
): Omit<SlideThemeDef, "layouts"> | undefined => {
  const base = map[themeName];
  if (!base) {
    return undefined;
  }
  const layoutKey = layoutClass || "default";
  const baseDef: Omit<SlideThemeDef, "layouts"> = {
    bg: base.bg,
    contentAlign: base.contentAlign,
    contentPadding: base.contentPadding,
    contentVAlign: base.contentVAlign,
    elements: base.elements,
    fg: base.fg,
    fontFamily: base.fontFamily,
    headers: base.headers,
  };
  if (base.layouts) {
    const override = base.layouts[layoutKey];
    if (override) {
      // Inherit fontFamily from base when the layout override does not set it
      return {
        bg: override.bg,
        contentAlign: override.contentAlign ?? baseDef.contentAlign,
        contentPadding: override.contentPadding,
        contentVAlign: override.contentVAlign ?? baseDef.contentVAlign,
        elements: override.elements,
        fg: override.fg,
        fontFamily: override.fontFamily ?? baseDef.fontFamily,
        headers: override.headers ?? baseDef.headers,
      };
    }
  }
  return baseDef;
};

/** Resolve a theme for a slide: user-defined custom themes take priority over built-ins. */
const resolveTheme = (
  slideThemes: SlideThemeMap | undefined,
  themeName: string,
  layoutClass: string,
): Omit<SlideThemeDef, "layouts"> | undefined => {
  if (slideThemes) {
    const custom = resolveCustomTheme(slideThemes, themeName, layoutClass);
    if (custom) {
      return custom;
    }
  }
  return resolveCustomTheme(BUILTIN_SLIDE_THEMES, themeName, layoutClass);
};

/**
 * Split slide content into two columns for the 'split' layout.
 * Splits at the second top-level '## ' heading.
 * Falls back to a midpoint split if no second heading exists.
 */
const splitAtSecondH2 = (content: string): [string, string] => {
  const H2_PREFIX = "## ";
  const lines = content.split("\n");
  let h2Count = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if ((lines.at(lineIndex) ?? "").startsWith(H2_PREFIX)) {
      h2Count += 1;
      if (h2Count === 2) {
        return [
          lines.slice(0, lineIndex).join("\n").trim(),
          lines.slice(lineIndex).join("\n").trim(),
        ];
      }
    }
  }
  // Fallback: midpoint split
  const mid = Math.ceil(lines.length / 2);
  return [lines.slice(0, mid).join("\n").trim(), lines.slice(mid).join("\n").trim()];
};

export type { SlideDirectives, ParsedSlide, SlideThemeElement, SlideThemeDef, SlideThemeMap };
export {
  ALLOWED_BG_URL_PREFIXES,
  cssUrlsAreSafe,
  parseSlideDirectives,
  isBgDark,
  BUILTIN_SLIDE_THEMES,
  resolveCustomTheme,
  resolveTheme,
  splitAtSecondH2,
};
