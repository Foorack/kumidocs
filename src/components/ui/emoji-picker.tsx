/**
 * EmojiPicker: custom emoji grid using bundled Microsoft Fluent Emoji SVGs.
 *
 * Uses the local emojimart-data-all-15.json for category + keyword metadata.
 * Every emoji cell is rendered by <EmojiIcon> for visual consistency with the rest
 * of the app. SVGs are baked into the JS bundle; zero HTTP requests.
 */
import { memo, useMemo, useState } from "react";
import { EMOJI_SVGS } from "@/lib/emoji-loader";
import { EmojiIcon } from "./emoji-icon";
import Input from "./input";
import { ScrollArea } from "./scroll-area";
import cn from "@/lib/utils";
import data from "./emoji/emojimart-data-all-15.json";

// Typed subset of emojimart-data-all-15.json

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
  // Emoji IDs
  emojis: string[];
}
interface MartData {
  categories: CategoryEntry[];
  emojis: Record<string, EmojiEntry>;
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const emojiData = data as unknown as MartData;

// Category display config

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  activity: { icon: "⚽", label: "Activities" },
  flags: { icon: "🏁", label: "Flags" },
  foods: { icon: "🍔", label: "Food & Drink" },
  nature: { icon: "🫎", label: "Animals & Nature" },
  objects: { icon: "💡", label: "Objects" },
  people: { icon: "🥳", label: "Smileys & People" },
  places: { icon: "✈️", label: "Travel & Places" },
  symbols: { icon: "💫", label: "Symbols" },
};

// Pre-built indexes (run once at module load, not per render)

const CATEGORY_EMOJIS: Record<string, { native: string; name: string }[]> = {};
for (const cat of emojiData.categories) {
  CATEGORY_EMOJIS[cat.id] = cat.emojis.flatMap((id): { native: string; name: string }[] => {
    const entry = emojiData.emojis[id];
    if (!entry) {
      return [];
    }
    const [skin] = entry.skins;
    if (!skin) {
      return [];
    }
    if (!(skin.native in EMOJI_SVGS)) {
      return [];
    }
    return [{ name: entry.name, native: skin.native }];
  });
}

const SEARCH_INDEX = Object.values(emojiData.emojis).flatMap(
  (entry): { native: string; name: string; searchText: string }[] => {
    const [skin] = entry.skins;
    if (!skin) {
      return [];
    }
    if (!(skin.native in EMOJI_SVGS)) {
      return [];
    }
    return [
      {
        name: entry.name,
        native: skin.native,
        searchText: `${entry.name} ${entry.keywords.join(" ")}`.toLowerCase(),
      },
    ];
  },
);

const MAX_SEARCH_RESULTS = 96;
const EMOJI_CELL_SIZE = 36;

const getInitialCategory = (): string => {
  const [first] = emojiData.categories;
  if (first) {
    return first.id;
  }
  return "people";
};

// Memoised emoji cell

interface EmojiCellProps {
  native: string;
  name: string;
  onSelect: (native: string) => void;
}

const EmojiCellInner = (allProps: EmojiCellProps): JSX.Element => {
  const { native, name, onSelect } = allProps;
  return (
    <button
      type="button"
      title={name}
      onClick={(): void => {
        onSelect(native);
      }}
      className="w-12 h-12 rounded flex items-center justify-center hover:bg-accent transition-colors"
    >
      <EmojiIcon emoji={native} size={EMOJI_CELL_SIZE} />
    </button>
  );
};

const EmojiCell = memo(EmojiCellInner);

// Category tabs

interface CategoryTabsProps {
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}

const CategoryTabsInner = (allProps: CategoryTabsProps): JSX.Element => {
  const { activeCategory, onCategoryChange } = allProps;
  return (
    <div className="flex gap-0.5 px-2 pb-1.5">
      {emojiData.categories.map((cat): JSX.Element => {
        const cfg = CATEGORY_CONFIG[cat.id];
        let catLabel = cat.id;
        if (cfg && cfg.label) {
          catLabel = cfg.label;
        }
        let tabClass = "hover:bg-accent/50 opacity-60 hover:opacity-100";
        if (activeCategory === cat.id) {
          tabClass = "bg-accent";
        }
        return (
          <button
            key={cat.id}
            type="button"
            title={catLabel}
            onClick={(): void => {
              onCategoryChange(cat.id);
            }}
            className={cn(
              "shrink-0 w-12 h-12 rounded flex items-center justify-center transition-colors",
              tabClass,
            )}
          >
            {cfg && <EmojiIcon emoji={cfg.icon} size={EMOJI_CELL_SIZE} />}
          </button>
        );
      })}
    </div>
  );
};

const CategoryTabs = memo(CategoryTabsInner);

// Emoji grid

interface EmojiGridProps {
  displayEmojis: { native: string; name: string }[];
  onSelect: (emoji: string) => void;
}

const EmojiGridInner = (allProps: EmojiGridProps): JSX.Element => {
  const { displayEmojis, onSelect } = allProps;
  return (
    <ScrollArea className="h-[323px]">
      <div
        className="grid p-1.5 gap-0.5"
        style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}
      >
        {displayEmojis.map(
          ({ native, name }): JSX.Element => (
            <EmojiCell key={native} native={native} name={name} onSelect={onSelect} />
          ),
        )}
      </div>
      {displayEmojis.length === 0 && (
        <p className="py-8 text-center text-xs text-muted-foreground">No results</p>
      )}
    </ScrollArea>
  );
};

const EmojiGrid = memo(EmojiGridInner);

// Component

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  autoFocus?: boolean;
}

const EmojiPickerInner = (allProps: EmojiPickerProps): JSX.Element => {
  const { onEmojiSelect, autoFocus } = allProps;
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(getInitialCategory);
  const displayEmojis = useMemo((): { native: string; name: string }[] => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return CATEGORY_EMOJIS[activeCategory] ?? [];
    }
    return SEARCH_INDEX.filter((entry) => entry.searchText.includes(query)).slice(
      0,
      MAX_SEARCH_RESULTS,
    );
  }, [search, activeCategory]);
  return (
    <div className="w-[420px] rounded-lg border border-border bg-popover shadow-lg flex flex-col overflow-hidden">
      <div className="px-2 pt-2 pb-1.5">
        <Input
          autoFocus={autoFocus}
          value={search}
          onChange={(event): void => {
            setSearch(event.target.value);
          }}
          placeholder="Search emoji…"
          className="h-10 text-sm"
        />
      </div>
      {!search && (
        <CategoryTabs activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
      )}
      <div className="h-px bg-border" />
      <EmojiGrid displayEmojis={displayEmojis} onSelect={onEmojiSelect} />
    </div>
  );
};

const EmojiPicker = memo(EmojiPickerInner);

export default EmojiPicker;
