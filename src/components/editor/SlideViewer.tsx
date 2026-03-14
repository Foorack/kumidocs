import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	BookOpen,
	ChevronLeft,
	ChevronRight,
	GalleryVertical,
	ImageDown,
	Maximize,
	Minimize,
	Spotlight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { SlideMarkdownViewer } from './SlideMarkdownViewer';
import { SlideOverlay } from './SlideOverlay';
import { parseSlideDirectives, resolveCustomTheme, isBgDark } from '@/lib/slide';
import type { ParsedSlide, SlideThemeMap } from '@/lib/slide';
import { cn } from '@/lib/utils';
import { useTheme } from '@/store/theme';

// ── Slide parsing ─────────────────────────────────────────────────────────────

// Built-in themes that are inherently dark
const DARK_BUILT_IN_THEMES = new Set(['dark', 'corporate']);

/**
 * Split markdown content into individual slides on `---` separator lines.
 * Lines inside fenced code blocks (``` or ~~~) are never treated as separators.
 */
function splitSlides(content: string): string[] {
	const slides: string[] = [];
	let current: string[] = [];
	let fence: string | null = null;
	for (const line of content.split('\n')) {
		const trimmed = line.trimStart();
		if (fence === null) {
			const m = /^(`{3,}|~{3,})/.exec(trimmed);
			if (m) {
				// Opening a fenced code block — capture the fence character string
				fence = m[1] ?? '```';
				current.push(line);
				continue;
			}
			// Only treat bare `---` as a slide separator when outside a code fence
			if (line.trim() === '---') {
				slides.push(current.join('\n').trim());
				current = [];
				continue;
			}
		} else {
			// Inside a fence — check if this line closes it
			const closeRe = new RegExp(`^${fence[0] ?? '`'}{${String(fence.length)},}\\s*$`);
			if (closeRe.test(trimmed)) fence = null;
		}
		current.push(line);
	}
	slides.push(current.join('\n').trim());
	return slides.filter((s) => s.length > 0);
}

// ── Slide canvas size ─────────────────────────────────────────────────────────
export const SLIDE_W = 960;
export const SLIDE_H = 540;

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * Renders a single 960×540 slide canvas, scaled to `scale` and optionally
 * showing a slide number badge.  Theme and per-slide directives are both applied.
 */
export function ScaledSlide({
	slide,
	scale,
	theme,
	paginate,
	slideNum,
	total,
	slideThemes,
	origin = 'center center',
	shadow = false,
	rounded = false,
	absolute = false,
}: {
	slide: ParsedSlide;
	scale: number;
	theme: string;
	paginate: boolean;
	slideNum: number;
	total: number;
	slideThemes?: SlideThemeMap;
	origin?: string;
	shadow?: boolean;
	rounded?: boolean;
	/** Position absolute top-0 left-0 — used inside the scroll-mode tile wrapper */
	absolute?: boolean;
}) {
	const { directives } = slide;
	const { theme: siteTheme } = useTheme();

	// Resolve custom theme from the map (null = use built-in CSS class instead)
	const layoutClass = directives.classes[0] ?? '';
	const customTheme = slideThemes ? resolveCustomTheme(slideThemes, theme, layoutClass) : null;

	// Determine whether the slide is dark to stamp .dark or .light on the canvas.
	// This isolates all CSS theme tokens (--background, --sidebar, --muted, etc.) and
	// dark: Tailwind utilities from the site's own light/dark mode.
	const isDark = customTheme
		? isBgDark(customTheme.bg ?? '')
		: DARK_BUILT_IN_THEMES.has(theme) || (theme === 'default' && siteTheme === 'dark');

	// Extract first heading for template variable substitution
	const slideTitle = useMemo(() => {
		const m = /^#+\s+(.+)$/m.exec(slide.content);
		return m?.[1]?.trim() ?? '';
	}, [slide.content]);

	// Build canvas inline style: custom theme bg/fg first, then per-slide directive overrides
	const canvasStyle: React.CSSProperties = {};
	if (customTheme?.bg) {
		canvasStyle.background = customTheme.bg;
		canvasStyle.backgroundSize = 'cover';
		canvasStyle.backgroundPosition = 'center';
		canvasStyle.backgroundRepeat = 'no-repeat';
	}
	if (customTheme?.fg) {
		(canvasStyle as Record<string, unknown>)['--slide-fg'] = customTheme.fg;
	}
	// Per-slide bg overrides custom theme bg
	if (directives.bg) {
		canvasStyle.background = directives.bg;
		canvasStyle.backgroundSize = 'cover';
		canvasStyle.backgroundPosition = 'center';
		canvasStyle.backgroundRepeat = 'no-repeat';
	}

	return (
		<div
			style={{
				width: SLIDE_W,
				height: SLIDE_H,
				transform: `scale(${String(scale)})`,
				transformOrigin: origin,
				flexShrink: 0,
				...canvasStyle,
			}}
			className={cn(
				'slide-canvas overflow-hidden',
				// Always stamp .dark or .light so canvas tokens are independent of site mode
				isDark ? 'dark' : 'light',
				// Only apply CSS theme class when not using a custom theme definition
				customTheme ? undefined : `slide-theme-${theme}`,
				directives.classes.includes('invert') && 'slide-layout-invert',
				shadow && 'shadow-xl',
				rounded && 'rounded-sm',
				absolute && 'absolute top-0 left-0',
			)}
		>
			<SlideMarkdownViewer slide={slide} contentPadding={customTheme?.contentPadding} />
			{customTheme?.elements && customTheme.elements.length > 0 && (
				<SlideOverlay
					elements={customTheme.elements}
					slideNum={slideNum}
					total={total}
					title={slideTitle}
				/>
			)}
			{paginate && (
				<div className="slide-number">
					{slideNum} / {total}
				</div>
			)}
		</div>
	);
}

export interface SlideViewerProps {
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
	/** Custom theme definitions loaded from .kumidocs.json via /api/me. */
	slideThemes?: SlideThemeMap;
}

export function SlideViewer({
	value,
	filename = 'slides',
	standalone = false,
	theme = 'default',
	paginate = false,
	slideThemes,
}: SlideViewerProps) {
	// Parse slides once per value change
	const parsedSlides = useMemo<ParsedSlide[]>(
		() => splitSlides(value).map(parseSlideDirectives),
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

	const stageRef = useRef<HTMLDivElement>(null);
	const fullscreenRef = useRef<HTMLDivElement>(null);
	const spotlightRef = useRef<HTMLDivElement>(null);
	const slideElemsRef = useRef<(HTMLDivElement | null)[]>([]);
	const offscreenRef = useRef<HTMLDivElement>(null);

	// ── Keyboard navigation ──────────────────────────────────────────────────
	const prev = useCallback(() => {
		setIndex((i) => Math.max(0, i - 1));
	}, []);
	const next = useCallback(() => {
		setIndex((i) => Math.min(total - 1, i + 1));
	}, [total]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
			if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
				e.preventDefault();
				next();
			}
		};
		window.addEventListener('keydown', handler);
		return () => {
			window.removeEventListener('keydown', handler);
		};
	}, [prev, next]);

	// ── Scroll-mode slide navigation ─────────────────────────────────────────
	useEffect(() => {
		if (!scrollMode) return;
		slideElemsRef.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [index, scrollMode]);

	// ── Scale slide canvas to fit the stage ──────────────────────────────────
	useEffect(() => {
		const el = stageRef.current;
		if (!el) return;
		const obs = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const { width, height } = entry.contentRect;
			const s = Math.min((width - 192) / SLIDE_W, (height - 96) / SLIDE_H);
			setScale(Math.max(0.1, s));
		});
		obs.observe(el);
		return () => {
			obs.disconnect();
		};
	}, []);

	// ── Fullscreen ───────────────────────────────────────────────────────────
	useEffect(() => {
		const handler = () => {
			const active = !!document.fullscreenElement;
			setIsFullscreen(active);
			if (!active) setIsSpotlight(false);
		};
		document.addEventListener('fullscreenchange', handler);
		return () => {
			document.removeEventListener('fullscreenchange', handler);
		};
	}, []);

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => undefined);
		} else {
			fullscreenRef.current?.requestFullscreen().catch(() => undefined);
		}
	}, []);

	// ── Spotlight (bare fullscreen, slide only) ───────────────────────────────
	useEffect(() => {
		if (!isSpotlight) return;
		const el = spotlightRef.current;
		if (!el) return;
		el.requestFullscreen().catch(() => undefined);
		const obs = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const { width, height } = entry.contentRect;
			setSpotlightScale(Math.max(0.1, Math.min(width / SLIDE_W, height / SLIDE_H)));
		});
		obs.observe(el);
		return () => {
			obs.disconnect();
		};
	}, [isSpotlight]);

	const enterSpotlight = useCallback(() => {
		setIsSpotlight(true);
	}, []);

	// ── PDF export ───────────────────────────────────────────────────────────
	const exportPdf = useCallback(async () => {
		if (isExporting) return;
		setIsExporting(true);
		try {
			const container = offscreenRef.current;
			if (!container) return;
			const { default: html2canvas } = await import('html2canvas-pro');
			const { jsPDF } = await import('jspdf');
			const pdf = new jsPDF({
				orientation: 'landscape',
				unit: 'px',
				format: [SLIDE_W, SLIDE_H],
			});
			const slideEls = Array.from(container.children) as HTMLElement[];
			for (let i = 0; i < slideEls.length; i++) {
				const el = slideEls[i];
				if (!el) continue;
				const canvas = await html2canvas(el, {
					width: SLIDE_W,
					height: SLIDE_H,
					scale: 2,
					useCORS: true,
					logging: false,
				});
				if (i > 0) pdf.addPage();
				pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, SLIDE_W, SLIDE_H);
			}
			pdf.save(`${filename}.pdf`);
		} finally {
			setIsExporting(false);
		}
	}, [isExporting, filename]);

	const currentSlide = parsedSlides[index] ?? { content: '', directives: { classes: [] } };

	return (
		<>
			{/* ── Off-screen render container for PDF export ── */}
			<div
				ref={offscreenRef}
				aria-hidden="true"
				style={{
					position: 'fixed',
					top: 0,
					left: 0,
					zIndex: -9999,
					pointerEvents: 'none',
					opacity: 0,
				}}
			>
				{parsedSlides.map((slide, i) => (
					// Outer wrapper provides the pixel dimensions html2canvas measures
					<div
						key={i}
						style={{
							width: SLIDE_W,
							height: SLIDE_H,
							overflow: 'hidden',
							flexShrink: 0,
						}}
					>
						<ScaledSlide
							slide={slide}
							scale={1}
							theme={theme}
							paginate={paginate}
							slideNum={i + 1}
							total={total}
							slideThemes={slideThemes}
							origin="top left"
						/>
					</div>
				))}
			</div>

			<div
				ref={fullscreenRef}
				className={cn(
					'flex flex-col bg-muted/30 dark:bg-muted/10',
					standalone ? 'h-screen w-screen' : 'h-full',
				)}
			>
				{/* ── Spotlight overlay — bare fullscreen, slide only ── */}
				{isSpotlight && (
					<div
						ref={spotlightRef}
						className="fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-none"
						onClick={next}
					>
						<ScaledSlide
							slide={currentSlide}
							scale={spotlightScale}
							theme={theme}
							paginate={paginate}
							slideNum={index + 1}
							total={total}
							slideThemes={slideThemes}
						/>
					</div>
				)}

				{/* ── Slide stage ── */}
				{scrollMode ? (
					<div
						ref={stageRef}
						className="flex-1 overflow-y-auto flex flex-col items-center py-6 gap-4"
					>
						{parsedSlides.map((slide, i) => (
							<div
								key={i}
								ref={(el) => {
									slideElemsRef.current[i] = el;
								}}
								style={{
									position: 'relative',
									width: SLIDE_W * scale,
									height: SLIDE_H * scale,
									flexShrink: 0,
								}}
								className="shadow-xl rounded-sm overflow-hidden"
							>
								<ScaledSlide
									slide={slide}
									scale={scale}
									theme={theme}
									paginate={paginate}
									slideNum={i + 1}
									total={total}
									slideThemes={slideThemes}
									origin="top left"
									absolute
								/>
							</div>
						))}
					</div>
				) : (
					<div
						ref={stageRef}
						className="flex-1 flex items-center justify-center overflow-hidden"
					>
						<ScaledSlide
							slide={currentSlide}
							scale={scale}
							theme={theme}
							paginate={paginate}
							slideNum={index + 1}
							total={total}
							slideThemes={slideThemes}
							shadow
							rounded
						/>
					</div>
				)}

				{/* ── Progress bar (paginate mode only) ── */}
				{!scrollMode && (
					<div className="shrink-0 h-0.5 bg-muted">
						<div
							className="h-full bg-primary transition-[width] duration-300 ease-out"
							style={{
								width: total > 0 ? `${String(((index + 1) / total) * 100)}%` : '0%',
							}}
						/>
					</div>
				)}

				{/* ── Controls bar ── */}
				<div className="shrink-0 flex items-center justify-center gap-3 px-4 py-2 border-t border-border bg-background">
					{scrollMode ? (
						<span className="text-xs text-muted-foreground tabular-nums select-none">
							{total} {total === 1 ? 'slide' : 'slides'}
						</span>
					) : (
						<>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={prev}
								disabled={index === 0}
								title="Previous slide (←)"
							>
								<ChevronLeft className="w-4 h-4" />
							</Button>

							<span className="text-xs text-muted-foreground tabular-nums select-none min-w-[4rem] text-center">
								{index + 1} / {total}
							</span>

							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={next}
								disabled={index === total - 1}
								title="Next slide (→)"
							>
								<ChevronRight className="w-4 h-4" />
							</Button>
						</>
					)}

					{!standalone && (
						<>
							<div className="w-px h-4 bg-border mx-1" />

							<Button
								variant={scrollMode ? 'secondary' : 'ghost'}
								size="icon"
								className="h-7 w-7"
								onClick={() => {
									setScrollMode(true);
								}}
								title="Scroll mode"
							>
								<GalleryVertical className="w-4 h-4" />
							</Button>
							<Button
								variant={scrollMode ? 'ghost' : 'secondary'}
								size="icon"
								className="h-7 w-7"
								onClick={() => {
									setScrollMode(false);
								}}
								title="Paginate mode"
							>
								<BookOpen className="w-4 h-4" />
							</Button>
						</>
					)}

					<div className="w-px h-4 bg-border mx-1" />

					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={toggleFullscreen}
						title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
					>
						{isFullscreen ? (
							<Minimize className="w-4 h-4" />
						) : (
							<Maximize className="w-4 h-4" />
						)}
					</Button>

					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={enterSpotlight}
						title="Spotlight — slide only fullscreen"
					>
						<Spotlight className="w-4 h-4" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => {
							void exportPdf();
						}}
						disabled={isExporting}
						title="Export as PDF"
					>
						<ImageDown className="w-4 h-4" />
					</Button>
				</div>
			</div>
		</>
	);
}
