import { buildWikilinkLookup, WIKILINK_RE, resolveWikilinkTarget } from "@/lib/wikilinks";
import { getAllPaths, getFile, getGeneration, parseFileEntry } from "./filestore";
import type { WikilinkLookup } from "@/lib/wikilinks";
import type { BacklinkEntry } from "@/lib/types";
import { parseFrontmatter } from "@/lib/frontmatter";

/**
 * Build the wiki-link lookup map from all `.md` files in the repo.
 */
function buildLookup(): WikilinkLookup {
  const entries: { path: string; title: string }[] = [];
  for (const filePath of getAllPaths()) {
    if (!filePath.endsWith(".md")) {
      continue;
    }
    const entry = parseFileEntry(filePath);
    entries.push({ path: filePath, title: entry.title });
  }
  return buildWikilinkLookup(entries);
}

// Cached lookup -- rebuilt automatically when the filestore generation advances.
let cachedLookup: WikilinkLookup | undefined;
let cachedGeneration = -1;

function getLookup(): WikilinkLookup {
  const gen = getGeneration();
  if (cachedGeneration !== gen || cachedLookup === undefined) {
    cachedLookup = buildLookup();
    cachedGeneration = gen;
  }
  return cachedLookup;
}

// Backlinks

function buildBacklinks(queryPath: string): BacklinkEntry[] {
  const lookup = getLookup();
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
      const parsed = parseFrontmatter(content);
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
