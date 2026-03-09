import { useCallback, useEffect, useRef, useState } from 'react';
import {
	BookOpen,
	ChevronLeft,
	ChevronRight,
	GalleryVertical,
	Maximize,
	Minimize,
	Spotlight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { MarkdownViewer } from './MarkdownViewer';

// ── Slide parsing ─────────────────────────────────────────────────────────────

/** Split markdown content into individual slides on `---` separator lines. */
function splitSlides(content: string): string[] {
	const slides: string[] = [];
	let current: string[] = [];
	for (const line of content.split('\n')) {
		if (line.trim() === '---') {
			slides.push(current.join('\n').trim());
			current = [];
		} else {
			current.push(line);
		}
	}
	slides.push(current.join('\n').trim());
	return slides.filter((s) => s.length > 0);
}

// ── Slide canvas size ─────────────────────────────────────────────────────────
// Content is rendered at a fixed virtual resolution and scaled to fit the
// available container (same technique used by Reveal.js, Marp, etc.).
const SLIDE_W = 960;
const SLIDE_H = 540;

// ── Shared slide canvas ───────────────────────────────────────────────────────
/** Fixed-resolution 960×540 canvas scaled to fit, shared by paginate and spotlight modes. */
function ScaledSlide({
	value,
	scale,
	className = '',
	origin = 'center center',
}: {
	value: string;
	scale: number;
	className?: string;
	origin?: string;
}) {
	return (
		<div
			style={{
				width: SLIDE_W,
				height: SLIDE_H,
				transform: `scale(${String(scale)})`,
				transformOrigin: origin,
				flexShrink: 0,
			}}
			className={className}
		>
			<MarkdownViewer value={value} />
		</div>
	);
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface SlideViewerProps {
	value: string;
	/** When true, fills the full viewport (used by the standalone SlidesPage). */
	standalone?: boolean;
}

export function SlideViewer({ value, standalone = false }: SlideViewerProps) {
	const slides = splitSlides(value);
	const total = slides.length;

	const [index, setIndex] = useState(0);
	// When the slide content changes (e.g. edit mode → different deck) reset to slide 1.
	// Calling setState during render is the recommended React pattern for derived-state resets.
	const [prevValue, setPrevValue] = useState(value);
	if (prevValue !== value) {
		setPrevValue(value);
		setIndex(0);
	}
	const [scale, setScale] = useState(1);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isSpotlight, setIsSpotlight] = useState(false);
	const [spotlightScale, setSpotlightScale] = useState(1);
	// In standalone (presentation) mode, always use paginate mode.
	const [scrollMode, setScrollMode] = useState(!standalone);

	const stageRef = useRef<HTMLDivElement>(null); // the outer flex container
	const fullscreenRef = useRef<HTMLDivElement>(null); // the element we request fullscreen on
	const spotlightRef = useRef<HTMLDivElement>(null); // bare fullscreen overlay
	const slideElemsRef = useRef<(HTMLDivElement | null)[]>([]); // per-slide elements for scroll-nav

	// ── Keyboard navigation ──────────────────────────────────────────────────
	const prev = useCallback(() => {
		setIndex((i) => Math.max(0, i - 1));
	}, []);
	const next = useCallback(() => {
		setIndex((i) => Math.min(total - 1, i + 1));
	}, [total]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			// Don't hijack shortcuts when an input/textarea is focused
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
			// Same horizontal padding in both modes so slides appear the same size
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
			// Any fullscreen exit also exits spotlight
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

	// Reset to first slide when content changes
	// (handled via derived-state pattern above — no useEffect needed)

	const current = slides[index] ?? '';

	return (
		<div
			ref={fullscreenRef}
			className={`flex flex-col bg-muted/30 dark:bg-muted/10${standalone ? ' h-screen w-screen' : ' h-full'}`}
		>
			{/* ── Spotlight overlay — bare fullscreen, slide only ── */}
			{isSpotlight && (
				<div
					ref={spotlightRef}
					className="fixed inset-0 z-[9999] bg-background flex items-center justify-center cursor-none"
					onClick={next}
				>
					<ScaledSlide
						value={current}
						scale={spotlightScale}
						className="overflow-hidden"
					/>
				</div>
			)}
			{/* ── Slide stage ── */}
			{scrollMode ? (
				<div
					ref={stageRef}
					className="flex-1 overflow-y-auto flex flex-col items-center py-6 gap-4"
				>
					{slides.map((slide, i) => (
						<div
							key={i}
							ref={(el) => { slideElemsRef.current[i] = el; }}
							style={{
								position: 'relative',
								width: SLIDE_W * scale,
								height: SLIDE_H * scale,
								flexShrink: 0,
							}}
							className="shadow-xl rounded-sm overflow-hidden"
						>
							<ScaledSlide
								value={slide}
								scale={scale}
								origin="top left"
								className="bg-background overflow-hidden absolute top-0 left-0"
							/>
						</div>
					))}
				</div>
			) : (
				<div
					ref={stageRef}
					className="flex-1 flex items-center justify-center overflow-hidden"
				>
					{/* Fixed-size canvas, scaled to fit */}
					<ScaledSlide
						value={current}
						scale={scale}
						className="bg-background shadow-xl rounded-sm overflow-hidden"
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
			</div>
		</div>
	);
}
