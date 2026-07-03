import type { CommitEntry } from "@/lib/types";
import type { Config } from "./config";
import { runtimeEnv, spawnProcess } from "./runtime";

// Subprocess helper

/** Max time (ms) to wait for any git subprocess before killing it.
 * Prevents a hanging git command from stalling the entire serial queue. */
const GIT_TIMEOUT_MS = 60_000;

async function runGit(
  repoPath: string,
  args: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await spawnProcess("git", ["-C", repoPath, ...args], {
    env: { ...runtimeEnv, ...env },
    timeoutMs: GIT_TIMEOUT_MS,
  });

  if (result.exitCode === -1) {
    console.warn(`Git timeout: killing "git ${args.join(" ")}" after ${GIT_TIMEOUT_MS}ms`);
  }

  return result;
}

// Read-only operations (no lock needed)

async function getHeadShaNative(config: Config): Promise<string> {
  const result = await runGit(config.repoPath, ["rev-parse", "--short", "HEAD"]);
  if (result.exitCode !== 0) {
    return "unknown";
  }
  return result.stdout.trim();
}

async function gitFileLogNative(
  config: Config,
  filepath: string,
  limit = 50,
): Promise<CommitEntry[]> {
  const result = await runGit(config.repoPath, [
    "log",
    `-${limit}`,
    "--format=%H%s%an%ae%aI",
    "--",
    filepath,
  ]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => {
      const [fullSha = "", message = "", author = "", authorEmail = "", date = ""] =
        line.split("\u001F");
      return { author, authorEmail, date, fullSha, message, sha: fullSha.slice(0, 7) };
    });
}

/**
 * Like `gitFileLogNative` but uses `--numstat` to get added/removed line
 * counts directly from git, avoiding reading the full blob at every revision.
 */
async function gitFileLogNativeWithStats(
  config: Config,
  filepath: string,
  limit = 50,
): Promise<CommitEntry[]> {
  const result = await runGit(config.repoPath, [
    "log",
    `-${limit}`,
    "--format=%H%s%an%ae%aI",
    "--numstat",
    "--",
    filepath,
  ]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  const entries: CommitEntry[] = [];
  let currentSha = "";
  let currentMsg = "";
  let currentAuthor = "";
  let currentEmail = "";
  let currentDate = "";
  let currentAdded = 0;
  let currentRemoved = 0;

  const flushEntry = (): void => {
    if (!currentSha) {
      return;
    }
    entries.push({
      added: currentAdded || undefined,
      author: currentAuthor,
      authorEmail: currentEmail,
      date: currentDate,
      fullSha: currentSha,
      message: currentMsg,
      removed: currentRemoved || undefined,
      sha: currentSha.slice(0, 7),
    });
    currentAdded = 0;
    currentRemoved = 0;
  };

  for (const line of result.stdout.trim().split("\n")) {
    if (line.includes("\u001F")) {
      // Commit header line; flush previous entry
      flushEntry();
      const [fullSha = "", message = "", author = "", authorEmail = "", date = ""] =
        line.split("\u001F");
      currentSha = fullSha;
      currentMsg = message;
      currentAuthor = author;
      currentEmail = authorEmail;
      currentDate = date;
    } else if (currentSha && /^\d+\t\d+\t/u.test(line)) {
      // Numstat line: <added>\t<removed>\t<path>
      const tabIdx = line.indexOf("\t");
      const rest = line.slice(tabIdx + 1);
      const secondTabIdx = rest.indexOf("\t");
      if (tabIdx !== -1 && secondTabIdx !== -1) {
        currentAdded += Number(line.slice(0, tabIdx));
        currentRemoved += Number(rest.slice(0, secondTabIdx));
      }
    }
  }
  // Flush last entry
  flushEntry();
  return entries;
}

async function gitBlobAtNative(
  config: Config,
  commitSha: string,
  filepath: string,
): Promise<string> {
  const result = await runGit(config.repoPath, ["show", `${commitSha}:${filepath}`]);
  if (result.exitCode !== 0) {
    return "";
  }
  return result.stdout;
}

// Write operations (caller must hold the git lock)

async function gitPullNative(config: Config): Promise<void> {
  const result = await runGit(config.repoPath, ["pull", "--ff-only", "--quiet"]);
  if (result.exitCode === 0) {
    console.log("Git: pulled from remote");
  } else if (result.stderr.trim()) {
    console.warn("Git: pull failed (offline or no remote?):", result.stderr.trim());
  }
}

async function pushWithRetryNative(
  config: Config,
  sha: string,
): Promise<{ sha: string; error?: string }> {
  let push = await runGit(config.repoPath, ["push", "origin"]);
  if (push.exitCode === 0) {
    return { sha };
  }

  // Push failed (non-fast-forward); fetch + rebase, then retry
  await runGit(config.repoPath, ["fetch", "origin"]);
  const rebase = await runGit(config.repoPath, ["rebase", "FETCH_HEAD"]);
  if (rebase.exitCode !== 0) {
    await runGit(config.repoPath, ["rebase", "--abort"]);
    return { error: "push_failed", sha };
  }

  push = await runGit(config.repoPath, ["push", "origin"]);
  if (push.exitCode === 0) {
    return { sha };
  }

  return { error: "push_failed", sha };
}

async function gitStageAndCommitNative(
  config: Config,
  filePaths: string[],
  message: string,
  authorName: string,
  authorEmail: string,
): Promise<{ sha: string; error?: string; committed?: boolean }> {
  try {
    if (filePaths.length > 0) {
      const add = await runGit(config.repoPath, ["add", "--", ...filePaths]);
      if (add.exitCode !== 0) {
        return { error: `git add failed: ${add.stderr}`, sha: await getHeadShaNative(config) };
      }
    }

    // exit 0 = nothing staged, exit 1 = staged changes present
    const status = await runGit(config.repoPath, ["diff", "--cached", "--quiet"]);
    if (status.exitCode === 0) {
      return { committed: false, sha: await getHeadShaNative(config) };
    }

    const env = {
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_AUTHOR_NAME: authorName,
      GIT_COMMITTER_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: authorName,
    };
    const commit = await runGit(config.repoPath, ["commit", "-m", message], env);
    if (commit.exitCode !== 0) {
      return {
        error: `git commit failed: ${commit.stderr}`,
        sha: await getHeadShaNative(config),
      };
    }

    const sha = await getHeadShaNative(config);
    const push = await pushWithRetryNative(config, sha);
    return { ...push, committed: true };
  } catch (error) {
    const sha = await getHeadShaNative(config).catch(() => "unknown");
    return { error: String(error), sha };
  }
}

async function gitRemoveAndCommitNative(
  config: Config,
  filePath: string,
  message: string,
  authorName: string,
  authorEmail: string,
): Promise<{ sha: string; error?: string }> {
  // File is already deleted from disk; remove from index only
  await runGit(config.repoPath, ["rm", "--cached", "--", filePath]);
  return gitStageAndCommitNative(config, [], message, authorName, authorEmail);
}

async function gitMoveAndCommitNative(
  config: Config,
  from: string,
  to: string,
  message: string,
  authorName: string,
  authorEmail: string,
  extraMoves?: { from: string; to: string }[],
): Promise<{ sha: string; error?: string }> {
  // Files are already moved on disk; stage each pair: add new path, rm old from index.
  // Sequential execution is required: git locks .git/index between operations.
  const allMoves = [{ from, to }, ...(extraMoves ?? [])];
  for (const move of allMoves) {
    // oxlint-disable-next-line no-await-in-loop
    await runGit(config.repoPath, ["add", "--", move.to]);
    // oxlint-disable-next-line no-await-in-loop
    await runGit(config.repoPath, ["rm", "--cached", "--", move.from]);
  }
  return gitStageAndCommitNative(config, [], message, authorName, authorEmail);
}

async function gitFetchAndRebaseNative(
  config: Config,
): Promise<{ changed: string[]; sha: string; advanced: boolean; pullFailed: boolean }> {
  const beforeResult = await runGit(config.repoPath, ["rev-parse", "HEAD"]);
  if (beforeResult.exitCode !== 0) {
    return { advanced: false, changed: [], pullFailed: false, sha: "unknown" };
  }
  const before = beforeResult.stdout.trim();

  // Fetch; ignore errors (offline / no remote)
  await runGit(config.repoPath, ["fetch", "origin"]);

  // Only rebase if FETCH_HEAD exists
  const fetchHead = await runGit(config.repoPath, ["rev-parse", "FETCH_HEAD"]);
  if (fetchHead.exitCode === 0) {
    const rebase = await runGit(config.repoPath, ["rebase", "FETCH_HEAD"]);
    if (rebase.exitCode !== 0) {
      console.warn("Git: rebase failed, aborting:", rebase.stderr.trim());
      await runGit(config.repoPath, ["rebase", "--abort"]);
      return { advanced: false, changed: [], pullFailed: true, sha: before.slice(0, 7) };
    }
  }

  const afterResult = await runGit(config.repoPath, ["rev-parse", "HEAD"]);
  const after = afterResult.exitCode === 0 ? afterResult.stdout.trim() : before;

  const advanced = before !== after;
  const sha = after.slice(0, 7);
  const changed: string[] = [];

  if (advanced) {
    const diff = await runGit(config.repoPath, ["diff", "--name-only", before, after]);
    if (diff.exitCode === 0) {
      changed.push(...diff.stdout.trim().split("\n").filter(Boolean));
    }
  }

  return { advanced, changed, pullFailed: false, sha };
}

export {
  getHeadShaNative,
  gitBlobAtNative,
  gitFetchAndRebaseNative,
  gitFileLogNative,
  gitFileLogNativeWithStats,
  gitMoveAndCommitNative,
  gitPullNative,
  gitRemoveAndCommitNative,
  gitStageAndCommitNative,
};
