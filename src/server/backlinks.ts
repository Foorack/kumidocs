import { WIKILINK_RE, resolveWikilinkTarget } from "@/lib/wikilinks";
import { getAllPaths, getFile, parseFileEntry } from "./filestore";
import type { WikilinkLookup } from "@/lib/wikilinks";
import type { BacklinkEntry } from "@/lib/types";
import matter from "gray-matter";

// Lookup

/**
 * Build the wiki-link lookup map from all `.md` files in the repo.
 * Used by the client to resolve `[[Page Name]]` links at render time.
 */
function buildLookup(): WikilinkLookup {
  const byTitle: Record<string, string> = {};
  const byPath: Record<string, string> = {};

  for (const filePath of getAllPaths()) {
    if (!filePath.endsWith(".md")) {
      continue;
    }

    const entry = parseFileEntry(filePath);
    // byTitle: map display title to path (skip duplicates; first wins)
    if (entry.title && !(entry.title in byTitle)) {
      byTitle[entry.title] = filePath;
    }
    // byPath: map path without .md to the full path
    const pathKey = filePath.replace(/\.md$/u, "");
    if (!(pathKey in byPath)) {
      byPath[pathKey] = filePath;
    }
    // Also map the base filename (e.g. "aws-architecture" -> path)
    const baseName = filePath.split("/").pop()?.replace(/\.md$/u, "");
    if (
      baseName !== undefined &&
      baseName !== "" &&
      baseName !== pathKey &&
      !(baseName in byPath)
    ) {
      byPath[baseName] = filePath;
    }
  }

  return { byPath, byTitle };
}

// Backlinks

function buildBacklinks(queryPath: string): BacklinkEntry[] {
  const lookup = buildLookup();
  const results: BacklinkEntry[] = [];
  // Normalise the query so both "path/to/page" and "path/to/page.md" work
  const queryNormalised = queryPath.replace(/\.md$/u, "");

  for (const filePath of getAllPaths()) {
    if (
      !filePath.endsWith(".md") ||
      filePath === queryPath ||
      filePath === `${queryNormalised}.md`
    ) {
      continue;
    }

    const content = getFile(filePath);
    if (content === undefined || content === "") {
      continue;
    }

    // Skip frontmatter
    let body = content;
    try {
      const parsed = matter(content);
      body = parsed.content;
    } catch {
      // keep raw
    }

    // Find all [[target]] patterns in this file
    WIKILINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_RE.exec(body)) !== null) {
      const target = match[1]?.trim();
      if (target === undefined || target === "") {
        continue;
      }

      // Resolve the target the same way the client does
      const resolved = resolveWikilinkTarget(target, lookup);

      if (resolved?.replace(/\.md$/u, "") === queryNormalised) {
        const entry = parseFileEntry(filePath);
        results.push({ path: filePath, title: entry.title });
        break; // one result per linking page is enough
      }
    }
  }

  return results;
}

/** Handler for `GET /api/backlinks?path=<path>`. */
function apiBacklinks(url: URL): Response {
  const queryPath = url.searchParams.get("path") ?? "";
  if (queryPath === "") {
    return Response.json({ error: "Missing 'path' query parameter" }, { status: 400 });
  }
  return Response.json(buildBacklinks(queryPath));
}

export { apiBacklinks, buildLookup };
