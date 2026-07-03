/**
 * runtime.ts -- Bun/Node portable wrappers for server-side I/O.
 *
 * Bun is the preferred runtime, but these helpers let the same code work
 * under Node.js without changes.  Scripts/ remain Bun-only.
 *
 * Current Bun-specific APIs STILL used directly (not abstracted here):
 *   - `import { serve } from "bun"` -- HTTP/WS server entry point
 *   - `import type { ServerWebSocket } from "bun"` -- WS type with ws.data
 *   - `import.meta.dir / import.meta.url` -- also supported in Node 21+
 *   - `__BUNDLED__` -- Bun build-time constant
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
  const buf = data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data)) : Buffer.from(data);
  hash.update(buf);
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

/** Serve a file as an HTTP Response (reads the file into memory first). */
async function serveFileResponse(
  filePath: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const content = await readFile(filePath);
  return new Response(content, { headers });
}

export {
  type SpawnOptions,
  type SpawnResult,
  doesFileExist,
  getFileSize,
  readFileBuffer,
  readTextFile,
  runtimeEnv,
  serveFileResponse,
  sha256Hex,
  spawnProcess,
  writeFileBytes,
};
