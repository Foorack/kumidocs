import git from 'isomorphic-git';
import { promises as fs } from 'fs';
import http from 'isomorphic-git/http/node';
import type { Config } from './config';

export async function gitPull(config: Config): Promise<void> {
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

export async function gitStageAndCommit(
	config: Config,
	filePaths: string[],
	message: string,
	authorName: string,
	authorEmail: string,
): Promise<{ sha: string; error?: string; committed?: boolean }> {
	try {
		// Stage files
		for (const fp of filePaths) {
			await git.add({ fs, dir: config.repoPath, filepath: fp });
		}

		// Check if there are changes to commit
		const status = await git.statusMatrix({ fs, dir: config.repoPath });
		const hasChanges = status.some(
			([, head, workdir, stage]: [string, number, number, number]) =>
				head !== workdir || head !== stage || workdir !== stage,
		);
		if (!hasChanges) {
			const sha = await git.resolveRef({
				fs,
				dir: config.repoPath,
				ref: 'HEAD',
			});
			return { sha: sha.slice(0, 7), committed: false };
		}

		// Commit
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
			const sha = await git.resolveRef({
				fs,
				dir: config.repoPath,
				ref: 'HEAD',
			});
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
		await git.push({
			fs,
			http,
			dir: config.repoPath,
			remote: 'origin',
		});
	} catch {
		// Push failed — try to fetch and merge
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
				theirs: 'origin/HEAD',
				author: { name: 'KumiDocs', email: 'kumidocs@localhost' },
			});
			await git.push({
				fs,
				http,
				dir: config.repoPath,
				remote: 'origin',
				force: true,
			});
		} catch {
			return { sha: commitSha.slice(0, 7), error: 'conflict' };
		}
	}

	return { sha: commitSha.slice(0, 7) };
}

export async function gitRemoveAndCommit(
	config: Config,
	filePath: string,
	message: string,
	authorName: string,
	authorEmail: string,
): Promise<{ sha: string; error?: string }> {
	await git.remove({ fs, dir: config.repoPath, filepath: filePath });
	return gitStageAndCommit(config, [], message, authorName, authorEmail);
}

export async function gitMoveAndCommit(
	config: Config,
	from: string,
	to: string,
	message: string,
	authorName: string,
	authorEmail: string,
	extraMoves?: { from: string; to: string }[],
): Promise<{ sha: string; error?: string }> {
	// isomorphic-git doesn't have a native move, so we:
	// 1. Add the new file 2. Remove the old file
	await git.add({ fs, dir: config.repoPath, filepath: to });
	await git.remove({ fs, dir: config.repoPath, filepath: from });
	// Stage any additional moved files (e.g. sub-pages)
	for (const extra of extraMoves ?? []) {
		await git.add({ fs, dir: config.repoPath, filepath: extra.to });
		await git.remove({ fs, dir: config.repoPath, filepath: extra.from });
	}
	return gitStageAndCommit(config, [], message, authorName, authorEmail);
}

export async function gitFetchAndRebase(
	config: Config,
): Promise<{ changed: string[]; sha: string; advanced: boolean }> {
	const before = await git.resolveRef({ fs, dir: config.repoPath, ref: 'HEAD' }).catch(() => '');

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
			theirs: 'origin/HEAD',
			author: { name: 'KumiDocs', email: 'kumidocs@localhost' },
		});
	} catch {
		// Merge conflict — skip for now
	}

	const after = await git.resolveRef({ fs, dir: config.repoPath, ref: 'HEAD' }).catch(() => '');
	const advanced = before !== after && before !== '';
	const sha = after.slice(0, 7);

	const changed: string[] = [];
	if (advanced) {
		try {
			await git.log({
				fs,
				dir: config.repoPath,
				ref: 'HEAD',
				depth: 100,
			});
			// Get changed files from recent commits
			// This is a simplified approach - for now, mark as advanced but don't enumerate files
		} catch (err: unknown) {
			console.warn('Failed to get git log:', err);
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

/** Return full SHA for a short or full sha. */
export async function gitExpandSha(config: Config, short: string): Promise<string> {
	// git.log depth search
	const commits = await git.log({ fs, dir: config.repoPath, depth: 500 });
	const found = commits.find((c) => c.oid.startsWith(short));
	return found?.oid ?? short;
}
