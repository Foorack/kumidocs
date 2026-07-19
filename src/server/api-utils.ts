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

/** Try to resolve realpath, falling back to the input on failure (path doesn't exist). */
function tryRealpath(p: string): string {
  try {
    // oxlint-disable-next-line no-sync
    return fs.realpathSync(p);
  } catch {
    return p;
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
 * parent directory's realpath is used as the base for the final path segment.
 */
function isSafePath(repoPath: string, userPath: string): boolean {
  const safeBase = tryRealpath(path.resolve(repoPath));
  const full = path.resolve(safeBase, userPath);

  // Resolve symlinks in the full path. If the path doesn't exist, resolve
  // the parent directory's symlinks and append the filename.
  const realFull =
    tryRealpath(full) ||
    ((): string => {
      const parent = path.dirname(full);
      return path.join(tryRealpath(parent), path.basename(full));
    })();

  const basePrefix = safeBase.endsWith("/") ? safeBase : `${safeBase}/`;
  return realFull === safeBase || realFull.startsWith(basePrefix);
}

export { checkBodySize, isSafePath };
