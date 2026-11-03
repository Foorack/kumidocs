import { gzipSync } from "bun";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { apiBacklinks } from "./backlinks";
import { buildFileTree } from "./filestore";
import type { Config } from "./config";
import type { User } from "@/lib/types";
import { getHeadSha } from "./git";
import { getJwtKids, getPermissions } from "./auth";
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
    gravatar: !config.disableGravatar,
    headSha,
    instanceName: perms.instanceName ?? "KumiDocs",
    jwtKids: getJwtKids(),
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

// GET /api/search?q=<query>
function apiSearch(url: URL): Response {
  const query = url.searchParams.get("q") ?? "";
  return Response.json(searchDocs(query, 20));
}

// Helper: eagerly read + gzip a text file at module init, serve from cache.
// Only the bytes are cached. A Response body can be read once, so each
// request needs its own Response.
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
  return (): Response =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    new Response(gzipped as unknown as BodyInit, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Encoding": "gzip",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
}

// Detect bundled vs dev by checking whether dist/public exists next to us.
const bundledPublic = path.join(import.meta.dir, "public");
// oxlint-disable-next-line node/no-sync
const publicDir = existsSync(bundledPublic)
  ? bundledPublic
  : path.join(import.meta.dir, "..", "..", "dist", "public");

const apiEmojis = createGzipEndpoint(path.join(publicDir, "emojis.txt"), "emoji data");

const apiIcons = createGzipEndpoint(path.join(publicDir, "icons.txt"), "icon packs");

export { apiBacklinks, apiEmojis, apiIcons, apiMe, apiSearch, apiTree };
export { apiFileCreate, apiFileDelete, apiFileGet, apiFilePut, apiFileRename } from "./api-file";
export { apiFileDiff, apiFileHistory } from "./api-history";
export {
  apiAvatarProxy,
  apiImageDelete,
  apiImagesList,
  apiUploadImage,
  serveRepoAsset,
} from "./api-images";
