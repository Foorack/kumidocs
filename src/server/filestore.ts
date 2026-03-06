import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname, extname, relative } from 'path';
import matter from 'gray-matter';
import type { Config } from './config';
import type { FileEntry, TreeNode } from '../lib/types';

const fileCache = new Map<string, string>(); // relPath -> content

const IGNORED_NAMES = new Set([
	'.git',
	'.kumidocs.json',
	'node_modules',
	'.DS_Store',
	'.env',
	'dist',
]);

const IGNORED_EXT = new Set(['.lock', '.log', '.map']);

const TEXT_EXT = new Set([
	'.md',
	'.txt',
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.py',
	'.go',
	'.rs',
	'.java',
	'.c',
	'.cpp',
	'.h',
	'.hpp',
	'.sh',
	'.bash',
	'.zsh',
	'.fish',
	'.ps1',
	'.yaml',
	'.yml',
	'.toml',
	'.json',
	'.jsonc',
	'.html',
	'.htm',
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.sql',
	'.graphql',
	'.gql',
	'.xml',
	'.svg',
	'.env',
	'.dockerfile',
	'.gitignore',
	'.gitattributes',
	'.editorconfig',
	'.prettierrc',
	'.eslintrc',
	'.tf',
	'.hcl',
	'.Makefile',
	'.rb',
	'.php',
	'.lua',
	'.vim',
	'.el',
	'.r',
	'.R',
	'.jl',
]);

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
				if (TEXT_EXT.has(ext) || ext === '') {
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
	await writeFile(fullPath, content, 'utf-8');
	fileCache.set(path, content);
}

export async function deleteFileFromRepo(path: string, config: Config): Promise<void> {
	const fullPath = join(config.repoPath, path);
	await unlink(fullPath);
	fileCache.delete(path);
}

export async function reloadFile(path: string, config: Config): Promise<void> {
	const fullPath = join(config.repoPath, path);
	try {
		const content = await readFile(fullPath, 'utf-8');
		fileCache.set(path, content);
	} catch {
		fileCache.delete(path);
	}
}

export function addToCache(path: string, content: string): void {
	fileCache.set(path, content);
}

export function removeFromCache(path: string): void {
	fileCache.delete(path);
}

export function moveInCache(from: string, to: string): void {
	const content = fileCache.get(from) ?? '';
	fileCache.set(to, content);
	fileCache.delete(from);
}

// Build file tree for /api/tree
export function buildFileTree(): TreeNode[] {
	const allPaths = getAllPaths();
	// Filter out hidden / internal files
	const visible = allPaths.filter(
		(p) => !p.startsWith('.') && !IGNORED_NAMES.has(p.split('/')[0] ?? ''),
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

	return root;
}

/** Return the text of the first `# Heading` line in a markdown body, or null. */
function extractHeadingTitle(body: string): string | null {
	for (const line of body.split('\n')) {
		if (line.startsWith('# ')) return line.slice(2).trim();
	}
	return null;
}

export function parseFileEntry(path: string): FileEntry {
	const ext = extname(path).toLowerCase();
	const fileName = path.split('/').pop() ?? path;
	const baseName = fileName.replace(/\.md$/, '');
	const titleFromName = baseName.replace(/[-_]/g, ' ');

	let type: FileEntry['type'] = 'other';
	let title = titleFromName;
	let emoji: string | undefined;
	let description: string | undefined;

	if (ext === '.md') {
		type = 'doc';
		const content = fileCache.get(path) ?? '';
		try {
			const parsed = matter(content);
			const headingTitle = extractHeadingTitle(parsed.content);
			if (headingTitle) title = headingTitle;
			if (parsed.data.emoji) emoji = parsed.data.emoji as string;
			if (parsed.data.description) description = parsed.data.description as string;
			if (parsed.data.marp === true) type = 'slide';
		} catch (err: unknown) {
			console.warn('Failed to parse frontmatter:', err);
		}
	} else if (
		[
			'.ts',
			'.tsx',
			'.js',
			'.jsx',
			'.mjs',
			'.py',
			'.go',
			'.rs',
			'.java',
			'.c',
			'.cpp',
			'.sh',
			'.yaml',
			'.yml',
			'.toml',
			'.json',
			'.html',
			'.css',
			'.sql',
			'.rb',
			'.php',
		].includes(ext)
	) {
		type = 'code';
	} else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
		type = 'image';
	}

	return { path, type, title, emoji, description };
}
