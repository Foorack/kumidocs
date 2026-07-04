import { IMAGE_TYPES } from "@/lib/filetypes";
import { addToCache, deleteFileFromRepo, getAllPaths, getFile } from "./filestore";
import { gitRemoveAndCommit, gitStageAndCommit } from "./git";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config";
import type { User } from "@/lib/types";
import {
  doesFileExist,
  getFileSize,
  readTextFile,
  serveFileResponse,
  sha256Hex,
  writeFileBytes,
} from "./runtime";

async function apiUploadImage(req: Request, user: User, config: Config): Promise<Response> {
  if (!user.canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const MAX = 25 * 1024 * 1024;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const entry = formData.get("file");
  if (!(entry instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (entry.size > MAX) {
    return Response.json({ error: "File too large (max 25 MB)" }, { status: 413 });
  }

  const ext = path.extname(entry.name).toLowerCase();
  if (!IMAGE_TYPES.has(ext)) {
    return Response.json({ error: "File type not allowed" }, { status: 415 });
  }

  const bytes = await entry.arrayBuffer();
  const sha256 = sha256Hex(bytes);
  const filename = `${sha256}${ext}`;
  const repoPath = `images/${filename}`;
  const fullPath = path.join(config.repoPath, repoPath);

  await mkdir(path.join(config.repoPath, "images"), { recursive: true });
  await writeFileBytes(fullPath, bytes);
  addToCache(repoPath, "");

  const msg = `docs: upload image ${filename} by ${user.displayName}`;
  await gitStageAndCommit(
    config,
    [repoPath],
    msg,
    user.displayName,
    user.email || "kumidocs@localhost",
  );

  return Response.json({ path: repoPath, url: `/images/${filename}` });
}

// GET /api/images
async function apiImagesList(config: Config): Promise<Response> {
  const all = getAllPaths();
  const imagePaths = all.filter((filePath) => filePath.startsWith("images/"));
  const mdPaths = all.filter((filePath) => filePath.endsWith(".md"));

  const results = await Promise.all(
    imagePaths.map(async (repoPath) => {
      const filename = repoPath.slice("images/".length);
      // The sha256 portion is the part before the extension
      const dotIdx = filename.lastIndexOf(".");
      const sha256 = dotIdx === -1 ? filename : filename.slice(0, dotIdx);

      let size = 0;
      try {
        size = await getFileSize(path.join(config.repoPath, repoPath));
      } catch {
        // file may be transiently unavailable
      }

      const usedIn = mdPaths.filter((mdPath) => {
        const content = getFile(mdPath) ?? "";
        return content.includes(sha256);
      });

      return { filename, path: repoPath, size, url: `/images/${filename}`, usedIn };
    }),
  );

  return Response.json(results);
}

// DELETE /api/images/:filename
async function apiImageDelete(filename: string, user: User, config: Config): Promise<Response> {
  if (!user.canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate: only alphanumeric/hyphen SHA256 hex + extension, no path traversal
  if (!/^[0-9a-f]+\.[a-z0-9]+$/u.test(filename)) {
    return Response.json({ error: "Invalid filename" }, { status: 400 });
  }

  const repoPath = `images/${filename}`;
  const dotIdx = filename.lastIndexOf(".");
  const sha256 = dotIdx === -1 ? filename : filename.slice(0, dotIdx);

  const all = getAllPaths();
  if (!all.includes(repoPath)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Block deletion if any .md file references this image by its sha256 hash
  const mdPaths = all.filter((filePath) => filePath.endsWith(".md"));
  const usedIn = mdPaths.filter((mdPath) => {
    const content = getFile(mdPath) ?? "";
    return content.includes(sha256);
  });
  if (usedIn.length > 0) {
    return Response.json({ error: "Image is referenced by pages", usedIn }, { status: 409 });
  }

  await deleteFileFromRepo(repoPath, config);

  const msg = `docs: delete image ${filename} by ${user.displayName}`;
  await gitRemoveAndCommit(
    config,
    repoPath,
    msg,
    user.displayName,
    user.email || "kumidocs@localhost",
  );

  return Response.json({ ok: true });
}

/**
 * Strip executable content from SVG text before serving.
 * Applied at response time so stored files are never modified.
 *
 * Removes:
 *   - <script> elements (including CDATA content)
 *   - <foreignObject> blocks (can embed arbitrary HTML/JS)
 *   - <use> elements (can reference external SVGs with scripts)
 *   - <animate>, <animateTransform>, <animateMotion>, <set> elements (animation-based XSS)
 *   - on* event handler attributes (onload, onclick, onbegin, onend, etc.)
 *   - javascript: and data: URI values in href / xlink:href / action / src
 */
function sanitizeSvg(raw: string): string {
  return (
    raw
      // <script> blocks (any content, including CDATA)
      .replaceAll(/<script[\s\S]*?<\/script\s*>/giu, "")
      // self-closing <script ... />
      .replaceAll(/<script[^>]*\/>/giu, "")
      // <foreignObject> blocks (can embed arbitrary HTML/JS)
      .replaceAll(/<foreignObject[\s\S]*?<\/foreignObject\s*>/giu, "")
      // <use> elements (blocks + self-closing) can reference external SVGs with scripts
      .replaceAll(/<use[\s\S]*?<\/use\s*>/giu, "")
      .replaceAll(/<use[^>]*\/>/giu, "")
      // <animate>, <animateTransform>, <animateMotion>, <set> elements target animation-based XSS
      .replaceAll(
        /<(?:animate(?:Transform|Motion)?|set)[\s\S]*?<\/(?:animate(?:Transform|Motion)?|set)\s*>/giu,
        "",
      )
      .replaceAll(/<(?:animate(?:Transform|Motion)?|set)[^>]*\/>/giu, "")
      // on* event handler attributes (onload="...", onclick='...', onmouseover=foo, etc.)
      .replaceAll(/(?:^|\s)on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s/>]*)/giu, "")
      // javascript: and data: URIs in URL-type attributes
      .replaceAll(
        /(?<attr>(?:xlink:)?href|action|formaction|src|xlink:show)\s*=\s*(?:"(?:javascript|data):[^"]*"|'(?:javascript|data):[^']*')/giu,
        "",
      )
  );
}

// GET /images/:filename
async function serveRepoAsset(assetPath: string, config: Config): Promise<Response> {
  const imagesDir = path.resolve(config.repoPath, "images");
  const fullPath = path.resolve(config.repoPath, assetPath);
  // Restrict to the images/ subdirectory; isSafePath alone only prevents escaping
  // repoPath, so a crafted path like 'images/../.env' would otherwise be served.
  const imagesDirPrefix = `${imagesDir}/`;
  if (!fullPath.startsWith(imagesDirPrefix) || fullPath === imagesDir) {
    return new Response("Forbidden", { status: 403 });
  }
  const MIME: Record<string, string> = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  const ext = path.extname(assetPath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";

  if (!(await doesFileExist(fullPath))) {
    return new Response("Not found", { status: 404 });
  }

  // SVGs are sanitized in-memory at serve time so stored files are never mutated.
  // A restrictive CSP provides defence-in-depth in case the sanitizer misses anything.
  if (ext === ".svg") {
    const raw = await readTextFile(fullPath);
    const sanitized = sanitizeSvg(raw);
    return new Response(sanitized, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "Content-Type": "image/svg+xml",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return serveFileResponse(fullPath, {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
  });
}

// GET /api/avatar/:hash proxies Gravatar so the client never contacts Gravatar directly.
// The hash must be a 64-char lowercase hex string (SHA-256).
const avatarCache = new Map<string, { body: ArrayBuffer; type: string }>();

async function apiAvatarProxy(hash: string): Promise<Response> {
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    return new Response("Invalid hash", { status: 400 });
  }

  const cached = avatarCache.get(hash);
  if (cached !== undefined) {
    return new Response(cached.body, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": cached.type,
      },
    });
  }

  const upstream = await fetch(`https://gravatar.com/avatar/${hash}?s=80&d=404`);
  if (!upstream.ok) {
    return new Response(undefined, { status: 404 });
  }

  const body = await upstream.arrayBuffer();
  const type = upstream.headers.get("Content-Type") ?? "image/jpeg";
  avatarCache.set(hash, { body, type });

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": type,
    },
  });
}

export { apiUploadImage, apiImagesList, apiImageDelete, serveRepoAsset, apiAvatarProxy };
