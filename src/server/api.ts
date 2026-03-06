import { join, extname } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { createTwoFilesPatch } from 'diff';
import matter from 'gray-matter';
import type { Config } from './config';
import type { User } from '../lib/types';
import {
	getFile,
	buildFileTree,
	parseFileEntry,
	writeFileToRepo,
	deleteFileFromRepo,
	addToCache,
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
		} catch (err: unknown) {
			console.warn('Failed to parse frontmatter:', err);
		}
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
/**
 * Update YAML frontmatter `title` field, or prepend a frontmatter block if none exists.
 */
function upsertFrontmatterTitle(content: string, title: string): string {
	const escaped = title.replace(/"/g, '\\"');
	const fmRe = /^---\r?\n([\s\S]*?)\n---\r?\n?/;
	const match = fmRe.exec(content);
	if (match?.[1] !== undefined) {
		const body = match[1];
		const fm = /^title:/m.test(body)
			? body.replace(/^title:.*$/m, `title: "${escaped}"`)
			: `title: "${escaped}"\n${body}`;
		return content.replace(match[0], `---\n${fm}\n---\n`);
	}
	return `---\ntitle: "${escaped}"\n---\n${content}`;
}

export async function apiFileRename(req: Request, user: User, config: Config) {
	if (!user.canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 });

	let body: { from?: string; to?: string; title?: string };
	try {
		body = (await req.json()) as { from?: string; to?: string; title?: string };
	} catch {
		return Response.json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { from, to, title } = body;
	if (!from || !to) return Response.json({ error: 'from and to required' }, { status: 400 });

	let content = getFile(from) ?? '';
	if (title) content = upsertFrontmatterTitle(content, title);

	const pathChanged = to !== from;

	if (pathChanged) {
		// Write new path + delete old from disk, then git move
		await writeFileToRepo(to, content, config);
		await deleteFileFromRepo(from, config);
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
	} else {
		// Title-only change: overwrite in place
		await writeFileToRepo(from, content, config);
		updateInIndex(from);

		const msg = `docs: update title of ${from} by ${user.displayName}`;
		const result = await gitStageAndCommit(
			config,
			[from],
			msg,
			user.displayName,
			user.email || 'kumidocs@localhost',
		);

		broadcastPageChanged(from, result.sha, user.id, user.displayName);
		return Response.json({ sha: result.sha, from, to });
	}
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

// GET /api/file/history?path=<path>
export async function apiFileHistory(url: URL, config: Config) {
	const path = decodeURIComponent(url.searchParams.get('path') ?? '');
	if (!path) return Response.json({ error: 'path required' }, { status: 400 });
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
			return { ...c, added, removed };
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
