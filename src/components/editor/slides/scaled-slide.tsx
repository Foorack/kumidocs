/* eslint-disable sort-imports */
import type { ParsedSlide, SlideThemeDef, SlideThemeMap } from "@/lib/slide";
import SlideOverlay, { interpolate } from "./overlay";
import { isBgDark, resolveTheme } from "@/lib/slide";
import cn from "@/lib/utils";
import { useTheme } from "@/store/theme";
import { SLIDE_H, SLIDE_W } from "./constants";
import { buildCanvasStyle } from "./utils";
import SlideMarkdownViewer from "./markdown-viewer";
/* eslint-enable sort-imports */

/** Small overlay for header/footer text, positioned at top or bottom of the slide canvas. */
function HeaderFooterOverlay({
  text,
  vars,
  themeVars,
  position,
}: {
  text: string | undefined;
  vars: { slideNum: number; slideTotal: number; title: string };
  themeVars?: Record<string, string>;
  position: "top" | "bottom";
}): JSX.Element | null {
  if (text === undefined || text === "") {
    return <></>;
  }
  const style: React.CSSProperties = {
    color: "var(--slide-fg, inherit)",
    fontSize: 14,
    left: 20,
    lineHeight: 1.2,
    opacity: 0.55,
    pointerEvents: "none",
    position: "absolute",
    right: 20,
    textAlign: "left",
    whiteSpace: "pre",
  };
  if (position === "top") {
    style.top = 10;
  } else {
    style.bottom = 10;
  }
  return <div style={style}>{interpolate(text, vars, themeVars)}</div>;
}

/** Resolve theme definition and compute whether the canvas background is dark. */
function resolveSlideTheme(
  slideThemes: SlideThemeMap | undefined,
  theme: string,
  layoutClass: string,
  siteTheme: string,
): { resolvedTheme: Omit<SlideThemeDef, "layouts"> | undefined; isDark: boolean } {
  const resolvedTheme = resolveTheme(slideThemes, theme, layoutClass);
  const isDark = resolvedTheme
    ? isBgDark(resolvedTheme.bg ?? "")
    : theme === "default" && siteTheme === "dark";
  return { isDark, resolvedTheme };
}

// eslint-disable-next-line complexity
function ScaledSlide({
  slide,
  scale,
  theme,
  paginate,
  header: deckHeader,
  footer: deckFooter,
  slideNum,
  total,
  slideThemes,
  themeVars,
  origin = "center center",
  shadow = false,
  absolute = false,
}: {
  slide: ParsedSlide;
  scale: number;
  theme: string;
  paginate: boolean;
  /** Deck-level header from frontmatter (may be overridden per-slide via <!-- header: --> directive) */
  header?: string;
  /** Deck-level footer from frontmatter (may be overridden per-slide via <!-- footer: --> directive) */
  footer?: string;
  slideNum: number;
  total: number;
  slideThemes?: SlideThemeMap;
  themeVars?: Record<string, string>;
  origin?: string;
  shadow?: boolean;
  /** Position absolute top-0 left-0, used inside the scroll-mode tile wrapper */
  absolute?: boolean;
}): JSX.Element {
  const { directives } = slide;
  const { theme: siteTheme } = useTheme();

  // Resolve theme and dark mode
  const { resolvedTheme, isDark } = resolveSlideTheme(
    slideThemes,
    theme,
    directives.classes[0] ?? "",
    siteTheme,
  );

  // Extract first heading for template variable substitution
  const slideTitle = /^#+\s+(?<title>.+)$/mu.exec(slide.content)?.[1]?.trim() ?? "";

  // Build canvas inline style: custom theme bg/fg first, then per-slide directive overrides
  const canvasStyle = buildCanvasStyle(resolvedTheme, directives);

  // Canvas class names
  const canvasClass = cn(
    "slide-canvas overflow-hidden",
    isDark ? "dark" : "light",
    directives.classes.includes("invert") && "slide-layout-invert",
    shadow && "shadow-xl",
    absolute && "absolute top-0 left-0",
  );

  return (
    <div
      style={{
        flexShrink: 0,
        height: SLIDE_H,
        transform: `scale(${String(scale)})`,
        transformOrigin: origin,
        width: SLIDE_W,
        ...canvasStyle,
      }}
      className={canvasClass}
    >
      <SlideMarkdownViewer
        slide={slide}
        contentPadding={resolvedTheme?.contentPadding}
        contentAlign={resolvedTheme?.contentAlign}
        contentVAlign={resolvedTheme?.contentVAlign}
        headers={resolvedTheme?.headers}
      />

      {/* Deck-level / directive header */}
      <HeaderFooterOverlay
        text={directives.header ?? deckHeader}
        vars={{ slideNum, slideTotal: total, title: slideTitle }}
        themeVars={themeVars}
        position="top"
      />

      {/* Theme overlay elements */}
      {resolvedTheme?.elements && resolvedTheme.elements.length > 0 && (
        <SlideOverlay
          elements={resolvedTheme.elements}
          slideNum={slideNum}
          total={total}
          title={slideTitle}
          themeVars={themeVars}
        />
      )}

      {/* Deck-level / directive footer */}
      <HeaderFooterOverlay
        text={directives.footer ?? deckFooter}
        vars={{ slideNum, slideTotal: total, title: slideTitle }}
        themeVars={themeVars}
        position="bottom"
      />

      {/* Slide number badge */}
      {paginate && (
        <div className="slide-number">
          {slideNum} / {total}
        </div>
      )}
    </div>
  );
}

export default ScaledSlide;
