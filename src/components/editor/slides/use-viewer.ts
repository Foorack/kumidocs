import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ParsedSlide, SlideThemeMap } from "@/lib/slide";
import { SLIDE_H, SLIDE_W } from "./constants";
import addOverlayToPdf from "./pdf-overlay";
import { splitSlides } from "./utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSlideDirectives } from "@/lib/slide";
import useMountEffect from "@/hooks/use-mount-effect";

interface UseSlideViewerProps {
  value: string;
  filename?: string;
  standalone?: boolean;
  theme?: string;
  paginate?: boolean;
  slideThemes?: SlideThemeMap;
  themeVars?: Record<string, string>;
  /** When set, scrolls to the slide at this index in scroll mode. */
  scrollToIndex?: number;
}

interface UseSlideViewerReturn {
  currentSlide: ParsedSlide;
  enterSpotlight: () => void;
  exportPdf: () => void;
  fullscreenRef: RefObject<HTMLDivElement | null>;
  index: number;
  isExporting: boolean;
  isFullscreen: boolean;
  isSpotlight: boolean;
  next: () => void;
  offscreenRef: RefObject<HTMLDivElement | null>;
  parsedSlides: ParsedSlide[];
  pointerPos: { xPos: number; yPos: number };
  pointerVisible: boolean;
  prev: () => void;
  scale: number;
  scrollMode: boolean;
  setIndex: Dispatch<SetStateAction<number>>;
  setIsSpotlight: Dispatch<SetStateAction<boolean>>;
  setPointerPos: Dispatch<SetStateAction<{ xPos: number; yPos: number }>>;
  setPointerVisible: Dispatch<SetStateAction<boolean>>;
  setScrollMode: Dispatch<SetStateAction<boolean>>;
  setSpotlightMenu: Dispatch<SetStateAction<{ xPos: number; yPos: number } | undefined>>;
  slideElemsRef: RefObject<(HTMLDivElement | null)[]>;
  spotlightCallbackRef: (el: HTMLDivElement | null) => void;
  spotlightMenu: { xPos: number; yPos: number } | undefined;
  spotlightScale: number;
  stageRef: RefObject<HTMLDivElement | null>;
  toggleFullscreen: () => void;
  total: number;
}

// eslint-disable-next-line max-lines-per-function
function useSlideViewer({
  value,
  filename = "slides",
  standalone = false,
  theme: _theme = "default",
  paginate: _paginate = false,
  slideThemes: _slideThemes,
  themeVars: _themeVars,
  scrollToIndex,
}: UseSlideViewerProps): UseSlideViewerReturn {
  // Parse slides once per value change
  const parsedSlides = useMemo<ParsedSlide[]>(
    () => splitSlides(value).map((slide) => parseSlideDirectives(slide)),
    [value],
  );
  const total = parsedSlides.length;

  const [index, setIndex] = useState(0);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setIndex(0);
  }
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSpotlight, setIsSpotlight] = useState(false);
  const [spotlightScale, setSpotlightScale] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [scrollMode, setScrollMode] = useState(!standalone);
  const [pointerVisible, setPointerVisible] = useState(false);
  const [pointerPos, setPointerPos] = useState({ xPos: 0, yPos: 0 });
  const [spotlightMenu, setSpotlightMenu] = useState<{ xPos: number; yPos: number } | undefined>();

  const stageRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const slideElemsRef = useRef<(HTMLDivElement | null)[]>([]);
  const offscreenRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  const prev = useCallback(() => {
    setIndex((idx) => {
      const next = Math.max(0, idx - 1);
      slideElemsRef.current[next]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return next;
    });
  }, []);
  const next = useCallback(() => {
    setIndex((idx) => {
      const nextIdx = Math.min(total - 1, idx + 1);
      slideElemsRef.current[nextIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return nextIdx;
    });
  }, [total]);

  // Stable refs so mount-only keyboard listener always calls the latest prev/next
  const prevRef = useRef(prev);
  prevRef.current = prev;
  const nextRef = useRef(next);
  nextRef.current = next;

  useMountEffect(() => {
    const handler = (ev: KeyboardEvent): void => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const tag = (ev.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
      }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
        prevRef.current();
      }
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown" || ev.key === " ") {
        ev.preventDefault();
        nextRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return (): void => {
      window.removeEventListener("keydown", handler);
    };
  });

  // Scroll to the requested slide index when it changes
  useEffect(() => {
    if (scrollToIndex === undefined || !scrollMode) {
      return;
    }
    slideElemsRef.current[scrollToIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [scrollToIndex, scrollMode]);

  // Scale slide canvas to fit the stage
  useMountEffect(() => {
    const el = stageRef.current;
    if (!el) {
      return undefined;
    }
    const obs = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      const newScale = Math.min((width - 192) / SLIDE_W, (height - 96) / SLIDE_H);
      setScale(Math.max(0.1, newScale));
    });
    obs.observe(el);
    return (): void => {
      obs.disconnect();
    };
  });

  // Fullscreen
  useMountEffect(() => {
    const handler = (): void => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        setIsSpotlight(false);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return (): void => {
      document.removeEventListener("fullscreenchange", handler);
    };
  });

  const toggleFullscreen = useCallback(async () => {
    try {
      await (document.fullscreenElement
        ? document.exitFullscreen()
        : fullscreenRef.current?.requestFullscreen());
    } catch {
      // Fullscreen API may be restricted by the browser or page policy
    }
  }, []);

  // Spotlight (bare fullscreen, slide only)
  // Rendered only when isSpotlight=true, so useMountEffect runs requestFullscreen
  // and a ResizeObserver immediately on mount of the spotlight overlay div.
  const spotlightCleanupRef = useRef(undefined as (() => void) | undefined);
  const spotlightSetScale = useCallback(async (el: HTMLDivElement | null) => {
    if (!el) {
      return;
    }
    try {
      await el.requestFullscreen();
    } catch {
      // Fullscreen API may be restricted
    }
    const obs = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setSpotlightScale(Math.max(0.1, Math.min(width / SLIDE_W, height / SLIDE_H)));
    });
    obs.observe(el);
    // cleanup stored on ref so we can call it when the component unmounts
    spotlightCleanupRef.current = (): void => {
      obs.disconnect();
    };
  }, []);
  const spotlightCallbackRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        void spotlightSetScale(el);
      } else {
        spotlightCleanupRef.current?.();
        spotlightCleanupRef.current = undefined;
      }
    },
    [spotlightSetScale],
  );

  const enterSpotlight = useCallback(() => {
    setIsSpotlight(true);
  }, []);

  // PDF export
  const exportPdf = useCallback(async () => {
    if (isExporting) {
      return;
    }
    setIsExporting(true);
    try {
      const container = offscreenRef.current;
      if (!container) {
        return;
      }
      const { default: html2canvas } = await import("html2canvas-pro");
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        format: [SLIDE_W, SLIDE_H],
        orientation: "landscape",
        unit: "px",
      });
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const slideEls = ([...container.children] as HTMLElement[]).filter(Boolean);
      const canvases = await Promise.all(
        slideEls.map(async (el) =>
          html2canvas(el, {
            height: SLIDE_H,
            logging: false,
            scale: 2,
            useCORS: true,
            width: SLIDE_W,
          }),
        ),
      );
      for (const [idx, canvas] of canvases.entries()) {
        if (idx > 0) {
          pdf.addPage();
        }
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, SLIDE_W, SLIDE_H);
        const el = slideEls[idx];
        if (el !== undefined) {
          addOverlayToPdf(pdf, el);
        }
      }
      pdf.save(`${filename}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, filename]);

  const currentSlide = parsedSlides[index] ?? { content: "", directives: { classes: [] } };

  return {
    currentSlide,
    enterSpotlight,
    exportPdf,
    fullscreenRef,
    index,
    isExporting,
    isFullscreen,
    isSpotlight,
    next,
    offscreenRef,
    parsedSlides,
    pointerPos,
    pointerVisible,
    prev,
    scale,
    scrollMode,
    setIndex,
    setIsSpotlight,
    setPointerPos,
    setPointerVisible,
    setScrollMode,
    setSpotlightMenu,
    slideElemsRef,
    spotlightCallbackRef,
    spotlightMenu,
    spotlightScale,
    stageRef,
    toggleFullscreen,
    total,
  };
}

export { useSlideViewer };
export type { UseSlideViewerProps };
