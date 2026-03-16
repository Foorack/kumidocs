import { join, extname, dirname, resolve } from 'path';
import { readFile, writeFile, mkdir, rename, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { createTwoFilesPatch } from 'diff';
import type { Config } from './config';
import type { User } from '../lib/types';
import {
	getFile,
	getAllPaths,
	buildFileTree,
	writeFileToRepo,
	deleteFileFromRepo,
	addToCache,
	moveInCache,
} from './filestore';
import {
	getHeadSha,
	gitStageAndCommit,
	gitRemoveAndCommit,
	gitMoveAndCommit,
	gitFileLog,
	gitBlobAt,
} from './git';
import { searchDocs, updateInIndex, removeFromIndex } from './search';
import {
	broadcastPageChanged,
	broadcastPageDeleted,
	broadcastPageCreated,
	getEditorForPage,
} from './websocket';
import { IMAGE_TYPES } from '@/lib/filetypes';
import { getPermissions } from './auth';

/**
 * Returns true if `userPath` resolves to a location inside `repoPath`.
 * Prevents path traversal attacks (e.g. "../../etc/passwd").
 */
function isSafePath(repoPath: string, userPath: string): boolean {
	const safeBase = resolve(repoPath);
	const full = resolve(repoPath, userPath);
	return full === safeBase || full.startsWith(safeBase + '/');
}

// GET /api/me
export function apiMe(user: User, config: Config) {
	return Response.json({
		...user,
		instanceName: config.instanceName,
		autoSaveDelay: config.autoSaveDelay,
		slideThemes: getPermissions().slideThemes ?? {},
	});
}

// GET /api/tree
export function apiTree() {
	return Response.json(buildFileTree());
}

// GET /api/file?path=<path>
export async function apiFileGet(url: URL, config: Config) {
	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });
	if (!isSafePath(config.repoPath, path)) return new Response('Forbidden', { status: 403 });

	const content = getFile(path);
	if (content === undefined) return Response.json({ error: 'Not found' }, { status: 404 });

	const sha = await getHeadSha(config);
	return Response.json({ path, content, sha });
}

// PUT /api/file?path=<path>   body: { content: string }
export async function apiFilePut(url: URL, req: Request, user: User, config: Config) {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });
	if (!isSafePath(config.repoPath, path)) return new Response('Forbidden', { status: 403 });

	// Enforce the WebSocket edit lock: reject writes from users who don't hold it
	// if another active session is currently editing this page.
	const lockHolder = getEditorForPage(path);
	if (lockHolder && lockHolder.id !== user.id) {
		return Response.json(
			{ error: 'Page is locked by another editor', editedBy: lockHolder.displayName },
			{ status: 423 }, // 423 Locked
		);
	}

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

	// Only broadcast if a new commit was actually made — skip no-op saves
	if (result.committed !== false) {
		broadcastPageChanged(path, result.sha, user.id, user.displayName);
	}

	if (result.error === 'push_failed') {
		// Commit is local — content is safe, but could not sync to remote.
		// Return 200 so the client marks the page as saved.
		return Response.json({ sha: result.sha, pushWarning: true });
	}
	return Response.json({ sha: result.sha });
}

// POST /api/file   body: { path: string, content: string }
export async function apiFileCreate(req: Request, user: User, config: Config) {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	let body: { path?: string; content?: string };
	try {
		body = (await req.json()) as {
			path?: string;
			content?: string;
		};
	} catch {
		return Response.json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const path = body.path ?? '';
	const content = body.content ?? '';
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });
	if (!isSafePath(config.repoPath, path)) return new Response('Forbidden', { status: 403 });
	if (getFile(path) !== undefined)
		return Response.json({ error: 'File already exists' }, { status: 409 });

	await writeFileToRepo(path, content, config);
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
	if (!isSafePath(config.repoPath, path)) return new Response('Forbidden', { status: 403 });
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
	if (!isSafePath(config.repoPath, from) || !isSafePath(config.repoPath, to))
		return new Response('Forbidden', { status: 403 });
	if (from === to) return Response.json({ sha: null, from, to });

	// Collect all files that must move: the page itself plus any sub-pages living
	// under the matching directory (e.g. "docs.md" → also move all "docs/*").
	const fromDir = from.replace(/\.md$/i, '') + '/';
	const toDir = to.replace(/\.md$/i, '') + '/';
	const allPaths = getAllPaths();
	const subFiles = allPaths.filter((p) => p.startsWith(fromDir));

	// Build the full list of (abs-from, abs-to) pairs for all fs.rename calls.
	const renameOps = [
		{ relFrom: from, relTo: to },
		...subFiles.map((s) => ({ relFrom: s, relTo: toDir + s.slice(fromDir.length) })),
	];

	// Perform all renames; roll back completed ones if any step fails.
	const completed: { relFrom: string; relTo: string }[] = [];
	try {
		for (const op of renameOps) {
			await mkdir(dirname(join(config.repoPath, op.relTo)), { recursive: true });
			await rename(join(config.repoPath, op.relFrom), join(config.repoPath, op.relTo));
			completed.push(op);
		}
	} catch (err: unknown) {
		// Roll back in reverse order
		for (const op of completed.reverse()) {
			await rename(join(config.repoPath, op.relTo), join(config.repoPath, op.relFrom)).catch(
				() => undefined,
			);
		}
		console.error('apiFileRename: fs.rename failed, rolled back:', err);
		return Response.json({ error: 'Failed to rename files' }, { status: 500 });
	}

	// All fs operations succeeded — update in-memory state
	for (const op of renameOps) {
		moveInCache(op.relFrom, op.relTo);
		removeFromIndex(op.relFrom);
		updateInIndex(op.relTo);
	}

	const movedPaths = renameOps.map((o) => o.relFrom);
	const newPaths = renameOps.map((o) => o.relTo);

	const msg = `docs: rename ${from} → ${to} by ${user.displayName}`;
	const extraMoves = subFiles.map((s) => ({ from: s, to: toDir + s.slice(fromDir.length) }));
	await gitMoveAndCommit(
		config,
		from,
		to,
		msg,
		user.displayName,
		user.email || 'kumidocs@localhost',
		extraMoves,
	);

	for (const old of movedPaths) broadcastPageDeleted(old);
	for (const n of newPaths) broadcastPageCreated(n, n);
	return Response.json({ sha: null, from, to });
}

// GET /api/search?q=<query>
export function apiSearch(url: URL) {
	const q = url.searchParams.get('q') ?? '';
	return Response.json(searchDocs(q));
}

// GET /api/avatar/:hash — proxies Gravatar so the client never contacts Gravatar directly.
// The hash must be a 64-char lowercase hex string (SHA-256).
export async function apiAvatarProxy(hash: string): Promise<Response> {
	if (!/^[0-9a-f]{64}$/.test(hash)) {
		return new Response('Invalid hash', { status: 400 });
	}
	const upstream = await fetch(`https://gravatar.com/avatar/${hash}?s=80&d=404`);
	if (!upstream.ok) {
		return new Response(null, { status: 404 });
	}
	const body = await upstream.arrayBuffer();
	return new Response(body, {
		headers: {
			'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
			'Cache-Control': 'public, max-age=3600',
		},
	});
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
	if (!IMAGE_TYPES.has(ext))
		return Response.json({ error: 'File type not allowed' }, { status: 415 });

	const bytes = await file.arrayBuffer();
	const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
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

	return Response.json({ path: repoPath, url: `/images/${filename}` });
}

// GET /api/images
export async function apiImagesList(config: Config): Promise<Response> {
	const all = getAllPaths();
	const imagePaths = all.filter((p) => p.startsWith('images/'));
	const mdPaths = all.filter((p) => p.endsWith('.md'));

	const results = await Promise.all(
		imagePaths.map(async (repoPath) => {
			const filename = repoPath.slice('images/'.length);
			// The sha256 portion is the part before the extension
			const dotIdx = filename.lastIndexOf('.');
			const sha256 = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;

			let size = 0;
			try {
				const s = await stat(join(config.repoPath, repoPath));
				size = s.size;
			} catch {
				// file may be transiently unavailable
			}

			const usedIn = mdPaths.filter((mdPath) => {
				const content = getFile(mdPath) ?? '';
				return content.includes(sha256);
			});

			return { filename, path: repoPath, url: `/images/${filename}`, size, usedIn };
		}),
	);

	return Response.json(results);
}

// DELETE /api/images/:filename
export async function apiImageDelete(
	filename: string,
	user: User,
	config: Config,
): Promise<Response> {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	// Validate: only alphanumeric/hyphen SHA256 hex + extension, no path traversal
	if (!/^[0-9a-f]+\.[a-z0-9]+$/.test(filename)) {
		return Response.json({ error: 'Invalid filename' }, { status: 400 });
	}

	const repoPath = `images/${filename}`;
	const dotIdx = filename.lastIndexOf('.');
	const sha256 = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;

	const all = getAllPaths();
	if (!all.includes(repoPath)) {
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	// Block deletion if any .md file references this image by its sha256 hash
	const mdPaths = all.filter((p) => p.endsWith('.md'));
	const usedIn = mdPaths.filter((mdPath) => {
		const content = getFile(mdPath) ?? '';
		return content.includes(sha256);
	});
	if (usedIn.length > 0) {
		return Response.json({ error: 'Image is referenced by pages', usedIn }, { status: 409 });
	}

	await deleteFileFromRepo(repoPath, config);

	const msg = `docs: delete image ${filename} by ${user.displayName}`;
	await gitRemoveAndCommit(
		config,
		repoPath,
		msg,
		user.displayName,
		user.email || 'kumidocs@localhost',
	);

	return Response.json({ ok: true });
}

// GET /api/file/history?path=<path>
export async function apiFileHistory(url: URL, config: Config) {
	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });
	if (!isSafePath(config.repoPath, path)) return new Response('Forbidden', { status: 403 });
	const commits = await gitFileLog(config, path);
	const enriched = await Promise.all(
		commits.map(async (c, idx) => {
			const parentCommit = commits[idx + 1];
			const [after, before] = await Promise.all([
				gitBlobAt(config, c.fullSha, path),
				parentCommit ? gitBlobAt(config, parentCommit.fullSha, path) : Promise.resolve(''),
			]);
			const patch = createTwoFilesPatch('', '', before, after, '', '', { context: 0 });
			let added = 0;
			let removed = 0;
			for (const line of patch.split('\n')) {
				if (line.startsWith('+') && !line.startsWith('+++')) added++;
				else if (line.startsWith('-') && !line.startsWith('---')) removed++;
			}
			return {
				...c,
				added,
				removed,
				authorEmail: c.author,
			};
		}),
	);
	return Response.json(enriched);
}

// GET /api/file/diff?path=<path>&sha=<sha>
export async function apiFileDiff(url: URL, config: Config) {
	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	const shortSha = url.searchParams.get('sha') ?? '';
	if (!path || !shortSha)
		return Response.json({ error: 'path and sha required' }, { status: 400 });
	if (!isSafePath(config.repoPath, path)) return new Response('Forbidden', { status: 403 });

	const commits = await gitFileLog(config, path, 500);
	const idx = commits.findIndex((c) => c.fullSha.startsWith(shortSha) || c.sha === shortSha);
	if (idx === -1)
		return Response.json({ error: 'Commit not found in file history' }, { status: 404 });

	const commit = commits[idx];
	if (!commit) return Response.json({ error: 'Internal error' }, { status: 500 });
	const parentCommit = commits[idx + 1];

	const after = await gitBlobAt(config, commit.fullSha, path);
	const before = parentCommit ? await gitBlobAt(config, parentCommit.fullSha, path) : '';

	// Generate unified diff string in git format for react-diff-view's parseDiff
	const rawPatch = createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after, '', '', {
		context: 4,
	});
	// createTwoFilesPatch emits "Index: ...\n===...\n--- ...\n+++ ...\n@@ ..." which confuses
	// parseDiff's path extractor. Re-assemble as a proper "diff --git" block instead.
	const hunkStart = rawPatch.indexOf('\n@@');
	const unifiedDiff =
		hunkStart >= 0
			? `diff --git a/${path} b/${path}\nindex 0000000..0000000 100644\n--- a/${path}\n+++ b/${path}\n${rawPatch.slice(hunkStart + 1)}`
			: '';

	return Response.json({
		sha: commit.sha,
		message: commit.message,
		author: commit.author,
		date: commit.date,
		unifiedDiff,
	});
}

// GET /images/:filename
export async function serveRepoAsset(assetPath: string, config: Config): Promise<Response> {
	if (!isSafePath(config.repoPath, assetPath)) return new Response('Forbidden', { status: 403 });

	const fullPath = resolve(config.repoPath, assetPath);
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
		const data = await readFile(fullPath);
		return new Response(data, {
			headers: {
				'Content-Type': mime,
				'Cache-Control': 'public, max-age=31536000, immutable',
			},
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
}
