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

/**
 * Returns true if `userPath` resolves to a location inside `repoPath`.
 * Prevents path traversal attacks (e.g. "../../etc/passwd").
 */
function isSafePath(repoPath: string, userPath: string): boolean {
  const safeBase = path.resolve(repoPath);
  const full = path.resolve(repoPath, userPath);
  return full === safeBase || full.startsWith(`${safeBase}/`);
}

/**
 * Validates that a value parsed from JSON is a plain object (not null, array,
 * or primitive). Returns the value typed as Record<string, unknown> so that
 * callers can access fields with proper typeof checks instead of raw `as` casts.
 *
 * Replaces the common `json as { ... }` pattern that silently passes garbage.
 */
function assertJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a JSON object");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Record<string, unknown>;
}

export { assertJsonObject, checkBodySize, isSafePath };
export default isSafePath;
