import { serve } from "bun";
import { existsSync, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { parseUser, setPermissions, setReadonly } from "./server/auth";
import { loadConfig } from "./server/config";
import {
  IGNORED_NAMES,
  consumeWritten,
  loadFilestore,
  reloadFile,
  removeFromCache,
  setHiddenPatterns,
} from "./server/filestore";
import { buildIgnoreChecker } from "./server/git-ignore";
import { gitFetchAndRebase, gitPull, gitStageAndCommit } from "./server/git";
import { initSearch, removeFromIndex, updateInIndex } from "./server/search";
import {
  broadcastConfigChanged,
  broadcastPageChanged,
  broadcastPageDeleted,
  broadcastSyncStatus,
  pruneDeadSessions,
  wsClose,
  wsMessage,
  wsOpen,
} from "./server/websocket";
import type { User } from "./lib/types";
import type { WsData } from "./server/websocket";
import path from "node:path";
import buildRoutes, { serveCatchAll } from "./server/router";
import type { KumiDocsPermissions } from "./server/auth";
// oxlint-disable-next-line no-underscore-dangle
declare const __BUNDLED__: boolean | undefined;

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (error: unknown) {
  if (error instanceof Error && error.name === "ExitRequestError" && "exitCode" in error) {
    // oxlint-disable-next-line unicorn/no-process-exit, typescript/no-unsafe-type-assertion
    process.exit((error as { exitCode: number }).exitCode);
  }
  throw error;
}

// Validate repo
// oxlint-disable-next-line node/no-sync
if (!existsSync(path.join(config.repoPath, ".git"))) {
  throw new Error(`Fatal: ${config.repoPath} is not a git repository.`);
}

// Propagate readonly flag to auth layer so all users get canEdit=false
setReadonly(config.readonly);

// Load .kumidocs.json permissions
async function loadPermissions(): Promise<void> {
  if (config.readonly) {
    setPermissions({});
    setHiddenPatterns(undefined);
    return;
  }
  const configPath = path.join(config.repoPath, ".kumidocs.json");
  try {
    const raw = await Bun.file(configPath).text();
    const parsed: unknown = JSON.parse(raw);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    setPermissions(parsed as KumiDocsPermissions);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    setHiddenPatterns((parsed as KumiDocsPermissions).hideFiles);
  } catch (error: unknown) {
    // If file doesn't exist, create it with default config
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      const defaultConfig = {
        editors: [],
        instanceName: "KumiDocs",
      };
      await Bun.write(configPath, JSON.stringify(defaultConfig, undefined, 2));
      setPermissions(defaultConfig);
      setHiddenPatterns(undefined);
      console.log("Created .kumidocs.json with default configuration");

      // Commit and push the new config file
      await gitStageAndCommit(
        config,
        [".kumidocs.json"],
        "chore: initialize .kumidocs.json",
        "KumiDocs",
        "kumidocs@localhost",
      );
      console.log("Committed and pushed .kumidocs.json to repository");
    } else {
      setPermissions({});
      setHiddenPatterns(undefined);
    }
  }
}

await loadPermissions();

// File watcher
// Build gitignore checker once; used to skip both watching and indexing.
const ig = buildIgnoreChecker(config.repoPath);

// Hard-skip these directory names regardless of .gitignore.
const WATCHER_SKIP = new Set([".git", ...IGNORED_NAMES]);

function isWatcherIgnored(relPath: string): boolean {
  if (!relPath) {
    return false;
  }
  const firstSeg = relPath.split("/")[0] ?? "";
  if (WATCHER_SKIP.has(firstSeg)) {
    return true;
  }
  return ig(relPath);
}

const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();
const watchedDirs = new Set<string>();
const watcherHandles = new Map<string, ReturnType<typeof watch>>();

/** Close a directory watcher and remove it from tracking sets. */
function closeWatcher(absDir: string): void {
  const handle = watcherHandles.get(absDir);
  if (handle) {
    handle.close();
    watcherHandles.delete(absDir);
  }
  watchedDirs.delete(absDir);
}

/** Close watchers for a directory and all its subdirectories. */
function closeWatcherTree(absDir: string): void {
  const prefix = absDir.endsWith("/") ? absDir : `${absDir}/`;
  // Close children first
  for (const dir of watchedDirs) {
    if (dir.startsWith(prefix)) {
      closeWatcher(dir);
    }
  }
  // Close the directory itself
  closeWatcher(absDir);
}

async function processFileChange(relPath: string): Promise<void> {
  if (relPath === ".kumidocs.json") {
    await loadPermissions();
    broadcastConfigChanged();
    console.log("Reloaded .kumidocs.json");
    return;
  }
  const fullPath = path.join(config.repoPath, relPath);
  // oxlint-disable-next-line node/no-sync
  if (existsSync(fullPath)) {
    await reloadFile(relPath, config);
    updateInIndex(relPath);
    // Skip broadcast for writes originated by this server process
    if (!consumeWritten(relPath)) {
      broadcastPageChanged(relPath, undefined, "disk", "Local");
    }
  } else {
    removeFromCache(relPath);
    removeFromIndex(relPath);
    broadcastPageDeleted(relPath);
  }
}

async function watchDir(absDir: string): Promise<void> {
  if (watchedDirs.has(absDir)) {
    return;
  }
  const relDir = path.relative(config.repoPath, absDir).replaceAll("\\", "/");
  if (relDir && isWatcherIgnored(relDir)) {
    return;
  }
  watchedDirs.add(absDir);

  // Watch this single directory (non-recursive) to avoid creating inotify
  // watches for every subdirectory in the tree (which exhausts the OS limit
  // when node_modules or similar large directories are present).
  const handle = watch(absDir, {}, async (_event, filename) => {
    // When filename is null, the directory itself may have been deleted or
    // renamed. Check if the directory still exists; if not, clean up the
    // watcher to prevent leaking OS inotify handles.
    if (filename === null) {
      try {
        await stat(absDir);
      } catch {
        closeWatcherTree(absDir);
      }
      return;
    }
    const absFile = path.join(absDir, filename);
    const relFile = path.relative(config.repoPath, absFile).replaceAll("\\", "/");
    if (isWatcherIgnored(relFile)) {
      return;
    }

    // If a new directory appeared, set up a watcher for it
    try {
      const fileStats = await stat(absFile);
      if (fileStats.isDirectory()) {
        await watchDir(absFile);
        return;
      }
    } catch {
      // If the deleted path was a watched directory, clean up its watcher
      if (watchedDirs.has(absFile)) {
        closeWatcherTree(absFile);
      }
      // Treat as file change for the remaining logic
    }

    const prev = debounceMap.get(relFile);
    if (prev) {
      clearTimeout(prev);
    }
    debounceMap.set(
      relFile,
      setTimeout(() => {
        debounceMap.delete(relFile);
        void processFileChange(relFile);
      }, 100),
    );
  });
  watcherHandles.set(absDir, handle);

  // Recurse into non-ignored subdirectories
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => watchDir(path.join(absDir, entry.name))),
    );
  } catch {
    // Directory removed during scan; ignore
  }
}

await gitPull(config);
await loadFilestore(config, ig);
initSearch();

// Start watching AFTER the filestore is fully loaded and indexed so we
// never process change events against an empty or half-built cache.
await watchDir(config.repoPath);

// Auth helper used in route handlers
function requireUser(req: Request): User | undefined {
  return parseUser(req.headers, config.authHeader);
}

// Background tasks: adaptive pull loop with exponential backoff
let pullBackoff = config.pullInterval;

async function runPullCycle(): Promise<void> {
  const result = await gitFetchAndRebase(config);
  broadcastSyncStatus({ pull: result.pullFailed ? "failing" : "ok", push: "ok" });

  if (result.advanced) {
    await loadPermissions();
    // Full rescan is more reliable than per-file git diff - catches new
    // directories, renames, and files that git rebase may struggle to
    // report when the working tree has uncommitted auto-save changes.
    await loadFilestore(config, ig);
    initSearch();
    // Broadcast a tree change so all clients refresh the sidebar.
    for (const changedPath of result.changed) {
      if (changedPath === ".kumidocs.json") {
        continue;
      }
      const fullPath = path.join(config.repoPath, changedPath);
      // oxlint-disable-next-line node/no-sync
      if (existsSync(fullPath)) {
        broadcastPageChanged(changedPath, result.sha, "upstream", "Remote");
      } else {
        broadcastPageDeleted(changedPath);
      }
    }
  }

  // Adaptive delay: after failure retry soon (5s -> 10s -> 20s -> ... capped at interval);
  // after success reset to normal interval.
  if (result.pullFailed) {
    pullBackoff =
      pullBackoff === config.pullInterval ? 5000 : Math.min(pullBackoff * 2, config.pullInterval);
  } else {
    pullBackoff = config.pullInterval;
  }

  setTimeout(() => {
    void runPullCycle();
  }, pullBackoff);
}

// Start immediately (first actual pull already happened at startup)
setTimeout(() => {
  void runPullCycle();
}, config.pullInterval);

// Prune dead WS sessions every 30s
setInterval(pruneDeadSessions, 30_000);

const server = serve<WsData>({
  // oxlint-disable-next-line node/no-process-env
  development: process.env.NODE_ENV !== "production" && {
    console: true,
    hmr: true,
  },

  async fetch(req, srv) {
    const url = new URL(req.url);

    // WebSocket upgrade (checked before API/SPA fallthrough)
    if (url.pathname === "/ws") {
      const user = requireUser(req);
      if (!user) {
        return new Response("Unauthorized", { status: 401 });
      }
      const upgraded = srv.upgrade(req, {
        data: {
          lastHeartbeat: Date.now(),
          pageId: undefined,
          sessionId: "",
          user,
        },
      });
      return upgraded ? undefined : new Response("WS upgrade failed", { status: 400 });
    }

    // API paths: fall through to the routes object for method-specific handling.
    if (url.pathname.startsWith("/api/")) {
      return undefined;
    }

    // All non-WS, non-API paths: serve the SPA catch-all.
    // oxlint-disable-next-line no-underscore-dangle
    if (__BUNDLED__ !== undefined) {
      return serveCatchAll(req);
    }
    // Dev mode: let routes["/*"] handle it (Bun HTMLBundle needs routes).
    return undefined;
  },

  port: config.port,

  routes: await buildRoutes(config, requireUser),

  websocket: {
    close: wsClose,
    message: wsMessage,
    open: wsOpen,
  },
});

console.log(`🚀 KumiDocs running at ${server.url}`);
console.log(`📁 Repo: ${config.repoPath}`);
