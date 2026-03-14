import { useState } from 'react';
import { X } from 'lucide-react';
import { useUser } from '@/store/user';
import { parseSlideDirectives } from '@/lib/slide';
import type { SlideThemeDef, SlideThemeMap } from '@/lib/slide';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScaledSlide, SlideViewer, SLIDE_W, SLIDE_H } from '@/components/editor/SlideViewer';

// ── Built-in theme catalogue ────────────────────────────────────────────────

interface BuiltInTheme {
	id: string;
	name: string;
	description: string;
}

const BUILTIN_THEMES: BuiltInTheme[] = [
	{ id: 'default', name: 'Default', description: 'Follows site light / dark mode' },
	{ id: 'dark', name: 'Dark', description: 'Near-black background, light text' },
	{ id: 'corporate', name: 'Corporate', description: 'Navy blue background' },
	{ id: 'minimal', name: 'Minimal', description: 'Soft off-white, minimal chrome' },
	{ id: 'gradient', name: 'Gradient', description: 'Purple-to-pink gradient' },
];

// ── Thumbnail constants ─────────────────────────────────────────────────────

const CARD_W = 320;
const CARD_SCALE = CARD_W / SLIDE_W;
const CARD_H = Math.round(SLIDE_H * CARD_SCALE);

// ── Demo slide content generator ────────────────────────────────────────────

const STANDARD_LAYOUTS = new Set([
	'title',
	'section',
	'split',
	'center',
	'invert',
	'blank',
	'default',
]);

function generateDemoMarkdown(name: string, customDef?: SlideThemeDef): string {
	const slides = [
		`<!-- class: title -->\n# ${name}\n\nYour collaborative wiki and presentation platform.`,
		`# Key Features\n\n- Real-time collaboration with presence\n- Markdown-first rich presentations\n- Custom themes via \`.kumidocs.json\``,
		`<!-- class: section -->\n## Getting Started`,
		`<!-- class: split -->\n## What We Do\n\nLeft column content.\n\n## How We Do It\n\nRight column content.`,
	];

	if (customDef?.layouts) {
		for (const layoutKey of Object.keys(customDef.layouts)) {
			if (!STANDARD_LAYOUTS.has(layoutKey)) {
				slides.push(
					`<!-- class: ${layoutKey} -->\n# ${layoutKey}\n\nCustom layout variant.`,
				);
			}
		}
	}

	return slides.join('\n\n---\n\n');
}

// ── Theme card ─────────────────────────────────────────────────────────────

function ThemeCard({
	id,
	name,
	description,
	custom,
	slideThemes,
	onClick,
}: {
	id: string;
	name: string;
	description: string;
	custom?: SlideThemeDef;
	slideThemes: SlideThemeMap;
	onClick: () => void;
}) {
	const titleSlide = parseSlideDirectives(`<!-- class: title -->\n# ${name}\n\n${description}`);

	return (
		<button type="button" className="flex flex-col gap-2 text-left group" onClick={onClick}>
			<div className="rounded-md overflow-hidden border border-border shadow-sm group-hover:border-primary/50 group-hover:shadow-md transition-[box-shadow,border-color]">
				<div
					style={{
						width: CARD_W,
						height: CARD_H,
						overflow: 'hidden',
						position: 'relative',
					}}
				>
					<ScaledSlide
						slide={titleSlide}
						scale={CARD_SCALE}
						theme={id}
						paginate={false}
						slideNum={1}
						total={1}
						slideThemes={slideThemes}
						origin="top left"
					/>
				</div>
			</div>
			<div className="flex items-start gap-2">
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium truncate">{name}</p>
					<p className="text-xs text-muted-foreground truncate">{description}</p>
				</div>
				{custom && (
					<Badge variant="secondary" className="shrink-0 text-xs">
						custom
					</Badge>
				)}
			</div>
		</button>
	);
}

// ── Page ───────────────────────────────────────────────────────────────────

interface ActiveItem {
	id: string;
	name: string;
	custom?: SlideThemeDef;
}

export default function ThemeLibraryPage() {
	const { slideThemes } = useUser();
	const [active, setActive] = useState<ActiveItem | null>(null);

	const customEntries = Object.entries(slideThemes);
	const total = BUILTIN_THEMES.length + customEntries.length;

	const demoMarkdown = active ? generateDemoMarkdown(active.name, active.custom) : '';

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
				<h1 className="text-xl font-semibold flex-1">Theme Library</h1>
				<span className="text-sm text-muted-foreground">
					{total} {total === 1 ? 'theme' : 'themes'}
				</span>
			</div>

			{/* Grid */}
			<div className="flex-1 overflow-y-auto p-6">
				{/* Built-in */}
				<h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
					Built-in
				</h2>
				<div
					className="grid gap-6 mb-8"
					style={{ gridTemplateColumns: `repeat(auto-fill, ${String(CARD_W)}px)` }}
				>
					{BUILTIN_THEMES.map((t) => (
						<ThemeCard
							key={t.id}
							id={t.id}
							name={t.name}
							description={t.description}
							slideThemes={slideThemes}
						onClick={() => { setActive({ id: t.id, name: t.name }); }}
						/>
					))}
				</div>

				{/* Custom */}
				{customEntries.length > 0 && (
					<>
						<h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
							Custom (.kumidocs.json)
						</h2>
						<div
							className="grid gap-6"
							style={{
								gridTemplateColumns: `repeat(auto-fill, ${String(CARD_W)}px)`,
							}}
						>
							{customEntries.map(([id, def]) => (
								<ThemeCard
									key={id}
									id={id}
									name={id}
									description={def.bg ?? 'Custom theme'}
									custom={def}
									slideThemes={slideThemes}
							onClick={() => { setActive({ id, name: id, custom: def }); }}
								/>
							))}
						</div>
					</>
				)}
			</div>

			{/* Demo dialog */}
			<Dialog
				open={active !== null}
				onOpenChange={(open) => {
					if (!open) setActive(null);
				}}
			>
				<DialogContent
					showCloseButton={false}
					className="max-w-5xl w-full p-0 gap-0 overflow-hidden flex flex-col h-[85vh]"
				>
					{/* Dialog header */}
					<div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
						<div className="flex items-center gap-2">
							<span className="text-sm font-semibold">{active?.name}</span>
							{active?.custom && (
								<Badge variant="secondary" className="text-xs">
									custom
								</Badge>
							)}
						</div>
						<button
							type="button"
							onClick={() => { setActive(null); }}
							className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<X className="size-4" />
							<span className="sr-only">Close</span>
						</button>
					</div>

					{/* Slide viewer */}
					<div className="flex-1 min-h-0">
						{active && (
							<SlideViewer
								value={demoMarkdown}
								theme={active.id}
								slideThemes={slideThemes}
								paginate
							/>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
