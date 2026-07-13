import type { FileType, SearchResult } from "@/lib/types";
import { getAllPaths, getFile, parseFileEntry } from "./filestore";
import MiniSearch from "minisearch";
import matter from "gray-matter";
import { load as parseYaml } from "js-yaml";

interface DocEntry {
  id: string;
  path: string;
  title: string;
  emoji?: string;
  type: string;
  content: string;
}

interface TicketEntry {
  id: string;
  boardSlug: string;
  ticketId: string;
  title: string;
  content: string;
}

let docIndex: MiniSearch<DocEntry> | undefined;
let ticketIndex: MiniSearch<TicketEntry> | undefined;

function buildDocs(paths: string[]): DocEntry[] {
  return paths
    .filter((filePath) => filePath.endsWith(".md") && !filePath.startsWith("."))
    .map((path) => {
      const { title, emoji, type } = parseFileEntry(path);

      let body = getFile(path) ?? "";
      try {
        const parsed = matter(body);
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

function buildTickets(paths: string[]): TicketEntry[] {
  const tickets: TicketEntry[] = [];
  for (const filePath of paths) {
    if (!filePath.endsWith(".yaml") || filePath.startsWith(".")) {
      continue;
    }
    // Board YAML files are in a board directory: e.g. "my-board/1.yaml"
    const parts = filePath.split("/");
    if (parts.length < 2) {
      continue;
    }
    // Guard above ensures parts.length >= 2, so these are safe.
    const boardSlug = parts[0] ?? "";
    const basename = parts.at(-1) ?? "";
    const ticketId = basename.replace(/\.yaml$/u, "");
    if (!/^\d+$/u.test(ticketId)) {
      continue; // Only numeric IDs are tickets; board config files are e.g. board.yaml
    }

    const raw = getFile(filePath);
    if (raw === undefined || raw === "") {
      continue;
    }
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const parsed = parseYaml(raw) as Record<string, unknown>;
      const title = typeof parsed.title === "string" ? parsed.title : ticketId;
      const body = typeof parsed.body === "string" ? parsed.body : "";
      const content = `${ticketId} ${title} ${body}`
        .replaceAll(/```[\s\S]*?```/gu, " ")
        .replaceAll(/`[^`]+`/gu, " ")
        .replaceAll(/[*_~>|]/gu, "")
        .replaceAll(/\s+/gu, " ")
        .trim();
      tickets.push({ boardSlug, content, id: filePath, ticketId, title });
    } catch {
      // Invalid YAML, skip
    }
  }
  return tickets;
}

function rebuildIndex(): void {
  if (!docIndex || !ticketIndex) {
    return;
  }
  docIndex.removeAll();
  ticketIndex.removeAll();
  const allPaths = getAllPaths();
  const docs = buildDocs(allPaths);
  if (docs.length > 0) {
    docIndex.addAll(docs);
  }
  const tickets = buildTickets(allPaths);
  if (tickets.length > 0) {
    ticketIndex.addAll(tickets);
  }
  console.log(
    `Search: indexed ${String(docs.length)} documents, ${String(tickets.length)} tickets`,
  );
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
  ticketIndex = new MiniSearch<TicketEntry>({
    fields: ["title", "content", "id"],
    searchOptions: {
      boost: { id: 5, title: 3 },
      fuzzy: 0.2,
      prefix: true,
    },
    storeFields: ["boardSlug", "ticketId", "title"],
  });
  rebuildIndex();
}

function updateInIndex(path: string): void {
  if (!docIndex || !ticketIndex) {
    return;
  }
  if (path.endsWith(".md")) {
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      docIndex.remove({ id: path } as DocEntry);
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
  } else if (path.endsWith(".yaml")) {
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      ticketIndex.remove({ id: path } as TicketEntry);
    } catch {
      // not in index
    }
    const tickets = buildTickets([path]);
    const ticket = tickets[0];
    if (ticket) {
      try {
        ticketIndex.add(ticket);
      } catch (error: unknown) {
        console.warn("Failed to add ticket to index:", error);
      }
    }
  }
}

function removeFromIndex(path: string): void {
  if (!docIndex || !ticketIndex) {
    return;
  }
  if (path.endsWith(".md")) {
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      docIndex.remove({ id: path } as DocEntry);
    } catch {
      // not in index
    }
  } else if (path.endsWith(".yaml")) {
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      ticketIndex.remove({ id: path } as TicketEntry);
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

function searchDocs(query: string, limit: number, mode: "docs" | "board"): SearchResult[] {
  if (!docIndex || !ticketIndex || !query.trim()) {
    return [];
  }
  const result: SearchResult[] = [];
  if (mode === "docs") {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const docResults = docIndex.search(query) as unknown as (Record<string, unknown> & {
      score: number;
    })[];
    const limitedDocs = docResults.slice(0, limit);
    for (const entry of limitedDocs) {
      result.push({
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
      });
    }
  } else {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const ticketResults = ticketIndex.search(query) as unknown as (Record<string, unknown> & {
      score: number;
    })[];
    const limitedTickets = ticketResults.slice(0, limit);
    for (const entry of limitedTickets) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const boardSlug = entry.boardSlug as string | undefined;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const ticketId = entry.ticketId as string | undefined;
      result.push({
        boardSlug,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        path: entry.path as string,
        score: entry.score,
        snippet: "",
        ticketId,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        title: entry.title as string,
        type: "ticket" as const,
      });
    }
  }
  return result.toSorted((left, right) => right.score - left.score).slice(0, limit);
}

export { initSearch, rebuildIndex, updateInIndex, removeFromIndex, searchDocs };
