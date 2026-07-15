/**
 * runtime.ts -- Bun/Node portable wrappers for server-side I/O.
 *
 * Bun is the preferred runtime, but these helpers let the same code work
 * under Node.js without changes.  Scripts/ remain Bun-only.
 */

import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/** Read a text file (UTF-8). */
async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

/** Read a file as a Buffer. */
async function readFileBuffer(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

/** Write data to a file, creating parent directories if needed. */
async function writeFileBytes(
  filePath: string,
  data: string | Buffer | ArrayBuffer,
): Promise<void> {
  const parentDir = filePath.slice(0, filePath.lastIndexOf("/"));
  await mkdir(parentDir, { recursive: true });
  const buf = data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data)) : Buffer.from(data);
  await writeFile(filePath, buf);
}

/** Get the size of a file in bytes. */
async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

/** Check whether a file exists. */
async function doesFileExist(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** Compute the lowercase hex SHA-256 digest of data. */
function sha256Hex(data: string | Buffer | ArrayBuffer): string {
  const hash = createHash("sha256");
  if (data instanceof ArrayBuffer) {
    hash.update(new Uint8Array(data));
  } else if (typeof data === "string") {
    hash.update(data, "utf8");
  } else {
    hash.update(data);
  }
  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// Process spawning
// ---------------------------------------------------------------------------

interface SpawnResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface SpawnOptions {
  cwd?: string;
  // oxlint-disable-next-line node/no-process-env
  env?: Record<string, string | undefined>;
  /** Max time (ms) to wait before killing the process. 0 or undefined = no timeout. */
  timeoutMs?: number;
}

const execFileAsync = promisify(execFile);

/** Spawn a subprocess and collect its output. */
async function spawnProcess(
  command: string,
  args: string[],
  options?: SpawnOptions,
): Promise<SpawnResult> {
  const { timeoutMs } = options ?? {};

  // oxlint-disable-next-line node/no-process-env
  const envObj = { ...process.env, ...options?.env };

  try {
    const { stderr, stdout } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      env: envObj,
      timeout: timeoutMs,
    });
    return { exitCode: 0, stderr, stdout };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error) {
      return {
        exitCode: typeof error.code === "number" ? error.code : -1,
        // execFile puts stdout/stderr on the error object on timeout/kill
        stderr: (error as Error & { stderr?: string }).stderr ?? "",
        stdout: (error as Error & { stdout?: string }).stdout ?? "",
      };
    }
    return { exitCode: -1, stderr: "", stdout: "" };
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// oxlint-disable-next-line node/no-process-env
const runtimeEnv: Record<string, string | undefined> = process.env;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

function mimeTypeFromPath(filePath: string): string | undefined {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext];
}

/** Serve a file as an HTTP Response (reads the file into memory first). */
async function serveFileResponse(
  filePath: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const content = await readFile(filePath);
  const resHeaders: Record<string, string> = { ...headers };
  // oxlint-disable-next-line typescript/strict-boolean-expressions
  if (!resHeaders["Content-Type"] && !resHeaders["content-type"]) {
    const mime = mimeTypeFromPath(filePath);
    // oxlint-disable-next-line typescript/strict-boolean-expressions
    if (mime !== undefined) {
      resHeaders["Content-Type"] = mime;
    }
  }
  return new Response(content, { headers: resHeaders });
}

export {
  type SpawnOptions,
  type SpawnResult,
  doesFileExist,
  getFileSize,
  mimeTypeFromPath,
  readFileBuffer,
  readTextFile,
  runtimeEnv,
  serveFileResponse,
  sha256Hex,
  spawnProcess,
  writeFileBytes,
};
