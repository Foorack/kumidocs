import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname, extname, relative } from 'path';
import matter from 'gray-matter';
import type { Config } from './config';
import type { FileEntry, TreeNode } from '../lib/types';
import { CODE_TYPES, IMAGE_TYPES, extensionToType, pathExtension } from '@/lib/filetypes';
import { extractHeadingTitle } from '@/lib/frontmatter';

const fileCache = new Map<string, string>(); // relPath -> content
let treeCache: TreeNode[] | null = null; // invalidated on every write/delete/move

function invalidateTree(): void {
	treeCache = null;
}

const IGNORED_NAMES = new Set([
	'.git',
	'.kumidocs.json',
	'node_modules',
	'.DS_Store',
	'.env',
	'dist',
]);

const IGNORED_EXT = new Set(['.lock', '.log', '.map']);

export async function loadFilestore(config: Config): Promise<void> {
	fileCache.clear();
	await scanDir(config.repoPath, config.repoPath);
	console.log(`Filestore: loaded ${String(fileCache.size)} files`);
}

async function scanDir(basePath: string, dirPath: string): Promise<void> {
	let entries;
	try {
		entries = await readdir(dirPath, { withFileTypes: true });
	} catch {
		return;
	}

	await Promise.all(
		entries.map(async (entry) => {
			if (IGNORED_NAMES.has(entry.name)) return;
			const fullPath = join(dirPath, entry.name);
			const relPath = relative(basePath, fullPath);

			if (entry.isDirectory()) {
				await scanDir(basePath, fullPath);
			} else if (entry.isFile()) {
				const ext = extname(entry.name).toLowerCase();
				if (IGNORED_EXT.has(ext)) return;
				// Only read text files; for others store empty string as marker
				if (ext === '.md' || CODE_TYPES.has(ext) || ext === '') {
					try {
						const content = await readFile(fullPath, 'utf-8');
						fileCache.set(relPath, content);
					} catch {
						fileCache.set(relPath, '');
					}
				} else {
					// binary / image — register path but store empty string
					fileCache.set(relPath, '');
				}
			}
		}),
	);
}

export function getFile(path: string): string | undefined {
	return fileCache.get(path);
}

export function getAllPaths(): string[] {
	return [...fileCache.keys()].sort();
}

export async function writeFileToRepo(
	path: string,
	content: string,
	config: Config,
): Promise<void> {
	const fullPath = join(config.repoPath, path);
	await mkdir(dirname(fullPath), { recursive: true });
	const isBinary = IMAGE_TYPES.has(extname(path).toLowerCase());
	const normalised = isBinary || content.endsWith('\n') ? content : `${content}\n`;
	await writeFile(fullPath, normalised, 'utf-8');
	fileCache.set(path, normalised);
	invalidateTree();
}

export async function deleteFileFromRepo(path: string, config: Config): Promise<void> {
	const fullPath = join(config.repoPath, path);
	await unlink(fullPath);
	fileCache.delete(path);
	invalidateTree();
}

export async function reloadFile(path: string, config: Config): Promise<void> {
	const fullPath = join(config.repoPath, path);
	try {
		const content = await readFile(fullPath, 'utf-8');
		fileCache.set(path, content);
	} catch {
		fileCache.delete(path);
	}
	invalidateTree();
}

export function addToCache(path: string, content: string): void {
	fileCache.set(path, content);
	invalidateTree();
}

export function removeFromCache(path: string): void {
	fileCache.delete(path);
	invalidateTree();
}

export function moveInCache(from: string, to: string): void {
	const content = fileCache.get(from) ?? '';
	fileCache.set(to, content);
	fileCache.delete(from);
	invalidateTree();
}

// Build file tree for /api/tree
export function buildFileTree(): TreeNode[] {
	if (treeCache) return treeCache;

	const allPaths = getAllPaths();
	// Filter out hidden / internal files and the images/ directory (shown via Image Library)
	const visible = allPaths.filter(
		(p) =>
			!p.startsWith('.') &&
			!IGNORED_NAMES.has(p.split('/')[0] ?? '') &&
			!p.startsWith('images/'),
	);

	const root: TreeNode[] = [];
	const nodeMap = new Map<string, TreeNode>();

	for (const p of visible.sort()) {
		const parts = p.split('/');
		let current = root;
		let cumPath = '';

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (!part) continue;
			cumPath = cumPath ? `${cumPath}/${part}` : part;
			const isLast = i === parts.length - 1;

			if (isLast) {
				const fileEntry = parseFileEntry(p);
				const node: TreeNode = { path: p, name: part, type: 'file', fileEntry };
				current.push(node);
				nodeMap.set(cumPath, node);
			} else {
				let dirNode = nodeMap.get(cumPath);
				if (!dirNode) {
					dirNode = { path: cumPath, name: part, type: 'dir', children: [] };
					current.push(dirNode);
					nodeMap.set(cumPath, dirNode);
				}
				const children = dirNode.children;
				if (children) current = children;
			}
		}
	}

	treeCache = root;
	return root;
}

/** Return the text of the first `# Heading` line in a markdown body, or null.
 * Imported from @/lib/frontmatter — re-exported here for convenience.
 */
export { extractHeadingTitle };

export function parseFileEntry(path: string): FileEntry {
	const ext = pathExtension(path);
	const fileName = path.split('/').pop() ?? path;
	const baseName = fileName.replace(/\.md$/, '');
	const titleFromName = baseName.replace(/[-_]/g, ' ');

	let type: FileEntry['type'] = extensionToType(ext);
	let title = titleFromName;
	let emoji: string | undefined;
	let description: string | undefined;

	if (ext === 'md') {
		type = 'doc';
		const content = fileCache.get(path) ?? '';
		try {
			const parsed = matter(content);
			const headingTitle = extractHeadingTitle(parsed.content);
			if (headingTitle) title = headingTitle;
			if (parsed.data.emoji) emoji = parsed.data.emoji as string;
			if (parsed.data.slides === true) type = 'slide';
			if (typeof parsed.data.description === 'string' && parsed.data.description.trim())
				description = parsed.data.description.trim();
		} catch (err: unknown) {
			console.warn('Failed to parse frontmatter:', err);
		}
	}

	return { path, type, title, emoji, description };
}
