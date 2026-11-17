import fs from "node:fs";
import path from "node:path";

/** Maximum accepted request body size (200 KB). Rejected before JSON parsing. */
const MAX_BODY_SIZE = 200 * 1024;

/** Quick Content-Length check before reading the body. Returns error or undefined. */
function checkBodySize(req: Request): Response | undefined {
  const rawLen = req.headers.get("content-length");
  if (rawLen !== null && rawLen !== "") {
    const len = Number(rawLen);
    if (Number.isFinite(len) && len > MAX_BODY_SIZE) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }
  }
  return undefined;
}

/** realpath, or undefined when the path cannot be resolved (it does not exist). */
function tryRealpath(p: string): string | undefined {
  try {
    // oxlint-disable-next-line no-sync
    return fs.realpathSync(p);
  } catch {
    return undefined;
  }
}

/**
 * Realpath of the deepest existing ancestor of `target`, with the missing
 * tail appended back on. A file that is about to be created has no realpath
 * of its own, but its parent directory can still be a symlink out of the repo.
 */
function resolveExistingAncestor(target: string): string {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    const real = tryRealpath(current);
    if (real !== undefined) {
      return path.join(real, ...missing.toReversed());
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return target;
    }
    missing.push(path.basename(current));
    current = parent;
  }
}

/**
 * Returns true if `userPath` resolves to a location inside `repoPath`.
 * Prevents path traversal attacks (e.g. "../../etc/passwd").
 *
 * Uses `fs.realpathSync` to resolve symlinks in both the repo base and
 * the user-supplied path. Without this, a symlink inside the repo pointing
 * outside would bypass the check since `path.resolve` does not follow symlinks.
 *
 * For paths that don't exist on disk yet (e.g. creating a new file), the
 * deepest existing ancestor is resolved instead, so "link/new.md" cannot
 * slip past when "link" points outside the repo.
 */
function isSafePath(repoPath: string, userPath: string): boolean {
  const safeBase = tryRealpath(path.resolve(repoPath)) ?? path.resolve(repoPath);
  const full = path.resolve(safeBase, userPath);
  const realFull = resolveExistingAncestor(full);

  const basePrefix = safeBase.endsWith("/") ? safeBase : `${safeBase}/`;
  return realFull === safeBase || realFull.startsWith(basePrefix);
}

export { checkBodySize, isSafePath };
