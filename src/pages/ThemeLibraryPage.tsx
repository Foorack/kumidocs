import { useUser } from '@/store/user';
import { useTheme } from '@/store/theme';
import { isBgDark } from '@/lib/slide';
import type { SlideThemeDef } from '@/lib/slide';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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

const DARK_BUILTIN = new Set(['dark', 'corporate', 'gradient']);

// ── Miniature slide preview ─────────────────────────────────────────────────

const PREVIEW_W = 960;
const PREVIEW_H = 540;
const CARD_W = 256;
const SCALE = CARD_W / PREVIEW_W;
const CARD_H = Math.round(PREVIEW_H * SCALE);

function ThemePreview({
	themeClass,
	canvasDark,
	customBg,
	customFg,
	name,
	description,
}: {
	themeClass?: string;
	canvasDark: boolean;
	customBg?: string;
	customFg?: string;
	name: string;
	description: string;
}) {
	const canvasStyle: React.CSSProperties = {};
	if (customBg) {
		canvasStyle.background = customBg;
		canvasStyle.backgroundSize = 'cover';
		canvasStyle.backgroundPosition = 'center';
	}
	if (customFg) {
		(canvasStyle as Record<string, unknown>)['--slide-fg'] = customFg;
	}

	return (
		<div
			style={{ width: CARD_W, height: CARD_H, overflow: 'hidden', position: 'relative' }}
			className="rounded-sm"
		>
			<div
				style={{
					width: PREVIEW_W,
					height: PREVIEW_H,
					transform: `scale(${String(SCALE)})`,
					transformOrigin: 'top left',
					...canvasStyle,
				}}
				className={cn('slide-canvas', themeClass, canvasDark ? 'dark' : 'light')}
			>
				<div
					style={{
						padding: '3.5rem 4rem',
						height: '100%',
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
						color: 'var(--slide-fg)',
					}}
				>
					<h1
						style={{
							fontSize: '3.5rem',
							fontWeight: 700,
							marginBottom: '1rem',
							lineHeight: 1.1,
						}}
					>
						{name}
					</h1>
					<p style={{ fontSize: '1.75rem', opacity: 0.65 }}>{description}</p>
				</div>
			</div>
		</div>
	);
}

// ── Theme card ─────────────────────────────────────────────────────────────

function ThemeCard({
	id,
	name,
	description,
	custom,
}: {
	id: string;
	name: string;
	description: string;
	custom?: SlideThemeDef;
}) {
	const { theme: siteTheme } = useTheme();

	const canvasDark = custom
		? isBgDark(custom.bg ?? '')
		: DARK_BUILTIN.has(id) || (id === 'default' && siteTheme === 'dark');

	return (
		<div className="flex flex-col gap-2">
			<div className="rounded-md overflow-hidden border border-border shadow-sm">
				<ThemePreview
					themeClass={custom ? undefined : `slide-theme-${id}`}
					canvasDark={canvasDark}
					customBg={custom?.bg}
					customFg={custom?.fg}
					name={name}
					description={description}
				/>
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
		</div>
	);
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ThemeLibraryPage() {
	const { slideThemes } = useUser();
	const customEntries = Object.entries(slideThemes);

	const total = BUILTIN_THEMES.length + customEntries.length;

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
						<ThemeCard key={t.id} id={t.id} name={t.name} description={t.description} />
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
								/>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
