import type { FileType } from './types';

export const IMAGE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

export const CODE_TYPES = new Set([
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
	'.tfvars',
	'.hcl',
	'.rb',
	'.php',
	'.lua',
	'.vim',
	'.el',
	'.r',
	'.jl',
	'.scala',
	'.kt',
	'.kts',
	'.dart',
	'.swift',
	'.conf',
	'.ini',
	'.cfg',
]);

/** Extract lowercase extension from a path (e.g. "test.tsx" → "tsx", "README.md" → "md", "nodot" → ""). */
export function pathExtension(path: string): string {
	const dot = path.lastIndexOf('.');
	const slash = path.lastIndexOf('/');
	return dot > slash && dot !== -1 ? path.slice(dot + 1).toLowerCase() : '';
}

/**
 * Map file extension to FileType.
 *
 * Defaults to:
 *   - 'doc' for Markdown files (including extensionless paths, which are treated as Markdown)
 *   - 'code' for known code file extensions
 *   - 'image' for known image file extensions
 *   - 'other' for everything else
 */
export function extensionToType(ext: string): FileType {
	ext = ext.startsWith('.') ? ext : `.${ext}`;
	ext = ext.toLowerCase();
	if (IMAGE_TYPES.has(ext)) return 'image';
	if (CODE_TYPES.has(ext)) return 'code';
	if (ext === '.md' || ext === '') return 'doc';

	return 'other';
}
