import type { FileType, SearchResult } from "@/lib/types";
import { getAllPaths, getFile, parseFileEntry } from "./filestore";
import MiniSearch from "minisearch";
import markdownToPlainText from "@/lib/markdown-text";
import { parseFrontmatter } from "@/lib/frontmatter";

interface DocEntry {
  id: string;
  path: string;
  title: string;
  emoji?: string;
  type: string;
  content: string;
}

let docIndex: MiniSearch<DocEntry> | undefined;

/** A page's visible text: frontmatter removed, Markdown markup stripped. */
function plainTextOf(path: string): string {
  let body = getFile(path) ?? "";
  try {
    body = parseFrontmatter(body).content;
  } catch {
    // keep raw content if frontmatter parse fails
  }
  return markdownToPlainText(body);
}

function buildDocs(paths: string[]): DocEntry[] {
  return paths
    .filter((filePath) => filePath.endsWith(".md") && !filePath.startsWith("."))
    .map((path) => {
      const { title, emoji, type } = parseFileEntry(path);

      return { content: plainTextOf(path), emoji, id: path, path, title, type };
    });
}

function rebuildIndex(): void {
  if (!docIndex) {
    return;
  }
  docIndex.removeAll();
  const allPaths = getAllPaths();
  const docs = buildDocs(allPaths);
  if (docs.length > 0) {
    docIndex.addAll(docs);
  }
  console.log(`Search: indexed ${String(docs.length)} documents`);
}

function initSearch(): void {
  docIndex = new MiniSearch<DocEntry>({
    fields: ["title", "content", "path"],
    searchOptions: {
      boost: { title: 3 },
      fuzzy: 0.2,
      prefix: true,
    },
    storeFields: ["title", "path", "emoji", "type"],
  });
  rebuildIndex();
}

function updateInIndex(path: string): void {
  if (!docIndex) {
    return;
  }
  if (path.endsWith(".md")) {
    try {
      docIndex.discard(path);
    } catch {
      // not in index
    }
    const docs = buildDocs([path]);
    const doc = docs[0];
    if (doc) {
      try {
        docIndex.add(doc);
      } catch (error: unknown) {
        console.warn("Failed to add doc to index:", error);
      }
    }
  }
}

function removeFromIndex(path: string): void {
  if (!docIndex) {
    return;
  }
  if (path.endsWith(".md")) {
    try {
      docIndex.discard(path);
    } catch {
      // not in index
    }
  }
}

function buildSnippet(path: string, query: string): string {
  const body = plainTextOf(path);
  const lowerBody = body.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerBody.includes(lowerQuery)
    ? lowerBody.indexOf(lowerQuery)
    : lowerBody.indexOf((query.split(" ")[0] ?? "").toLowerCase());
  if (idx === -1) {
    return body.length > 140 ? `${body.slice(0, 140)}…` : body;
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + 120);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}

function searchDocs(query: string, limit: number): SearchResult[] {
  if (!docIndex || !query.trim()) {
    return [];
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const docResults = docIndex.search(query) as unknown as (Record<string, unknown> & {
    score: number;
  })[];
  return docResults.slice(0, limit).map((entry) => ({
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    emoji: entry.emoji as string | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    path: entry.path as string,
    score: entry.score,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    snippet: buildSnippet(entry.path as string, query),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    title: entry.title as string,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    type: (entry.type as FileType | undefined) ?? "doc",
  }));
}

export { initSearch, rebuildIndex, updateInIndex, removeFromIndex, searchDocs };
