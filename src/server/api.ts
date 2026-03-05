import { join, extname } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import matter from 'gray-matter';
import type { Config } from './config';
import type { User } from '../lib/types';
import {
	getFile,
	buildFileTree,
	parseFileEntry,
	writeFileToRepo,
	deleteFileFromRepo,
	moveInCache,
	addToCache,
} from './filestore';
import { getHeadSha, gitStageAndCommit, gitRemoveAndCommit, gitMoveAndCommit } from './git';
import { searchDocs, updateInIndex, removeFromIndex } from './search';
import { broadcastPageChanged, broadcastPageDeleted, broadcastPageCreated } from './websocket';

// GET /api/me
export function apiMe(user: User, config: Config) {
	return Response.json({ ...user, instanceName: config.instanceName });
}

// GET /api/tree
export function apiTree() {
	return Response.json(buildFileTree());
}

// GET /api/file?path=<path>
export async function apiFileGet(url: URL, config: Config) {
	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });

	const content = getFile(path);
	if (content === undefined) return Response.json({ error: 'Not found' }, { status: 404 });

	const entry = parseFileEntry(path);
	let frontmatter: Record<string, unknown> = {};
	let body = content;
	if (path.endsWith('.md')) {
		try {
			const parsed = matter(content);
			frontmatter = parsed.data as Record<string, unknown>;
			body = parsed.content;
		} catch {}
	}

	const sha = await getHeadSha(config);
	return Response.json({ path, content, body, frontmatter, entry, sha });
}

// PUT /api/file?path=<path>   body: { content: string }
export async function apiFilePut(url: URL, req: Request, user: User, config: Config) {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });

	let body: { content?: string };
	try {
		body = (await req.json()) as { content?: string };
	} catch {
		return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const content = body.content ?? '';
	await writeFileToRepo(path, content, config);
	updateInIndex(path);

	const msg = `docs(${path}): save by ${user.displayName}`;
	const result = await gitStageAndCommit(
		config,
		[path],
		msg,
		user.displayName,
		user.email || 'kumidocs@localhost',
	);

	if (result.error === 'conflict') {
		return Response.json(
			{
				sha: result.sha,
				warning: 'Remote conflict — changes reverted by remote.',
			},
			{ status: 409 },
		);
	}

	broadcastPageChanged(path, result.sha, user.id, user.displayName);
	return Response.json({ sha: result.sha });
}

// POST /api/file   body: { path: string, content: string, title?: string }
export async function apiFileCreate(req: Request, user: User, config: Config) {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	let body: { path?: string; content?: string; title?: string };
	try {
		body = (await req.json()) as {
			path?: string;
			content?: string;
			title?: string;
		};
	} catch {
		return Response.json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const path = body.path ?? '';
	const content = body.content ?? '';
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });
	if (getFile(path) !== undefined)
		return Response.json({ error: 'File already exists' }, { status: 409 });

	await writeFileToRepo(path, content, config);
	addToCache(path, content);
	updateInIndex(path);

	const msg = `docs(${path}): create by ${user.displayName}`;
	const result = await gitStageAndCommit(
		config,
		[path],
		msg,
		user.displayName,
		user.email || 'kumidocs@localhost',
	);

	broadcastPageCreated(path, path);
	return Response.json({ sha: result.sha, path });
}

// DELETE /api/file?path=<path>
export async function apiFileDelete(url: URL, user: User, config: Config) {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });
	if (getFile(path) === undefined) return Response.json({ error: 'Not found' }, { status: 404 });

	await deleteFileFromRepo(path, config);
	removeFromIndex(path);

	const msg = `docs(${path}): delete by ${user.displayName}`;
	const result = await gitRemoveAndCommit(
		config,
		path,
		msg,
		user.displayName,
		user.email || 'kumidocs@localhost',
	);

	broadcastPageDeleted(path);
	return Response.json({ sha: result.sha });
}

// POST /api/file/rename   body: { from: string, to: string }
export async function apiFileRename(req: Request, user: User, config: Config) {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	let body: { from?: string; to?: string };
	try {
		body = (await req.json()) as { from?: string; to?: string };
	} catch {
		return Response.json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { from, to } = body;
	if (!from || !to) return Response.json({ error: 'from and to required' }, { status: 400 });

	moveInCache(from, to);
	removeFromIndex(from);
	updateInIndex(to);

	const msg = `docs: rename ${from} → ${to} by ${user.displayName}`;
	const result = await gitMoveAndCommit(
		config,
		from,
		to,
		msg,
		user.displayName,
		user.email || 'kumidocs@localhost',
	);

	broadcastPageDeleted(from);
	broadcastPageCreated(to, to);
	return Response.json({ sha: result.sha, from, to });
}

// GET /api/search?q=<query>
export function apiSearch(url: URL) {
	const q = url.searchParams.get('q') ?? '';
	return Response.json(searchDocs(q));
}

// GET /api/sidebar
export function apiSidebar() {
	const content = getFile('_sidebar.md') ?? '';
	return Response.json({ content });
}

// POST /api/upload/image
export async function apiUploadImage(req: Request, user: User, config: Config): Promise<Response> {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	const MAX = 25 * 1024 * 1024;
	const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

	let formData: FormData;
	try {
		formData = await req.formData();
	} catch {
		return Response.json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file') as File | null;
	if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
	if (file.size > MAX)
		return Response.json({ error: 'File too large (max 25 MB)' }, { status: 413 });

	const ext = extname(file.name).toLowerCase();
	if (!ALLOWED.has(ext))
		return Response.json({ error: 'File type not allowed' }, { status: 415 });

	const bytes = await file.arrayBuffer();
	const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex').slice(0, 16);
	const filename = `${sha256}${ext}`;
	const repoPath = `images/${filename}`;
	const fullPath = join(config.repoPath, repoPath);

	await mkdir(join(config.repoPath, 'images'), { recursive: true });
	await writeFile(fullPath, Buffer.from(bytes));
	addToCache(repoPath, '');

	const msg = `docs: upload image ${filename} by ${user.displayName}`;
	await gitStageAndCommit(
		config,
		[repoPath],
		msg,
		user.displayName,
		user.email || 'kumidocs@localhost',
	);

	return Response.json({ path: repoPath, url: `/repo-asset/${repoPath}` });
}

// GET /repo-asset/<path>
export async function serveRepoAsset(assetPath: string, config: Config): Promise<Response> {
	const MIME: Record<string, string> = {
		'.png': 'image/png',
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.gif': 'image/gif',
		'.webp': 'image/webp',
		'.svg': 'image/svg+xml',
		'.pdf': 'application/pdf',
	};
	const ext = extname(assetPath).toLowerCase();
	const mime = MIME[ext] ?? 'application/octet-stream';

	try {
		const data = await readFile(join(config.repoPath, assetPath));
		return new Response(data, {
			headers: {
				'Content-Type': mime,
				'Cache-Control': 'public, max-age=86400',
			},
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
}
