import git, { TREE } from 'isomorphic-git';
import { promises as fs } from 'fs';
import http from 'isomorphic-git/http/node';
import type { Config } from './config';

// ── Serial queue ──────────────────────────────────────────────────────────────
// All operations that touch the .git/index or working tree run through this
// queue so concurrent HTTP saves and the background pull loop never race.
let gitTail = Promise.resolve<unknown>(undefined);
function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
	const result = gitTail.then(fn);
	// Swallow errors on the tail so one failed op doesn't stall the queue.
	gitTail = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

export function gitPull(config: Config): Promise<void> {
	return withGitLock(() => _gitPull(config));
}

async function _gitPull(config: Config): Promise<void> {
	try {
		await git.pull({
			fs,
			http,
			dir: config.repoPath,
			author: { name: 'KumiDocs', email: 'kumidocs@localhost' },
			singleBranch: true,
			fastForward: true,
		});
		console.log('Git: pulled from remote');
	} catch {
		// Offline or no remote configured — not fatal
	}
}

export function gitStageAndCommit(
	config: Config,
	filePaths: string[],
	message: string,
	authorName: string,
	authorEmail: string,
): Promise<{ sha: string; error?: string; committed?: boolean }> {
	return withGitLock(() => _stageAndCommit(config, filePaths, message, authorName, authorEmail));
}

async function _stageAndCommit(
	config: Config,
	filePaths: string[],
	message: string,
	authorName: string,
	authorEmail: string,
): Promise<{ sha: string; error?: string; committed?: boolean }> {
	try {
		for (const fp of filePaths) {
			await git.add({ fs, dir: config.repoPath, filepath: fp });
		}

		// Scope the status check to the paths we staged so we don't accidentally
		// commit unrelated workdir noise or pick up changes staged concurrently.
		// When filePaths is empty (remove/move callers pre-stage externally) we
		// fall back to the full scan — the lock guarantees exclusivity in that case.
		const statusOpts = filePaths.length > 0 ? { filepaths: filePaths } : {};
		const status = await git.statusMatrix({ fs, dir: config.repoPath, ...statusOpts });
		// stage=1 means index equals HEAD (nothing staged for this file)
		const hasChanges = status.some(
			([, , , stage]: [string, number, number, number]) => stage !== 1,
		);
		if (!hasChanges) {
			const sha = await git.resolveRef({ fs, dir: config.repoPath, ref: 'HEAD' });
			return { sha: sha.slice(0, 7), committed: false };
		}

		const sha = await git.commit({
			fs,
			dir: config.repoPath,
			message,
			author: { name: authorName, email: authorEmail },
		});

		const result = await pushWithRetry(config, sha);
		return { ...result, committed: true };
	} catch (err) {
		try {
			const sha = await git.resolveRef({ fs, dir: config.repoPath, ref: 'HEAD' });
			return { sha: sha.slice(0, 7), error: String(err) };
		} catch {
			return { sha: 'unknown', error: String(err) };
		}
	}
}

async function pushWithRetry(
	config: Config,
	commitSha: string,
): Promise<{ sha: string; error?: string }> {
	try {
		await git.push({ fs, http, dir: config.repoPath, remote: 'origin' });
	} catch {
		// Push failed (non-fast-forward) — fetch + merge remote changes, then retry.
		// isomorphic-git does not support rebase, so we merge instead.
		try {
			await git.fetch({
				fs,
				http,
				dir: config.repoPath,
				remote: 'origin',
				singleBranch: true,
			});
			await git.merge({
				fs,
				dir: config.repoPath,
				ours: 'HEAD',
				theirs: 'FETCH_HEAD',
				author: { name: 'KumiDocs', email: 'kumidocs@localhost' },
			});
			await git.push({ fs, http, dir: config.repoPath, remote: 'origin' });
		} catch {
			// The commit is still present locally — the content is safe.
			// 'push_failed' signals a remote-sync problem, not data loss.
			return { sha: commitSha.slice(0, 7), error: 'push_failed' };
		}
	}
	return { sha: commitSha.slice(0, 7) };
}

export function gitRemoveAndCommit(
	config: Config,
	filePath: string,
	message: string,
	authorName: string,
	authorEmail: string,
): Promise<{ sha: string; error?: string }> {
	return withGitLock(async () => {
		await git.remove({ fs, dir: config.repoPath, filepath: filePath });
		return _stageAndCommit(config, [], message, authorName, authorEmail);
	});
}

export function gitMoveAndCommit(
	config: Config,
	from: string,
	to: string,
	message: string,
	authorName: string,
	authorEmail: string,
	extraMoves?: { from: string; to: string }[],
): Promise<{ sha: string; error?: string }> {
	return withGitLock(async () => {
		// isomorphic-git has no native move: add the new path, remove the old one.
		await git.add({ fs, dir: config.repoPath, filepath: to });
		await git.remove({ fs, dir: config.repoPath, filepath: from });
		for (const extra of extraMoves ?? []) {
			await git.add({ fs, dir: config.repoPath, filepath: extra.to });
			await git.remove({ fs, dir: config.repoPath, filepath: extra.from });
		}
		return _stageAndCommit(config, [], message, authorName, authorEmail);
	});
}

export function gitFetchAndRebase(
	config: Config,
): Promise<{ changed: string[]; sha: string; advanced: boolean }> {
	return withGitLock(() => _fetchAndRebase(config));
}

async function _fetchAndRebase(
	config: Config,
): Promise<{ changed: string[]; sha: string; advanced: boolean }> {
	const before = await git.resolveRef({ fs, dir: config.repoPath, ref: 'HEAD' }).catch(() => '');

	try {
		await git.fetch({ fs, http, dir: config.repoPath, remote: 'origin', singleBranch: true });
		await git.merge({
			fs,
			dir: config.repoPath,
			ours: 'HEAD',
			theirs: 'FETCH_HEAD',
			author: { name: 'KumiDocs', email: 'kumidocs@localhost' },
		});
	} catch {
		// No remote, offline, or merge conflict — skip this cycle
	}

	const after = await git.resolveRef({ fs, dir: config.repoPath, ref: 'HEAD' }).catch(() => '');
	const advanced = before !== after && before !== '';
	const sha = after.slice(0, 7);

	const changed: string[] = [];
	if (advanced) {
		try {
			await git.walk({
				fs,
				dir: config.repoPath,
				trees: [TREE({ ref: before }), TREE({ ref: after })],
				map: async (filepath, [A, B]) => {
					if ((await A?.type()) === 'tree' || (await B?.type()) === 'tree') return;
					const aOid = await A?.oid();
					const bOid = await B?.oid();
					if (aOid !== bOid) changed.push(filepath);
				},
			});
		} catch (err: unknown) {
			console.warn('Failed to enumerate changed files after pull:', err);
		}
	}

	return { changed, sha, advanced };
}

export async function getHeadSha(config: Config): Promise<string> {
	try {
		const sha = await git.resolveRef({
			fs,
			dir: config.repoPath,
			ref: 'HEAD',
		});
		return sha.slice(0, 7);
	} catch {
		return 'unknown';
	}
}

export interface CommitEntry {
	sha: string; // short (7-char)
	fullSha: string;
	message: string;
	author: string;
	date: string;
}

/** Return commits that touched `filepath`, most recent first. */
export async function gitFileLog(
	config: Config,
	filepath: string,
	limit = 50,
): Promise<CommitEntry[]> {
	const commits = await git.log({ fs, dir: config.repoPath, filepath, depth: limit });
	return commits.map((c) => ({
		sha: c.oid.slice(0, 7),
		fullSha: c.oid,
		message: c.commit.message.trim(),
		author: c.commit.author.name,
		date: new Date(c.commit.author.timestamp * 1000).toISOString(),
	}));
}

/** Read the content of `filepath` at a specific full commit SHA. Returns empty string if not found. */
export async function gitBlobAt(
	config: Config,
	commitSha: string,
	filepath: string,
): Promise<string> {
	try {
		const { blob } = await git.readBlob({
			fs,
			dir: config.repoPath,
			oid: commitSha,
			filepath,
		});
		return new TextDecoder().decode(blob);
	} catch {
		return '';
	}
}
