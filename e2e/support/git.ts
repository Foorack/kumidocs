/**
 * Read-only views of the fixture's bare remote. Specs use these to check
 * that a UI action really committed and pushed, not just updated the page.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REMOTE_DIR } from "./env";

const run = promisify(execFile);

const git = async (...args: string[]): Promise<string> => {
  const { stdout } = await run("git", ["--git-dir", REMOTE_DIR, ...args], { encoding: "utf8" });
  return stdout;
};

/** Commit subjects that touched `filePath` on the remote, newest first. */
async function remoteLog(filePath: string): Promise<string[]> {
  const out = await git("log", "--format=%s", "main", "--", filePath);
  const trimmed = out.trim();
  return trimmed === "" ? [] : trimmed.split("\n");
}

/** File content on the remote's main branch, or undefined if it is not there. */
async function remoteFile(filePath: string): Promise<string | undefined> {
  try {
    return await git("show", `main:${filePath}`);
  } catch {
    return undefined;
  }
}

export { remoteFile, remoteLog };
