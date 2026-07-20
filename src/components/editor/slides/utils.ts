import type { SlideDirectives, SlideThemeDef } from "@/lib/slide";

// Slide parsing

/**
 * Split markdown content into individual slides on `---` separator lines.
 * Lines inside fenced code blocks (``` or ~~~) are never treated as separators.
 */
function splitSlides(content: string): string[] {
  const slides: string[] = [];
  let current: string[] = [];
  let fence: string | undefined;
  for (const line of content.split("\n")) {
    const trimmed = line.trimStart();
    if (fence === undefined) {
      const match = /^(?<fence>`{3,}|~{3,})/u.exec(trimmed);
      if (match) {
        // Opening a fenced code block; capture the fence character string
        fence = match[1] ?? "```";
        current.push(line);
        continue;
      }
      // Only treat bare `---` as a slide separator when outside a code fence
      if (line.trim() === "---") {
        slides.push(current.join("\n").trim());
        current = [];
        continue;
      }
    } else {
      // Inside a fence; check if this line closes it
      const closeRe = new RegExp(`^${fence[0] ?? "`"}{${String(fence.length)},}\\s*$`, "u");
      if (closeRe.test(trimmed)) {
        fence = undefined;
      }
    }
    current.push(line);
  }
  slides.push(current.join("\n").trim());
  return slides.filter((slide) => slide.length > 0);
}

// Slide canvas size -- defined in constants.ts

// Canvas style builder

function buildCanvasStyle(
  resolvedTheme: Omit<SlideThemeDef, "layouts"> | undefined,
  directives: SlideDirectives,
): React.CSSProperties {
  const style: React.CSSProperties = {};

  // 1. Theme-level background defaults
  // Use individual properties instead of the `background` shorthand to avoid
  // React warnings about mixing shorthand and longhand in style re-renders.
  if (resolvedTheme?.bg !== undefined && resolvedTheme.bg !== "") {
    style.backgroundColor = resolvedTheme.bg;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
    style.backgroundRepeat = "no-repeat";
  }
  if (resolvedTheme?.fg !== undefined && resolvedTheme.fg !== "") {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    (style as Record<string, unknown>)["--slide-fg"] = resolvedTheme.fg;
  }
  if (resolvedTheme?.fontFamily !== undefined && resolvedTheme.fontFamily !== "") {
    style.fontFamily = resolvedTheme.fontFamily;
  }

  // 2. Per-slide individual background-* directives override specific properties
  if (directives.backgroundColor !== undefined) {
    style.backgroundColor = directives.backgroundColor as React.CSSProperties["backgroundColor"];
  }
  if (directives.backgroundImage !== undefined) {
    style.backgroundImage = directives.backgroundImage as React.CSSProperties["backgroundImage"];
  }
  if (directives.backgroundPosition !== undefined) {
    style.backgroundPosition =
      directives.backgroundPosition as React.CSSProperties["backgroundPosition"];
  }
  if (directives.backgroundRepeat !== undefined) {
    style.backgroundRepeat = directives.backgroundRepeat as React.CSSProperties["backgroundRepeat"];
  }
  if (directives.backgroundSize !== undefined) {
    style.backgroundSize = directives.backgroundSize as React.CSSProperties["backgroundSize"];
  }

  // 3. Per-slide `background` shorthand overrides ALL background properties
  if (directives.background !== undefined && directives.background !== "") {
    style.background = directives.background as React.CSSProperties["background"];
  }

  // 4. Per-slide background filter
  if (directives.backgroundFilter !== undefined) {
    style.filter = directives.backgroundFilter as React.CSSProperties["filter"];
  }

  return style;
}

export { splitSlides, buildCanvasStyle };
