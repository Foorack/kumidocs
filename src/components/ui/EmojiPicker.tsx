/**
 * EmojiPicker — custom emoji grid using bundled Microsoft Fluent Emoji SVGs.
 *
 * Uses the local emojimart-data-all-15.json for category + keyword metadata.
 * Every emoji cell is rendered by <EmojiIcon> for visual consistency with the rest
 * of the app. SVGs are baked into the JS bundle — zero HTTP requests.
 */
import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { EmojiIcon } from './EmojiIcon';
import EMOJI_SVGS from './emoji/emojis';
import data from './emoji/emojimart-data-all-15.json';
import { Input } from './input';
import { ScrollArea } from './scroll-area';
import { cn } from '../../lib/utils';

// ── Typed subset of emojimart-data-all-15.json ───────────────────────────────

interface EmojiSkin {
	native: string;
}
interface EmojiEntry {
	id: string;
	name: string;
	keywords: string[];
	skins: EmojiSkin[];
}
interface CategoryEntry {
	id: string;
	emojis: string[]; // emoji IDs
}
interface MartData {
	categories: CategoryEntry[];
	emojis: Record<string, EmojiEntry>;
}

const emojiData = data as unknown as MartData;

// ── Category display config ───────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
	people: { label: 'Smileys & People', icon: '😀' },
	nature: { label: 'Animals & Nature', icon: '🐾' },
	foods: { label: 'Food & Drink', icon: '🍕' },
	activity: { label: 'Activities', icon: '⚽' },
	places: { label: 'Travel & Places', icon: '✈️' },
	objects: { label: 'Objects', icon: '💡' },
	symbols: { label: 'Symbols', icon: '💫' },
	flags: { label: 'Flags', icon: '🏁' },
};

// ── Pre-built indexes (run once at module load, not per render) ───────────────

// Per-category emoji arrays
const CATEGORY_EMOJIS: Record<string, { native: string; name: string }[]> = {};
for (const cat of emojiData.categories) {
	CATEGORY_EMOJIS[cat.id] = cat.emojis
		.map((id) => {
			const e = emojiData.emojis[id];
			const native = e?.skins[0]?.native;
			return native ? { native, name: e.name } : null;
		})
		.filter((item) => item !== null && item.native in EMOJI_SVGS) as {
		native: string;
		name: string;
	}[];
}

// Flat search index: { native, searchText } — built once
const SEARCH_INDEX = Object.values(emojiData.emojis)
	.map((e) => {
		const native = e.skins[0]?.native;
		if (!native || !(native in EMOJI_SVGS)) return null;
		return {
			native,
			name: e.name,
			searchText: `${e.name} ${e.keywords.join(' ')}`.toLowerCase(),
		};
	})
	.filter(Boolean) as { native: string; name: string; searchText: string }[];

// ── Memoised emoji cell ───────────────────────────────────────────────────────

// Only changed cells re-render when the grid updates.
const EmojiCell = memo(function EmojiCell({
	native,
	name,
	onSelect,
}: {
	native: string;
	name: string;
	onSelect: (native: string) => void;
}) {
	return (
		<button
			type="button"
			title={name}
			onClick={() => {
				onSelect(native);
			}}
			className="w-12 h-12 rounded flex items-center justify-center hover:bg-accent transition-colors"
		>
			<EmojiIcon emoji={native} size={36} />
		</button>
	);
});

// ── Component ─────────────────────────────────────────────────────────────────

interface EmojiPickerProps {
	onEmojiSelect: (emoji: string) => void;
	autoFocus?: boolean;
}

export function EmojiPicker({ onEmojiSelect, autoFocus }: EmojiPickerProps) {
	const [search, setSearch] = useState('');
	const [activeCategory, setActiveCategory] = useState(
		() => emojiData.categories[0]?.id ?? 'people',
	);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus the search input once the popover animation has settled
	useEffect(() => {
		if (!autoFocus) return;
		const t = setTimeout(() => {
			inputRef.current?.focus();
		}, 60);
		return () => {
			clearTimeout(t);
		};
	}, [autoFocus]);

	const displayEmojis = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return CATEGORY_EMOJIS[activeCategory] ?? [];
		return SEARCH_INDEX.filter((e) => e.searchText.includes(q)).slice(0, 96);
	}, [search, activeCategory]);

	return (
		<div className="w-[420px] rounded-lg border border-border bg-popover shadow-lg flex flex-col overflow-hidden">
			{/* Search */}
			<div className="px-2 pt-2 pb-1.5">
				<Input
					ref={inputRef}
					value={search}
					onChange={(e) => {
						setSearch(e.target.value);
					}}
					placeholder="Search emoji…"
					className="h-10 text-sm"
				/>
			</div>

			{/* Category tabs — hidden while searching */}
			{!search && (
				<div className="flex gap-0.5 px-2 pb-1.5">
					{emojiData.categories.map((cat) => {
						const cfg = CATEGORY_CONFIG[cat.id];
						return (
							<button
								key={cat.id}
								type="button"
								title={cfg?.label ?? cat.id}
								onClick={() => {
									setActiveCategory(cat.id);
								}}
								className={cn(
									'shrink-0 w-12 h-12 rounded flex items-center justify-center transition-colors',
									activeCategory === cat.id
										? 'bg-accent'
										: 'hover:bg-accent/50 opacity-60 hover:opacity-100',
								)}
							>
								{cfg && <EmojiIcon emoji={cfg.icon} size={36} />}
							</button>
						);
					})}
				</div>
			)}

			<div className="h-px bg-border" />

			{/* Emoji grid */}
			<ScrollArea className="h-[323px]">
				<div
					className="grid p-1.5 gap-0.5"
					style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}
				>
					{displayEmojis.map(({ native, name }) => (
						<EmojiCell
							key={native}
							native={native}
							name={name}
							onSelect={onEmojiSelect}
						/>
					))}
				</div>
				{displayEmojis.length === 0 && (
					<p className="py-8 text-center text-xs text-muted-foreground">No results</p>
				)}
			</ScrollArea>
		</div>
	);
}
