import MiniSearch from 'minisearch';
import matter from 'gray-matter';
import { getAllPaths, getFile, parseFileEntry } from './filestore';
import type { FileType, SearchResult } from '../lib/types';

interface DocEntry {
	id: string;
	path: string;
	title: string;
	emoji?: string;
	type: string;
	content: string;
}

let index: MiniSearch<DocEntry> | undefined;

export function initSearch(): void {
	index = new MiniSearch<DocEntry>({
		fields: ['title', 'content', 'path'],
		storeFields: ['title', 'path', 'emoji', 'type'],
		searchOptions: {
			boost: { title: 3 },
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
	console.log(`Search: indexed ${String(docs.length)} documents`);
}

function buildDocs(paths: string[]): DocEntry[] {
	return paths
		.filter((p) => p.endsWith('.md') && !p.startsWith('.'))
		.map((path) => {
			const { title, emoji, type } = parseFileEntry(path);

			let body = getFile(path) ?? '';
			try {
				body = matter(body).content;
			} catch {
				// keep raw content if frontmatter parse fails
			}

			const stripped = body
				.replace(/```[\s\S]*?```/g, ' ')
				.replace(/`[^`]+`/g, ' ')
				.replace(/^#{1,6}\s+/gm, '')
				.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
				.replace(/[*_~>|]/g, '')
				.replace(/\s+/g, ' ')
				.trim();

			return { id: path, path, title, emoji, type, content: stripped };
		});
}

export function updateInIndex(path: string): void {
	if (!index || !path.endsWith('.md')) return;
	try {
		index.remove({ id: path } as DocEntry);
	} catch (err: unknown) {
		console.warn('Failed to remove from index:', err);
	}
	const docs = buildDocs([path]);
	if (docs.length > 0) {
		const doc = docs[0];
		if (doc) {
			try {
				index.add(doc);
			} catch (err: unknown) {
				console.warn('Failed to add to index:', err);
			}
		}
	}
}

export function removeFromIndex(path: string): void {
	if (!index) return;
	try {
		index.remove({ id: path } as DocEntry);
	} catch (err: unknown) {
		console.warn('Failed to remove from index:', err);
	}
}

export function searchDocs(query: string, limit = 20): SearchResult[] {
	if (!index || !query.trim()) return [];
	const results = (
		index.search(query) as unknown as (Record<string, unknown> & { score: number })[]
	).slice(0, limit);
	return results.map((r) => ({
		path: r.path as string,
		title: r.title as string,
		emoji: r.emoji as string | undefined,
		type: (r.type as FileType | undefined) ?? 'doc',
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
