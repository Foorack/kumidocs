import { CODE_TYPES, IMAGE_TYPES, extensionToType, pathExtension } from "@/lib/filetypes";
import { extractHeadingTitle } from "@/lib/frontmatter";
import { mkdir, readdir, unlink } from "node:fs/promises";
import type { FileEntry, TreeNode } from "@/lib/types";
import type { Config } from "./config";
import type { IgnoreChecker } from "./git-ignore";
import { readTextFile, writeFileBytes } from "./runtime";
import ignore from "ignore";
import matter from "gray-matter";
import path from "node:path";

const fileCache = new Map<string, string>(); // relPath -> content
let treeCache: TreeNode[] | undefined; // invalidated on every write/delete/move

// Generation counter bumped on every file mutation. Other modules (backlinks,
// search) can cache derived data and check this to know when to rebuild.
let fileGeneration = 0;
const getGeneration = (): number => fileGeneration;
const bumpGeneration = (): void => {
  fileGeneration++;
};

// Paths written by this server process; watcher should not re-broadcast these.
// Safety cap prevents unbounded growth if watcher events are ever dropped.
const RECENTLY_WRITTEN_MAX = 500;
const recentlyWritten = new Set<string>();
function markWritten(relPath: string): void {
  // Evict oldest entry when over cap to guard against watcher event loss
  if (recentlyWritten.size >= RECENTLY_WRITTEN_MAX) {
    const oldest = recentlyWritten.values().next();
    if (oldest.value !== undefined) {
      recentlyWritten.delete(oldest.value);
    }
  }
  recentlyWritten.add(relPath);
}
function consumeWritten(relPath: string): boolean {
  if (!recentlyWritten.has(relPath)) {
    return false;
  }
  recentlyWritten.delete(relPath);
  return true;
}

function invalidateTree(): void {
  treeCache = undefined;
  bumpGeneration();
}

// User-configured hidden file patterns from .kumidocs.json hideFiles field.
// Rebuilt on every permissions reload.
let hiddenFilter: (relPath: string) => boolean = () => false;

/** Set patterns that should be hidden from the sidebar / tree. Accepts gitignore-style entries. */
function setHiddenPatterns(patterns: string[] | undefined): void {
  if (patterns === undefined || patterns.length === 0) {
    hiddenFilter = (): boolean => false;
    return;
  }
  const ig = ignore().add(patterns);
  hiddenFilter = (relPath: string): boolean => {
    if (!relPath || relPath === ".") {
      return false;
    }
    try {
      return ig.ignores(relPath.replaceAll("\\", "/"));
    } catch {
      return false;
    }
  };
  invalidateTree();
}

const IGNORED_NAMES = new Set([".git", "node_modules", ".DS_Store", ".env", "dist", "core"]);

const IGNORED_EXT = new Set([".lock", ".log", ".map"]);

async function scanDir(basePath: string, dirPath: string, ig: IgnoreChecker): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      // "core" in IGNORED_NAMES is for core dump files; don't skip directories
      if (IGNORED_NAMES.has(entry.name) && (entry.name !== "core" || !entry.isDirectory())) {
        return;
      }
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(basePath, fullPath);

      if (ig(relPath)) {
        return;
      }

      if (entry.isDirectory()) {
        await scanDir(basePath, fullPath, ig);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IGNORED_EXT.has(ext)) {
          return;
        }
        // Only read text files; for others store empty string as marker
        if (ext === ".md" || CODE_TYPES.has(ext) || ext === "") {
          try {
            const content = await readTextFile(fullPath);
            fileCache.set(relPath, content);
          } catch {
            fileCache.set(relPath, "");
          }
        } else {
          // binary / image: register path but store empty string
          fileCache.set(relPath, "");
        }
      }
    }),
  );
}

async function loadFilestore(config: Config, ig: IgnoreChecker): Promise<void> {
  fileCache.clear();
  await scanDir(config.repoPath, config.repoPath, ig);
  console.log(`Filestore: loaded ${String(fileCache.size)} files`);
}

function getFile(filePath: string): string | undefined {
  return fileCache.get(filePath);
}

function getAllPaths(): string[] {
  return [...fileCache.keys()].toSorted();
}

async function writeFileToRepo(filePath: string, content: string, config: Config): Promise<void> {
  markWritten(filePath); // suppress watcher broadcast for this server-initiated write
  const fullPath = path.join(config.repoPath, filePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const isBinary = IMAGE_TYPES.has(path.extname(filePath).toLowerCase());
  const normalised = isBinary || content.endsWith("\n") ? content : `${content}\n`;
  await writeFileBytes(fullPath, normalised);
  fileCache.set(filePath, normalised);
  invalidateTree();
}

async function deleteFileFromRepo(filePath: string, config: Config): Promise<void> {
  const fullPath = path.join(config.repoPath, filePath);
  await unlink(fullPath);
  fileCache.delete(filePath);
  invalidateTree();
}

async function reloadFile(filePath: string, config: Config): Promise<void> {
  const fullPath = path.join(config.repoPath, filePath);
  try {
    const content = await readTextFile(fullPath);
    fileCache.set(filePath, content);
  } catch {
    fileCache.delete(filePath);
  }
  invalidateTree();
}

function addToCache(filePath: string, content: string): void {
  fileCache.set(filePath, content);
  invalidateTree();
}

function removeFromCache(filePath: string): void {
  fileCache.delete(filePath);
  invalidateTree();
}

function moveInCache(from: string, to: string): void {
  const content = fileCache.get(from) ?? "";
  fileCache.set(to, content);
  fileCache.delete(from);
  invalidateTree();
}

/** Return the text of the first `# Heading` line in a markdown body, or null.
 * Imported from @/lib/frontmatter; re-exported here for convenience.
 */
function parseFileEntry(filePath: string): FileEntry {
  const ext = pathExtension(filePath);
  const fileName = filePath.split("/").pop() ?? filePath;
  const baseName = fileName.replace(/\.md$/u, "");
  const titleFromName = baseName.replaceAll(/[-_]/gu, " ");

  let type: FileEntry["type"] = extensionToType(ext);
  let title = titleFromName;
  let emoji: string | undefined;

  if (ext === "md") {
    type = "doc";
    const content = fileCache.get(filePath) ?? "";
    try {
      const parsed = matter(content);
      const headingTitle = extractHeadingTitle(parsed.content);
      if (headingTitle !== undefined && headingTitle !== "") {
        title = headingTitle;
      }
      if (typeof parsed.data.emoji === "string" && parsed.data.emoji !== "") {
        emoji = parsed.data.emoji;
      }
      if (parsed.data.slides === true) {
        type = "slide";
      }
    } catch (error: unknown) {
      console.warn("Failed to parse frontmatter:", error);
    }
  }

  return { emoji, path: filePath, title, type };
}

// Build file tree for /api/tree
function buildFileTree(): TreeNode[] {
  if (treeCache) {
    return treeCache;
  }

  const allPaths = getAllPaths();
  // Filter out hidden / internal files and the images/ directory (shown via Image Library)
  const visible = allPaths.filter(
    (filePath) =>
      !filePath.startsWith(".") &&
      !IGNORED_NAMES.has(filePath.split("/")[0] ?? "") &&
      !filePath.startsWith("images/") &&
      !hiddenFilter(filePath),
  );

  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  for (const filePath of visible.toSorted()) {
    const parts = filePath.split("/");
    let current = root;
    let cumPath = "";

    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      if (part === undefined || part === "") {
        continue;
      }
      cumPath = cumPath ? `${cumPath}/${part}` : part;
      const isLast = idx === parts.length - 1;

      if (isLast) {
        const fileEntry = parseFileEntry(filePath);
        const node: TreeNode = { fileEntry, name: part, path: filePath, type: "file" };
        current.push(node);
        nodeMap.set(cumPath, node);
      } else {
        let dirNode = nodeMap.get(cumPath);
        if (!dirNode) {
          dirNode = { children: [], name: part, path: cumPath, type: "dir" };
          current.push(dirNode);
          nodeMap.set(cumPath, dirNode);
        }
        const children = dirNode.children;
        if (children) {
          current = children;
        }
      }
    }
  }

  treeCache = root;
  return root;
}

export {
  addToCache,
  buildFileTree,
  consumeWritten,
  deleteFileFromRepo,
  extractHeadingTitle,
  getAllPaths,
  getFile,
  getGeneration,
  IGNORED_NAMES,
  loadFilestore,
  markWritten,
  moveInCache,
  parseFileEntry,
  reloadFile,
  removeFromCache,
  setHiddenPatterns,
  writeFileToRepo,
};
