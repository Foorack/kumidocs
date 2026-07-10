import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useLayoutEffect, useState } from "react";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import type { SearchResult } from "@/lib/types";
import { searchPages } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/store/user";

const SEARCH_DELAY_MS = 150;
const EMOJI_SIZE = 20;

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResultsListProps {
  loading: boolean;
  query: string;
  results: SearchResult[];
  onSelect: (path: string) => void;
}

const SearchResultsList = (allProps: SearchResultsListProps): JSX.Element => {
  const { loading, query, results, onSelect } = allProps;
  let activeResults: SearchResult[] = results;
  if (!query.trim()) {
    activeResults = [];
  }
  const pages = activeResults.filter((result) => result.type !== "ticket");
  const tickets = activeResults.filter((result) => result.type === "ticket");
  return (
    <CommandList>
      {loading && <div className="py-3 text-center">Searching...</div>}
      {!loading && Boolean(query) && activeResults.length === 0 && (
        <CommandEmpty>No results for &quot;{query}&quot;.</CommandEmpty>
      )}
      {pages.length > 0 && (
        <CommandGroup heading="Pages">
          {pages.map(
            (result): JSX.Element => (
              <CommandItem
                key={result.path}
                value={result.path}
                onSelect={(): void => {
                  onSelect(result.path);
                }}
                className="gap-2"
              >
                <span className="shrink-0">
                  <EmojiIcon
                    emoji={result.emoji}
                    fileType={result.type ?? "doc"}
                    size={EMOJI_SIZE}
                  />
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium">{result.title}</span>
                  <span className="truncate">{result.snippet}</span>
                </div>
                <span className="ml-auto shrink-0">{result.path}</span>
              </CommandItem>
            ),
          )}
        </CommandGroup>
      )}
      {tickets.length > 0 && (
        <CommandGroup heading="Tickets">
          {tickets.map(
            (result): JSX.Element => (
              <CommandItem
                key={result.path}
                value={result.path}
                onSelect={(): void => {
                  onSelect(result.path);
                }}
                className="gap-2"
              >
                <span className="shrink-0">
                  <EmojiIcon fileType="ticket" size={EMOJI_SIZE} />
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium">{result.title}</span>
                  <span className="text-xs text-muted-foreground">
                    #{result.ticketId} &middot; {result.boardSlug}
                  </span>
                </div>
                <span className="ml-auto shrink-0">
                  {result.boardSlug}/{result.ticketId}
                </span>
              </CommandItem>
            ),
          )}
        </CommandGroup>
      )}
    </CommandList>
  );
};

const SearchPalette = (allProps: SearchPaletteProps): JSX.Element => {
  const { open, onClose } = allProps;
  const { mode } = useUser();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      void (async (): Promise<void> => {
        setLoading(true);
        try {
          const data = await searchPages(query, mode);
          setResults(data);
          setLoading(false);
        } catch (error: unknown) {
          console.error("Search failed:", error);
          setLoading(false);
        }
      })();
    }, SEARCH_DELAY_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [query]);

  const handleSelect = (path: string): void => {
    onClose();
    // Find the full result object to check if it's a ticket
    const result = results.find((entry) => entry.path === path);
    if (
      result?.boardSlug !== undefined &&
      result.ticketId !== undefined &&
      result.ticketId !== ""
    ) {
      void navigate(`/b/${result.boardSlug}/${result.ticketId}`);
      return;
    }
    const ext = path.split(".").pop();
    let navPath = `/code/${path}`;
    if (ext === "md") {
      navPath = `/p/${path}`;
    }
    void navigate(navPath);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(isOpen: boolean): void => {
        if (!isOpen) {
          setQuery("");
          setResults([]);
          onClose();
        }
      }}
      shouldFilter={false}
    >
      <CommandInput placeholder="Search pages..." value={query} onValueChange={setQuery} />
      <SearchResultsList
        loading={loading}
        query={query}
        results={results}
        onSelect={handleSelect}
      />
    </CommandDialog>
  );
};

export default SearchPalette;
