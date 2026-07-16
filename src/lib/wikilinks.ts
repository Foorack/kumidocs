/** [[Page Name]] -> markdown link resolution. */

import type { TreeNode } from "@/lib/types";
import { headingToSlug } from "@/lib/heading";

/** Lookup map returned by `GET /api/pages/lookup`. */
interface WikilinkLookup {
  /** "Page Title" -> "path/to/page.md" */
  byTitle: Record<string, string>;
  /** "path/to/page" (without .md) -> "path/to/page.md" */
  byPath: Record<string, string>;
}

/**
 * Regex to match wiki-link patterns: `[[target]]` or `[[target|display text]]`.
 *
 * Capture groups:
 * - `$1`: the link target (page name, path, etc.)
 * - `$2`: optional display text (when using `[[target|text]]`)
 */
const WIKILINK_RE = /\[\[(?<target>[^\]]+?)(?:\|(?<display>[^\]]+))?\]\]/gu;

/**
 * Resolve a wiki-link target to a file path using the lookup map.
 *
 * Resolution order:
 * 1. Exact path match (without `.md`)
 * 2. Exact title match
 * 3. Case-insensitive title match
 *
 * Returns `undefined` if no match is found (dead link).
 */
function resolveWikilinkTarget(target: string, lookup: WikilinkLookup): string | undefined {
  const trimmed = target.trim();

  // Try exact path match first, then fall back to title lookup
  const pathKey = trimmed.replace(/\.md$/u, "");
  const resolvedPath = lookup.byPath[pathKey] ?? lookup.byPath[trimmed];
  if (resolvedPath !== undefined) {
    return resolvedPath;
  }

  return (
    lookup.byTitle[trimmed] ??
    Object.entries(lookup.byTitle).find(
      ([title]) => title.toLowerCase() === trimmed.toLowerCase(),
    )?.[1]
  );
}

/**
 * Replace `[[target]]` and `[[target|display text]]` patterns in markdown
 * with resolved markdown links.
 *
 * Uses {@link resolveWikilinkTarget} for resolution. Unresolved targets
 * render as dead links to a slugified path (showing the "Create this page?"
 * prompt via NotFound).
 */
function resolveWikilinks(markdown: string, lookup: WikilinkLookup): string {
  return markdown.replaceAll(WIKILINK_RE, (_match, target: string, displayText?: string) => {
    const trimmed = target.trim();
    const display = (displayText ?? trimmed).trim();
    const resolved = resolveWikilinkTarget(target, lookup);

    if (resolved !== undefined) {
      return `[${display}](/p/${resolved.replace(/\.md$/u, "")})`;
    }

    // Dead link: slugify target and link to create page
    const slug = headingToSlug(trimmed);
    return `[${display}](/p/${slug}.md)`;
  });
}

/** A page entry used to build a WikilinkLookup. */
interface PageEntry {
  path: string;
  title: string;
}

/**
 * Build a WikilinkLookup from a list of page entries.
 * Shared between server and client to keep the mapping logic in one place.
 */
function buildWikilinkLookup(entries: PageEntry[]): WikilinkLookup {
  const byTitle: Record<string, string> = {};
  const byPath: Record<string, string> = {};

  for (const { path: filePath, title } of entries) {
    // byTitle: first win for duplicate titles
    if (title && !(title in byTitle)) {
      byTitle[title] = filePath;
    }
    // byPath: path without .md
    const pathKey = filePath.replace(/\.md$/u, "");
    if (!(pathKey in byPath)) {
      byPath[pathKey] = filePath;
    }
    // Base filename (e.g. "aws-architecture" -> path)
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

/** Build a WikilinkLookup from the full file tree (TreeNode[]). */
function buildLookupFromTree(tree: TreeNode[]): WikilinkLookup {
  const entries: PageEntry[] = [];

  function walk(nodes: TreeNode[]): void {
    for (const node of nodes) {
      if (node.type === "file" && node.fileEntry) {
        entries.push({ path: node.fileEntry.path, title: node.fileEntry.title });
      }
      if (node.children) {
        walk(node.children);
      }
    }
  }

  walk(tree);
  return buildWikilinkLookup(entries);
}

export type { WikilinkLookup };
export {
  buildLookupFromTree,
  buildWikilinkLookup,
  resolveWikilinks,
  resolveWikilinkTarget,
  WIKILINK_RE,
};
