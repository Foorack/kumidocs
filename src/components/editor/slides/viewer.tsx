import { SLIDE_H, SLIDE_W } from "./constants";
import ScaledSlide from "./scaled-slide";
import SlideControlsBar from "./controls-bar";
import SlideSpotlightOverlay from "./spotlight-overlay";
import type { SlideThemeMap } from "@/lib/slide";
import cn from "@/lib/utils";
import { useSlideViewer } from "./use-viewer";

interface SlideViewerProps {
  value: string;
  /** Filename stem used when saving the PDF (e.g. page title). Defaults to "slides". */
  filename?: string;
  /** When true, fills the full viewport (used by the standalone SlidesPage). */
  standalone?: boolean;
  /**
   * Deck-level theme applied to all slides.
   * Values: 'default' | 'dark' | 'corporate' | 'minimal' | 'gradient'
   * Or any key defined in .kumidocs.json slideThemes.
   */
  theme?: string;
  /** When true, each slide canvas shows a "N / total" badge in the bottom-right. */
  paginate?: boolean;
  /** Deck-level header text (may be overridden per-slide by <!-- header: --> directive) */
  header?: string;
  /** Deck-level footer text (may be overridden per-slide by <!-- footer: --> directive) */
  footer?: string;
  /** Custom theme definitions loaded from .kumidocs.json via /api/me. */
  slideThemes?: SlideThemeMap;
  /** User-defined variables from frontmatter (theme-var-* fields) substituted into theme element content */
  themeVars?: Record<string, string>;
  /** When set, scrolls to the slide at this index in scroll mode. */
  scrollToIndex?: number;
}

function SlideViewer({
  value,
  filename = "slides",
  standalone = false,
  theme = "default",
  paginate = false,
  header,
  footer,
  slideThemes,
  themeVars,
  scrollToIndex,
}: SlideViewerProps): JSX.Element {
  const {
    parsedSlides,
    total,
    index,
    setIndex,
    scale,
    isFullscreen,
    isSpotlight,
    spotlightScale,
    isExporting,
    scrollMode,
    setScrollMode,
    pointerVisible,
    setPointerVisible,
    pointerPos,
    setPointerPos,
    spotlightMenu,
    setSpotlightMenu,
    stageRef,
    fullscreenRef,
    slideElemsRef,
    offscreenRef,
    spotlightCallbackRef,
    prev,
    next,
    toggleFullscreen,
    enterSpotlight,
    exportPdf,
    currentSlide,
  } = useSlideViewer({
    filename,
    paginate,
    scrollToIndex,
    slideThemes,
    standalone,
    theme,
    themeVars,
    value,
  });

  return (
    <>
      {/* Off-screen render container for PDF export */}
      <div
        ref={offscreenRef}
        aria-hidden="true"
        style={{
          left: 0,
          pointerEvents: "none",
          position: "fixed",
          top: 0,
          zIndex: -9999,
        }}
      >
        {parsedSlides.map((slide, idx) => (
          // Outer wrapper provides the pixel dimensions html2canvas measures
          <div
            key={idx}
            style={{
              flexShrink: 0,
              height: SLIDE_H,
              overflow: "hidden",
              width: SLIDE_W,
            }}
          >
            <ScaledSlide
              slide={slide}
              scale={1}
              theme={theme}
              paginate={paginate}
              header={header}
              footer={footer}
              slideNum={idx + 1}
              total={total}
              slideThemes={slideThemes}
              themeVars={themeVars}
              origin="top left"
            />
          </div>
        ))}
      </div>

      <div
        ref={fullscreenRef}
        className={cn(
          "flex flex-col bg-muted/30 dark:bg-muted/10",
          standalone ? "h-screen w-screen" : "h-full",
        )}
      >
        {/* Spotlight overlay: bare fullscreen, slide only */}
        {isSpotlight && (
          <SlideSpotlightOverlay
            currentSlide={currentSlide}
            spotlightCallbackRef={spotlightCallbackRef}
            spotlightScale={spotlightScale}
            pointerVisible={pointerVisible}
            setPointerVisible={setPointerVisible}
            pointerPos={pointerPos}
            setPointerPos={setPointerPos}
            spotlightMenu={spotlightMenu}
            setSpotlightMenu={setSpotlightMenu}
            next={next}
            prev={prev}
            setIndex={setIndex}
            theme={theme}
            paginate={paginate}
            header={header}
            footer={footer}
            total={total}
            slideNum={index + 1}
            slideThemes={slideThemes}
            themeVars={themeVars}
          />
        )}

        {/* Slide stage */}
        {scrollMode ? (
          <div
            ref={stageRef}
            className="flex-1 overflow-y-auto flex flex-col items-center py-6 gap-4"
          >
            {parsedSlides.map((slide, idx) => (
              <div
                key={idx}
                ref={(el) => {
                  slideElemsRef.current[idx] = el;
                }}
                style={{
                  flexShrink: 0,
                  height: SLIDE_H * scale,
                  position: "relative",
                  width: SLIDE_W * scale,
                }}
                className="shadow-xl overflow-hidden"
              >
                <ScaledSlide
                  slide={slide}
                  scale={scale}
                  theme={theme}
                  paginate={paginate}
                  header={header}
                  footer={footer}
                  slideNum={idx + 1}
                  total={total}
                  slideThemes={slideThemes}
                  themeVars={themeVars}
                  origin="top left"
                  absolute
                />
              </div>
            ))}
          </div>
        ) : (
          <div ref={stageRef} className="flex-1 flex items-center justify-center overflow-hidden">
            <ScaledSlide
              slide={currentSlide}
              scale={scale}
              theme={theme}
              paginate={paginate}
              header={header}
              footer={footer}
              slideNum={index + 1}
              total={total}
              slideThemes={slideThemes}
              themeVars={themeVars}
              shadow
            />
          </div>
        )}

        <SlideControlsBar
          scrollMode={scrollMode}
          total={total}
          index={index}
          standalone={standalone}
          isFullscreen={isFullscreen}
          isExporting={isExporting}
          prev={prev}
          next={next}
          setScrollMode={setScrollMode}
          toggleFullscreen={toggleFullscreen}
          enterSpotlight={enterSpotlight}
          exportPdf={exportPdf}
        />
      </div>
    </>
  );
}

export { ScaledSlide, type SlideViewerProps, SlideViewer };
