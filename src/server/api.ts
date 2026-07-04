import { gzipSync } from "bun";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apiBacklinks, apiPagesLookup } from "./backlinks";
import { buildFileTree, getFile } from "./filestore";
import type { Config } from "./config";
import type { User } from "@/lib/types";
import { getHeadSha } from "./git";
import { getPermissions } from "./auth";
import { searchDocs } from "./search";

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
    pageTemplates: perms.pageTemplates ?? {},
    sidebarDefaultDepth: perms.sidebarDefaultDepth ?? 2,
    slideThemes: perms.slideThemes ?? {},
  });
}

// GET /api/tree
function apiTree(): Response {
  return Response.json(buildFileTree());
}

// GET /api/search?q=<query>
function apiSearch(url: URL): Response {
  const query = url.searchParams.get("q") ?? "";
  return Response.json(searchDocs(query));
}

// GET /api/emojis
// Serves the emoji text file gzip-compressed on-the-fly.
let emojiGzipped: Uint8Array | undefined;
const emojiFilePath = path.join(import.meta.dir, "..", "..", "dist", "public", "emojis.txt");

function apiEmojis(): Response {
  try {
    if (!emojiGzipped) {
      // oxlint-disable-next-line node/no-sync
      const raw = readFileSync(emojiFilePath);
      // oxlint-disable-next-line node/no-sync
      emojiGzipped = gzipSync(raw);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return new Response(emojiGzipped as unknown as BodyInit, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Encoding": "gzip",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch {
    return new Response("Emoji data not found", { status: 404 });
  }
}

// GET /api/icons
// Serves the combined icon packs text file gzip-compressed on-the-fly.
let iconsGzipped: Uint8Array | undefined;
const iconsFilePath = path.join(import.meta.dir, "..", "..", "dist", "public", "icons.txt");

function apiIcons(): Response {
  try {
    if (!iconsGzipped) {
      // oxlint-disable-next-line node/no-sync
      const raw = readFileSync(iconsFilePath);
      // oxlint-disable-next-line node/no-sync
      iconsGzipped = gzipSync(raw);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return new Response(iconsGzipped as unknown as BodyInit, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Encoding": "gzip",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch {
    return new Response("Icon data not found", { status: 404 });
  }
}

// GET /api/sidebar
function apiSidebar(): Response {
  const content = getFile("_sidebar.md") ?? "";
  return Response.json({ content });
}

export { apiBacklinks, apiEmojis, apiIcons, apiMe, apiPagesLookup, apiSearch, apiSidebar, apiTree };
export { apiFileCreate, apiFileDelete, apiFileGet, apiFilePut, apiFileRename } from "./api-file";
export { apiFileDiff, apiFileHistory } from "./api-history";
export {
  apiAvatarProxy,
  apiImageDelete,
  apiImagesList,
  apiUploadImage,
  serveRepoAsset,
} from "./api-images";
