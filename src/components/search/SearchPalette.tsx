import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '../ui/command';
import { TextBulletListSquare20Filled, SlideTextSparkle20Filled } from '@fluentui/react-icons';
import type { SearchResult } from '../../lib/types';

interface SearchPaletteProps {
	open: boolean;
	onClose: () => void;
}

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		if (!open) {
			setQuery('');
			setResults([]);
		}
	}, [open]);

	useEffect(() => {
		if (!query.trim()) {
			setResults([]);
			return;
		}
		const timer = setTimeout(async () => {
			setLoading(true);
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
				if (res.ok) setResults((await res.json()) as SearchResult[]);
			} catch {}
			setLoading(false);
		}, 150);
		return () => {
			clearTimeout(timer);
		};
	}, [query]);

	const handleSelect = useCallback(
		(path: string) => {
			onClose();
			const ext = path.split('.').pop();
			if (ext === 'md') {
				navigate(`/p/${path}`);
			} else {
				navigate(`/code/${path}`);
			}
		},
		[navigate, onClose],
	);

	return (
		<CommandDialog open={open} onOpenChange={(o) => !o && onClose()}>
			<CommandInput placeholder="Search pages..." value={query} onValueChange={setQuery} />
			<CommandList>
				{loading && (
					<div className="py-3 text-center text-sm text-muted-foreground">
						Searching...
					</div>
				)}
				{!loading && query && results.length === 0 && (
					<CommandEmpty>No results for "{query}".</CommandEmpty>
				)}
				{results.length > 0 && (
					<CommandGroup heading="Pages">
						{results.map((r) => (
							<CommandItem
								key={r.path}
								value={r.path}
								onSelect={() => {
									handleSelect(r.path);
								}}
								className="gap-2"
							>
								<span className="shrink-0">
									{r.emoji ? (
										<span className="text-base">{r.emoji}</span>
									) : r.path.endsWith('.md') ? (
										<TextBulletListSquare20Filled className="w-4 h-4" />
									) : (
										<SlideTextSparkle20Filled className="w-4 h-4" />
									)}
								</span>
								<div className="flex flex-col min-w-0">
									<span className="font-medium text-sm">{r.title}</span>
									<span className="text-xs text-muted-foreground truncate">
										{r.snippet}
									</span>
								</div>
								<span className="ml-auto text-xs text-muted-foreground shrink-0">
									{r.path}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
