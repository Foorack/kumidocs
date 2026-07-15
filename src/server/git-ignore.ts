import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";
import ignore from "ignore";
import path from "node:path";

const execFileAsync = promisify(execFile);

/** Returns true if the repo-relative path should be excluded from watching/indexing. */
type IgnoreChecker = (relPath: string) => boolean;

async function loadGlobalGitignore(): Promise<string | undefined> {
  // Ask git for the configured global excludes file
  try {
    const { stdout } = await execFileAsync("git", ["config", "--global", "core.excludesFile"], {
      encoding: "utf8",
    });
    const configPath = stdout.trim();
    // Expand ~ manually since execFile doesn't run through a shell
    const expanded = configPath.startsWith("~/")
      ? path.join(homedir(), configPath.slice(2))
      : configPath;
    if (expanded) {
      try {
        await access(expanded);
        return await readFile(expanded, "utf8");
      } catch {
        // not readable; fall through
      }
    }
  } catch {
    // git not on PATH or config query failed; fall through to candidates
  }

  // Common fallback locations -- sequential is intentional (first-found-wins).
  // oxlint-disable no-await-in-loop
  for (const candidate of [
    path.join(homedir(), ".config/git/ignore"),
    path.join(homedir(), ".gitignore"),
    path.join(homedir(), ".gitignore_global"),
  ]) {
    try {
      await access(candidate);
      return await readFile(candidate, "utf8");
    } catch {
      // unreadable; skip
    }
  }
  // oxlint-enable no-await-in-loop

  return undefined;
}

/**
 * Build an IgnoreChecker from the global gitignore and the repo's .gitignore.
 * The returned function returns true for paths that should be excluded.
 */
async function buildIgnoreChecker(repoPath: string): Promise<IgnoreChecker> {
  const ig = ignore();

  const globalContent = await loadGlobalGitignore();
  if (globalContent !== undefined && globalContent !== "") {
    ig.add(globalContent);
  }

  const repoGitignorePath = path.join(repoPath, ".gitignore");
  try {
    await access(repoGitignorePath);
    ig.add(await readFile(repoGitignorePath, "utf8"));
  } catch {
    // not readable or missing; skip
  }

  return (relPath: string): boolean => {
    if (!relPath || relPath === ".") {
      return false;
    }
    try {
      return ig.ignores(relPath.replaceAll("\\", "/"));
    } catch {
      return false;
    }
  };
}

export type { IgnoreChecker };
export { buildIgnoreChecker };
