import type { FileType, SearchResult } from "@/lib/types";
import { getAllPaths, getFile, parseFileEntry } from "./filestore";
import MiniSearch from "minisearch";
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

function buildDocs(paths: string[]): DocEntry[] {
  return paths
    .filter((filePath) => filePath.endsWith(".md") && !filePath.startsWith("."))
    .map((path) => {
      const { title, emoji, type } = parseFileEntry(path);

      let body = getFile(path) ?? "";
      try {
        const parsed = parseFrontmatter(body);
        body = parsed.content;
      } catch {
        // keep raw content if frontmatter parse fails
      }

      const stripped = body
        .replaceAll(/```[\s\S]*?```/gu, " ")
        .replaceAll(/`[^`]+`/gu, " ")
        .replaceAll(/^#{1,6}\s+/gmu, "")
        .replaceAll(/\[(?<text>[^\]]+)\]\([^)]+\)/gu, "$1")
        .replaceAll(/[*_~>|]/gu, "")
        .replaceAll(/\s+/gu, " ")
        .trim();

      return { content: stripped, emoji, id: path, path, title, type };
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
  const content = getFile(path) ?? "";
  const body = content.replace(/^---[\s\S]*?---\r?\n/u, "");
  const lowerBody = body.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerBody.includes(lowerQuery)
    ? lowerBody.indexOf(lowerQuery)
    : lowerBody.indexOf((query.split(" ")[0] ?? "").toLowerCase());
  if (idx === -1) {
    return `${body.replaceAll("\n", " ").slice(0, 140)}…`;
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + 120);
  return (
    (start > 0 ? "…" : "") +
    body.slice(start, end).replaceAll("\n", " ") +
    (end < body.length ? "…" : "")
  );
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
