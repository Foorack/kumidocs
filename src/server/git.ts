import {
  getHeadShaNative,
  gitBlobAtNative,
  gitFetchAndRebaseNative,
  gitFileLogNative,
  gitFileLogNativeWithStats,
  gitMoveAndCommitNative,
  gitPullNative,
  gitRemoveAndCommitNative,
  gitStageAndCommitNative,
} from "./git-cmd";
import type { CommitEntry } from "@/lib/types";
import type { Config } from "./config";

// Serial queue
// All operations that touch .git/index or the working tree run through this
// queue so concurrent HTTP saves and the background pull loop never race.
let gitTail: Promise<void> = Promise.resolve();
async function withGitLock<TResult>(fn: () => Promise<TResult>): Promise<TResult> {
  const prev = gitTail;
  let fnResult!: Promise<TResult>;
  const mySlot = (async (): Promise<void> => {
    try {
      await prev;
    } catch {
      /* previous error must not block the queue */
    }
    fnResult = fn();
    try {
      await fnResult;
    } catch {
      /* caller receives the error via fnResult */
    }
  })();
  gitTail = mySlot;
  await mySlot;
  return fnResult;
}

// HEAD SHA cache
// Avoids spawning `git rev-parse --short HEAD` on every page view.
// Invalidated after any write operation (commit, rebase, pull, etc.)
// so the next read picks up the new value. Reads are lock-free since
// rev-parse is read-only and concurrent writes always invalidate first.
let cachedHeadSha: string | undefined;
let headShaPromise: Promise<string> | undefined;

function invalidateHeadShaCache(): void {
  cachedHeadSha = undefined;
  headShaPromise = undefined;
}

async function getHeadSha(config: Config): Promise<string> {
  if (cachedHeadSha !== undefined) {
    return cachedHeadSha;
  }
  if (headShaPromise !== undefined) {
    return headShaPromise;
  }
  headShaPromise = (async (): Promise<string> => {
    try {
      const sha = await getHeadShaNative(config);
      cachedHeadSha = sha;
      return sha;
    } finally {
      headShaPromise = undefined;
    }
  })();
  return headShaPromise;
}

async function gitPull(config: Config): Promise<void> {
  invalidateHeadShaCache();
  return withGitLock(async () => gitPullNative(config)).finally(() => {
    invalidateHeadShaCache();
  });
}

async function gitStageAndCommit(
  config: Config,
  filePaths: string[],
  message: string,
  authorName: string,
  authorEmail: string,
): Promise<{ sha: string; error?: string; committed?: boolean }> {
  invalidateHeadShaCache();
  return withGitLock(async () =>
    gitStageAndCommitNative(config, filePaths, message, authorName, authorEmail),
  ).finally(() => {
    invalidateHeadShaCache();
  });
}

async function gitRemoveAndCommit(
  config: Config,
  filePath: string,
  message: string,
  authorName: string,
  authorEmail: string,
): Promise<{ sha: string; error?: string }> {
  invalidateHeadShaCache();
  return withGitLock(async () =>
    gitRemoveAndCommitNative(config, filePath, message, authorName, authorEmail),
  ).finally(() => {
    invalidateHeadShaCache();
  });
}

async function gitMoveAndCommit(
  config: Config,
  from: string,
  to: string,
  message: string,
  authorName: string,
  authorEmail: string,
  extraMoves?: { from: string; to: string }[],
): Promise<{ sha: string; error?: string }> {
  invalidateHeadShaCache();
  return withGitLock(async () =>
    gitMoveAndCommitNative(config, from, to, message, authorName, authorEmail, extraMoves),
  ).finally(() => {
    invalidateHeadShaCache();
  });
}

interface FetchResult {
  changed: string[];
  sha: string;
  advanced: boolean;
  pullFailed: boolean;
}

async function gitFetchAndRebase(config: Config): Promise<FetchResult> {
  invalidateHeadShaCache();
  return withGitLock(async () => gitFetchAndRebaseNative(config)).finally(() => {
    invalidateHeadShaCache();
  });
}

/** Return commits that touched `filepath`, most recent first. */
async function gitFileLog(config: Config, filepath: string, limit = 50): Promise<CommitEntry[]> {
  return gitFileLogNative(config, filepath, limit);
}

/** Read the content of `filepath` at a specific full commit SHA. Returns empty string if not found. */
async function gitBlobAt(config: Config, commitSha: string, filepath: string): Promise<string> {
  return gitBlobAtNative(config, commitSha, filepath);
}

/** Return commits enriched with added/removed line counts via `git log --numstat`. */
async function gitFileLogWithStats(
  config: Config,
  filepath: string,
  limit = 50,
): Promise<CommitEntry[]> {
  return gitFileLogNativeWithStats(config, filepath, limit);
}

export {
  gitPull,
  gitStageAndCommit,
  gitRemoveAndCommit,
  gitMoveAndCommit,
  gitFetchAndRebase,
  getHeadSha,
  invalidateHeadShaCache,
  type CommitEntry,
  type FetchResult,
  gitFileLog,
  gitFileLogWithStats,
  gitBlobAt,
};
