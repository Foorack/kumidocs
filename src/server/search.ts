import MiniSearch from 'minisearch';
import matter from 'gray-matter';
import { getAllPaths, getFile } from './filestore';
import type { SearchResult } from '../lib/types';

interface DocEntry {
	id: string;
	path: string;
	title: string;
	emoji?: string;
	description?: string;
	content: string;
}

let index: MiniSearch<DocEntry>;

export function initSearch(): void {
	index = new MiniSearch<DocEntry>({
		fields: ['title', 'content', 'description', 'path'],
		storeFields: ['title', 'path', 'emoji', 'description'],
		searchOptions: {
			boost: { title: 3, description: 1.5 },
			fuzzy: 0.2,
			prefix: true,
		},
	});
	rebuildIndex();
}

export function rebuildIndex(): void {
	if (!index) return;
	index.removeAll();
	const docs = buildDocs(getAllPaths());
	if (docs.length > 0) index.addAll(docs);
	console.log(`Search: indexed ${docs.length} documents`);
}

function buildDocs(paths: string[]): DocEntry[] {
	return paths
		.filter((p) => p.endsWith('.md') && !p.startsWith('.'))
		.map((path) => {
			const raw = getFile(path) ?? '';
			let title = path.replace(/\.md$/, '').split('/').pop()?.replace(/[-_]/g, ' ') ?? path;
			let emoji: string | undefined;
			let description: string | undefined;
			let body = raw;

			try {
				const parsed = matter(raw);
				if (parsed.data.title) title = parsed.data.title as string;
				if (parsed.data.emoji) emoji = parsed.data.emoji as string;
				if (parsed.data.description) description = parsed.data.description as string;
				body = parsed.content;
			} catch {}

			const stripped = body
				.replace(/```[\s\S]*?```/g, ' ')
				.replace(/`[^`]+`/g, ' ')
				.replace(/^#{1,6}\s+/gm, '')
				.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
				.replace(/[*_~>|]/g, '')
				.replace(/\s+/g, ' ')
				.trim();

			return { id: path, path, title, emoji, description, content: stripped };
		});
}

export function updateInIndex(path: string): void {
	if (!index || !path.endsWith('.md')) return;
	try {
		index.remove({ id: path } as DocEntry);
	} catch {}
	const docs = buildDocs([path]);
	if (docs.length > 0) {
		try {
			index.add(docs[0]!);
		} catch {}
	}
}

export function removeFromIndex(path: string): void {
	if (!index) return;
	try {
		index.remove({ id: path } as DocEntry);
	} catch {}
}

export function searchDocs(query: string, limit = 20): SearchResult[] {
	if (!index || !query.trim()) return [];
	const results = index.search(query, { limit } as any) as (Record<string, unknown> & {
		score: number;
	})[];
	return results.map((r) => ({
		path: r.path as string,
		title: r.title as string,
		emoji: r.emoji as string | undefined,
		snippet: buildSnippet(r.path as string, query),
		score: r.score,
	}));
}

function buildSnippet(path: string, query: string): string {
	const content = getFile(path) ?? '';
	const body = content.replace(/^---[\s\S]*?---\n/, '');
	const word = query.split(' ')[0]?.toLowerCase() ?? '';
	const idx = body.toLowerCase().indexOf(word);
	if (idx === -1) return body.replace(/\n/g, ' ').slice(0, 140) + '…';
	const start = Math.max(0, idx - 60);
	const end = Math.min(body.length, idx + 120);
	return (
		(start > 0 ? '…' : '') +
		body.slice(start, end).replace(/\n/g, ' ') +
		(end < body.length ? '…' : '')
	);
}
