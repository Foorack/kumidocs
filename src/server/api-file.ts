import { assertJsonObject, checkBodySize, isSafePath } from "./api-utils";
import {
  broadcastPageChanged,
  broadcastPageCreated,
  broadcastPageDeleted,
  broadcastSyncStatus,
  getEditorForPage,
  getSyncStatus,
} from "./websocket";
import {
  deleteFileFromRepo,
  getAllPaths,
  getFile,
  moveInCache,
  writeFileToRepo,
} from "./filestore";
import { getHeadSha, gitMoveAndCommit, gitRemoveAndCommit, gitStageAndCommit } from "./git";
import { mkdir, rename } from "node:fs/promises";
import { removeFromIndex, updateInIndex } from "./search";
import { load as parseYaml, dump as stringifyYaml } from "js-yaml";
import path from "node:path";
import type { Config } from "./config";
import type { User } from "@/lib/types";

/**
 * Check if a file path is a ticket YAML (e.g. "boardName/42.yaml").
 * Ticket YAMLs live in a subdirectory and have a numeric filename.
 */
const TICKET_YAML_RE = /^.+\/\d+\.yaml$/u;

/** Inject or update createdAt / updatedAt timestamps in a ticket YAML string. */
function injectTicketTimestamps(content: string, filePath: string, now: string): string {
  if (!TICKET_YAML_RE.test(filePath)) {
    return content;
  }

  // Parse with js-yaml to avoid fragile regex manipulation.
  let data: unknown;
  try {
    data = parseYaml(content);
  } catch {
    return content;
  }
  if (typeof data !== "object" || data === null) {
    return content;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const obj = data as Record<string, unknown>;

  // If updatedAt is already present in the client-provided content, preserve it
  // (e.g. bookmark-only saves should not bump the timestamp).
  if (obj.updatedAt !== undefined && obj.updatedAt !== "") {
    // Still ensure createdAt exists
    if (obj.createdAt === undefined || obj.createdAt === "") {
      obj.createdAt = now;
    }
    return stringifyYaml(obj, { lineWidth: 120, noRefs: true });
  }

  obj.updatedAt = now;
  if (obj.createdAt === undefined || obj.createdAt === "") {
    obj.createdAt = now;
  }

  return stringifyYaml(obj, { lineWidth: 120, noRefs: true });
}

/**
 * After a git push result, broadcast the appropriate sync status:
 * - push_failed -> set push to "failing"
 * - push succeeded while previously failing -> recover to "ok"
 */
function handlePushResult(result: { error?: string }): void {
  if (result.error === "push_failed") {
    broadcastSyncStatus({ ...getSyncStatus(), push: "failing" });
  } else {
    const prev = getSyncStatus();
    if (prev.push === "failing") {
      broadcastSyncStatus({ ...prev, push: "ok" });
    }
  }
}

// GET /api/file?path=<path>
async function apiFileGet(url: URL, config: Config): Promise<Response> {
  const filePath = decodeURIComponent(url.searchParams.get("path") ?? "");
  if (!filePath) {
    return Response.json({ error: "path required" }, { status: 400 });
  }
  if (!isSafePath(config.repoPath, filePath)) {
    return new Response("Forbidden", { status: 403 });
  }

  const content = getFile(filePath);
  if (content === undefined) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sha = await getHeadSha(config);
  return Response.json({ content, path: filePath, sha });
}

// PUT /api/file?path=<path>   body: { content: string }
async function apiFilePut(url: URL, req: Request, user: User, config: Config): Promise<Response> {
  if (!user.canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const filePath = decodeURIComponent(url.searchParams.get("path") ?? "");
  if (!filePath) {
    return Response.json({ error: "path required" }, { status: 400 });
  }
  if (!isSafePath(config.repoPath, filePath)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Enforce the WebSocket edit lock: reject writes from users who don't hold it
  // if another active session is currently editing this page.
  const lockHolder = getEditorForPage(filePath);
  if (lockHolder && lockHolder.id !== user.id) {
    return Response.json(
      { editedBy: lockHolder.displayName, error: "Page is locked by another editor" },
      { status: 423 }, // 423 Locked
    );
  }

  const tooLarge = checkBodySize(req);
  if (tooLarge !== undefined) {
    return tooLarge;
  }

  let body: Record<string, unknown>;
  try {
    const json: unknown = await req.json();
    body = assertJsonObject(json);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (content.length > 200 * 1024) {
    return Response.json({ error: "Content too large (max 200 KB)" }, { status: 413 });
  }

  // Inject timestamps into ticket YAML files (server-side time avoids clock skew)
  const tsContent = injectTicketTimestamps(content, filePath, new Date().toISOString());
  await writeFileToRepo(filePath, tsContent, config);
  updateInIndex(filePath);

  const msg = `docs(${filePath}): save by ${user.displayName}`;
  const result = await gitStageAndCommit(
    config,
    [filePath],
    msg,
    user.displayName,
    user.email || "kumidocs@localhost",
  );

  // Only broadcast if a new commit was actually made; skip no-op saves
  if (result.committed !== false) {
    broadcastPageChanged(filePath, result.sha, user.id, user.displayName);
  }

  if (result.error === "push_failed") {
    handlePushResult(result);
    return Response.json({ pushWarning: true, sha: result.sha });
  }
  handlePushResult(result);
  return Response.json({ sha: result.sha });
}

// POST /api/file   body: { path: string, content: string }
async function apiFileCreate(req: Request, user: User, config: Config): Promise<Response> {
  if (!user.canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tooLarge = checkBodySize(req);
  if (tooLarge !== undefined) {
    return tooLarge;
  }

  let body: Record<string, unknown>;
  try {
    const json: unknown = await req.json();
    body = assertJsonObject(json);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filePath = typeof body.path === "string" ? body.path : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (content.length > 200 * 1024) {
    return Response.json({ error: "Content too large (max 200 KB)" }, { status: 413 });
  }
  if (!filePath) {
    return Response.json({ error: "path required" }, { status: 400 });
  }
  if (!isSafePath(config.repoPath, filePath)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (getFile(filePath) !== undefined) {
    return Response.json({ error: "File already exists" }, { status: 409 });
  }

  // Inject timestamps into ticket YAML files (server-side time avoids clock skew)
  const tsContent = injectTicketTimestamps(content, filePath, new Date().toISOString());
  await writeFileToRepo(filePath, tsContent, config);
  updateInIndex(filePath);

  const msg = `docs(${filePath}): create by ${user.displayName}`;
  const result = await gitStageAndCommit(
    config,
    [filePath],
    msg,
    user.displayName,
    user.email || "kumidocs@localhost",
  );

  broadcastPageCreated(filePath, filePath);

  if (result.error === "push_failed") {
    handlePushResult(result);
    return Response.json({ path: filePath, pushWarning: true, sha: result.sha });
  }
  handlePushResult(result);
  return Response.json({ path: filePath, sha: result.sha });
}

// DELETE /api/file?path=<path>
async function apiFileDelete(url: URL, user: User, config: Config): Promise<Response> {
  if (!user.canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const filePath = decodeURIComponent(url.searchParams.get("path") ?? "");
  if (!filePath) {
    return Response.json({ error: "path required" }, { status: 400 });
  }
  if (!isSafePath(config.repoPath, filePath)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (getFile(filePath) === undefined) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await deleteFileFromRepo(filePath, config);
  removeFromIndex(filePath);

  const msg = `docs(${filePath}): delete by ${user.displayName}`;
  const result = await gitRemoveAndCommit(
    config,
    filePath,
    msg,
    user.displayName,
    user.email || "kumidocs@localhost",
  );

  broadcastPageDeleted(filePath);

  if (result.error === "push_failed") {
    handlePushResult(result);
    return Response.json({ pushWarning: true, sha: result.sha });
  }
  handlePushResult(result);
  return Response.json({ sha: result.sha });
}

// POST /api/file/rename   body: { from: string, to: string }
async function apiFileRename(req: Request, user: User, config: Config): Promise<Response> {
  if (!user.canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const json: unknown = await req.json();
    body = assertJsonObject(json);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const from = typeof body.from === "string" ? body.from : "";
  const to = typeof body.to === "string" ? body.to : "";
  if (from === "" || to === "") {
    return Response.json({ error: "from and to required" }, { status: 400 });
  }
  if (!isSafePath(config.repoPath, from) || !isSafePath(config.repoPath, to)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (from === to) {
    return Response.json({ from, sha: undefined, to });
  }
  if (getFile(from) === undefined) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (getFile(to) !== undefined) {
    return Response.json({ error: "Destination already exists" }, { status: 409 });
  }

  // Collect all files that must move: the page itself plus any sub-pages living
  // under the matching directory (e.g. "docs.md" -> also move all "docs/*").
  const fromDir = `${from.replace(/\.md$/iu, "")}/`;
  const toDir = `${to.replace(/\.md$/iu, "")}/`;
  const allPaths = getAllPaths();
  const subFiles = allPaths.filter((filePath) => filePath.startsWith(fromDir));

  // Build the full list of (abs-from, abs-to) pairs for all fs.rename calls.
  const renameOps = [
    { relFrom: from, relTo: to },
    ...subFiles.map((subFile) => ({
      relFrom: subFile,
      relTo: toDir + subFile.slice(fromDir.length),
    })),
  ];

  // Perform all renames; roll back any that succeeded if any step fails.
  interface RenameOp {
    relFrom: string;
    relTo: string;
  }
  const renameResults = await Promise.allSettled(
    renameOps.map(async (op) => {
      await mkdir(path.dirname(path.join(config.repoPath, op.relTo)), { recursive: true });
      await rename(path.join(config.repoPath, op.relFrom), path.join(config.repoPath, op.relTo));
      return op;
    }),
  );
  const firstFailure = renameResults.find((res) => res.status === "rejected");
  if (firstFailure !== undefined) {
    const completed = renameResults
      .filter((res): res is PromiseFulfilledResult<RenameOp> => res.status === "fulfilled")
      .map((res) => res.value);
    await Promise.all(
      completed.toReversed().map(async (op) =>
        rename(path.join(config.repoPath, op.relTo), path.join(config.repoPath, op.relFrom)).catch(
          (_err: unknown) => {
            /* rollback best-effort, ignore failure */
          },
        ),
      ),
    );
    console.error("apiFileRename: fs.rename failed, rolled back:", firstFailure.reason);
    return Response.json({ error: "Failed to rename files" }, { status: 500 });
  }

  // All fs operations succeeded; update in-memory state
  for (const op of renameOps) {
    moveInCache(op.relFrom, op.relTo);
    removeFromIndex(op.relFrom);
    updateInIndex(op.relTo);
  }

  const movedPaths = renameOps.map((op) => op.relFrom);
  const newPaths = renameOps.map((op) => op.relTo);

  const msg = `docs: rename ${from} -> ${to} by ${user.displayName}`;
  const extraMoves = subFiles.map((subFile) => ({
    from: subFile,
    to: toDir + subFile.slice(fromDir.length),
  }));
  const moveResult = await gitMoveAndCommit(
    config,
    from,
    to,
    msg,
    user.displayName,
    user.email || "kumidocs@localhost",
    extraMoves,
  );

  // Broadcast regardless of push status; files are safely on disk and in cache.
  for (const old of movedPaths) {
    broadcastPageDeleted(old);
  }
  for (const newPath of newPaths) {
    broadcastPageCreated(newPath, newPath);
  }

  if (moveResult.error === "push_failed") {
    handlePushResult(moveResult);
    return Response.json({ from, pushWarning: true, sha: moveResult.sha, to });
  }
  handlePushResult(moveResult);
  return Response.json({ from, sha: moveResult.sha, to });
}

export { apiFileGet, apiFilePut, apiFileCreate, apiFileDelete, apiFileRename };
