import { gzipSync } from "bun";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { apiBacklinks } from "./backlinks";
import { buildFileTree, getFile } from "./filestore";
import { assertJsonObject } from "@/lib/utils";
import type { Config } from "./config";
import type { User } from "@/lib/types";
import { getHeadSha } from "./git";
import { getPermissions } from "./auth";
import { searchDocs } from "./search";
import { load as parseYaml } from "js-yaml";

// GET /api/me
async function apiMe(user: User, config: Config): Promise<Response> {
  const perms = getPermissions();
  let headSha = "";
  try {
    headSha = await getHeadSha(config);
  } catch {
    // Not a git repo or no commits yet
  }
  return Response.json({
    ...user,
    autoSaveDelay: config.autoSaveDelay,
    headSha,
    instanceName: perms.instanceName ?? "KumiDocs",
    mode: config.board ? "board" : "docs",
    pageTemplates: perms.pageTemplates ?? {},
    repoUrl: perms.repoUrl,
    sidebarDefaultDepth: perms.sidebarDefaultDepth ?? 2,
    slideThemes: perms.slideThemes ?? {},
  });
}

// GET /api/tree
function apiTree(): Response {
  return Response.json(buildFileTree());
}

// GET /api/search?q=<query>&mode=<docs|board>
function apiSearch(url: URL): Response {
  const query = url.searchParams.get("q") ?? "";
  const mode = url.searchParams.get("mode");
  if (mode !== "docs" && mode !== "board") {
    return Response.json(
      { error: "Missing or invalid mode parameter (must be 'docs' or 'board')" },
      { status: 400 },
    );
  }
  return Response.json(searchDocs(query, 20, mode));
}

// Helper: eagerly read + gzip a text file at module init, serve from cache.
function createGzipEndpoint(filePath: string, label: string): () => Response {
  let gzipped: Uint8Array;
  try {
    // oxlint-disable-next-line node/no-sync
    const raw = readFileSync(filePath);
    // oxlint-disable-next-line node/no-sync
    gzipped = gzipSync(raw);
  } catch {
    console.error(`[kumidocs] Failed to load ${label} from ${filePath}`);
    gzipped = new Uint8Array(0);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const resp = new Response(gzipped as unknown as BodyInit, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Encoding": "gzip",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
  return (): Response => resp;
}

// Detect bundled vs dev by checking whether dist/public exists next to us.
const bundledPublic = path.join(import.meta.dir, "public");
// oxlint-disable-next-line node/no-sync
const publicDir = existsSync(bundledPublic)
  ? bundledPublic
  : path.join(import.meta.dir, "..", "..", "dist", "public");

const apiEmojis = createGzipEndpoint(path.join(publicDir, "emojis.txt"), "emoji data");

const apiIcons = createGzipEndpoint(path.join(publicDir, "icons.txt"), "icon packs");

// GET /api/sidebar
function apiSidebar(): Response {
  const content = getFile("_sidebar.md") ?? "";
  return Response.json({ content });
}

// GET /api/boards/tickets[?board=slug]
// oxlint-disable-next-line complexity
function apiAllTickets(url?: URL): Response {
  const tree = buildFileTree();
  const result: {
    boardName: string;
    boardPrefix: string;
    boardSlug: string;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    columns: { color: string; default?: boolean; final?: boolean; id: string }[];
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    tickets: Record<string, unknown>[];
  }[] = [];

  for (const configNode of tree) {
    if (
      configNode.type !== "file" ||
      !configNode.path.endsWith(".yaml") ||
      configNode.path.includes("/")
    ) {
      continue;
    }

    const slug = configNode.name.replace(/\.yaml$/u, "");
    const raw = getFile(configNode.path);
    if (raw === undefined) {
      continue;
    }

    let cfg: Record<string, unknown>;
    try {
      cfg = assertJsonObject(parseYaml(raw));
    } catch {
      continue;
    }

    const boardName = typeof cfg.name === "string" ? cfg.name : slug;
    const boardPrefix = typeof cfg.prefix === "string" ? cfg.prefix : slug;
    const columns: { color: string; default?: boolean; final?: boolean; id: string }[] = [];

    if (Array.isArray(cfg.columns)) {
      for (const col of cfg.columns) {
        if (typeof col !== "object" || col === null) {
          continue;
        }
        const colData = assertJsonObject(col);
        columns.push({
          color: typeof colData.color === "string" ? colData.color : "#6b7280",
          default: colData.default === true,
          final: colData.final === true,
          id: typeof colData.id === "string" ? colData.id : "",
        });
      }
    }

    const boardDir = tree.find((dirNode) => dirNode.type === "dir" && dirNode.name === slug);
    const tickets: Record<string, unknown>[] = [];

    if (boardDir?.children !== undefined) {
      for (const child of boardDir.children) {
        if (child.type !== "file" || !child.path.endsWith(".yaml")) {
          continue;
        }
        const ticketId = child.name.replace(/\.yaml$/u, "");
        const rawTicket = getFile(child.path);
        if (rawTicket === undefined) {
          continue;
        }
        try {
          const parsed = assertJsonObject(parseYaml(rawTicket));
          const defaultCol = columns.find((col) => col.default === true)?.id ?? "";
          tickets.push({
            assignee: typeof parsed.assignee === "string" ? parsed.assignee : undefined,
            boardSlug: slug,
            bookmarks: Array.isArray(parsed.bookmarks)
              ? parsed.bookmarks.filter((bm: unknown) => typeof bm === "string")
              : undefined,
            column: typeof parsed.column === "string" ? parsed.column : defaultCol,
            createdAt:
              typeof parsed.createdAt === "string" && parsed.createdAt !== ""
                ? parsed.createdAt
                : undefined,
            golden: parsed.golden === true,
            id: ticketId,
            reporter: typeof parsed.reporter === "string" ? parsed.reporter : undefined,
            title: typeof parsed.title === "string" ? parsed.title : ticketId,
            updatedAt:
              typeof parsed.updatedAt === "string" && parsed.updatedAt !== ""
                ? parsed.updatedAt
                : undefined,
          });
        } catch {
          // skip
        }
      }
    }

    result.push({ boardName, boardPrefix, boardSlug: slug, columns, tickets });
  }

  // Optionally filter to a single board
  const boardFilter = url?.searchParams.get("board");
  if (boardFilter !== undefined && boardFilter !== "") {
    const filtered = result.filter((entry) => entry.boardSlug === boardFilter);
    return Response.json(filtered);
  }

  return Response.json(result);
}

export { apiAllTickets, apiBacklinks, apiEmojis, apiIcons, apiMe, apiSearch, apiSidebar, apiTree };
export { apiFileCreate, apiFileDelete, apiFileGet, apiFilePut, apiFileRename } from "./api-file";
export { apiFileDiff, apiFileHistory } from "./api-history";
export {
  apiAvatarProxy,
  apiImageDelete,
  apiImagesList,
  apiUploadImage,
  serveRepoAsset,
} from "./api-images";
