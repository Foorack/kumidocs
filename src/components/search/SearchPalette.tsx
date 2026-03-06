import { useState, useLayoutEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '../ui/command';
import { KumiIcon } from '../ui/KumiIcon';
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

	useLayoutEffect(() => {
		if (!query.trim()) {
			return;
		}
		const timer = setTimeout(() => {
			setLoading(true);
			fetch(`/api/search?q=${encodeURIComponent(query)}`)
				.then((res) => {
					if (!res.ok) throw new Error(`Search HTTP ${String(res.status)}`);
					return res.json() as Promise<SearchResult[]>;
				})
				.then((data) => {
					setResults(data);
				})
				.catch((err: unknown) => {
					console.error('Search failed:', err);
				})
				.finally(() => {
					setLoading(false);
				});
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
				navigate(`/p/${path}`)?.catch((err: unknown) => {
					console.error('Navigation failed:', err);
				});
			} else {
				navigate(`/code/${path}`)?.catch((err: unknown) => {
					console.error('Navigation failed:', err);
				});
			}
		},
		[navigate, onClose],
	);

	const activeResults = query.trim() ? results : [];

	return (
		<CommandDialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					setQuery('');
					setResults([]);
					onClose();
				}
			}}
		>
			<CommandInput placeholder="Search pages..." value={query} onValueChange={setQuery} />
			<CommandList>
				{loading && (
					<div className="py-3 text-center text-sm text-muted-foreground">
						Searching...
					</div>
				)}
				{!loading && query && activeResults.length === 0 && (
					<CommandEmpty>No results for "{query}".</CommandEmpty>
				)}
				{activeResults.length > 0 && (
					<CommandGroup heading="Pages">
						{activeResults.map((r) => (
							<CommandItem
								key={r.path}
								value={r.path}
								onSelect={() => {
									handleSelect(r.path);
								}}
								className="gap-2"
							>
								<span className="shrink-0">
									<KumiIcon
										emoji={r.emoji}
										fileType={r.type ?? 'doc'}
										size={20}
									/>
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
