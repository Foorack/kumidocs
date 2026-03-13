import git from 'isomorphic-git';
import { promises as fs } from 'fs';
import type { Config } from './config';

// ── Native git helpers ────────────────────────────────────────────────────────
// Network operations (push, fetch, pull, rebase) use the native `git` binary so
// that all standard authentication methods work out of the box: SSH keys, SSH
// agent, ~/.git-credentials, and credential helpers configured in the repo.

/** Run a native git command in `cwd`. Throws on non-zero exit. */
async function runGit(cwd: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'ignore', stderr: 'pipe' });
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const errText = await new Response(proc.stderr).text();
		throw new Error(`git ${args.join(' ')}: exit ${String(exitCode)}\n${errText.trim()}`);
	}
}

/** Run a native git command and return its stdout. Throws on non-zero exit. */
async function runGitOutput(cwd: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'ignore' });
	const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
	if (exitCode !== 0) throw new Error(`git ${args.join(' ')}: exit ${String(exitCode)}`);
	return stdout;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function gitPull(config: Config): Promise<void> {
	try {
		await runGit(config.repoPath, ['pull', '--rebase']);
		console.log('Git: pulled from remote');
	} catch {
		// Offline, no remote, or rebase conflict on startup — not fatal
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
		await runGit(config.repoPath, ['push']);
	} catch {
		// Push failed (non-fast-forward) — rebase on remote and retry with force-with-lease
		try {
			await runGit(config.repoPath, ['pull', '--rebase']);
			await runGit(config.repoPath, ['push', '--force-with-lease']);
		} catch {
			// Abort any in-progress rebase, then signal a conflict
			await runGit(config.repoPath, ['rebase', '--abort']).catch(() => undefined);
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
		await runGit(config.repoPath, ['pull', '--rebase']);
	} catch {
		// No remote, offline, or un-resolvable rebase conflict — skip this cycle
		await runGit(config.repoPath, ['rebase', '--abort']).catch(() => undefined);
	}

	const after = await git.resolveRef({ fs, dir: config.repoPath, ref: 'HEAD' }).catch(() => '');
	const advanced = before !== after && before !== '';
	const sha = after.slice(0, 7);

	const changed: string[] = [];
	if (advanced) {
		try {
			const stdout = await runGitOutput(config.repoPath, [
				'diff',
				'--name-only',
				before,
				after,
			]);
			changed.push(...stdout.split('\n').filter(Boolean));
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
