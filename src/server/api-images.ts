import { IMAGE_TYPES, MAGIC_BYTES } from "@/lib/filetypes";
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
import { parseHTML } from "linkedom";

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

  const header = new Uint8Array(await entry.slice(0, 12).arrayBuffer());
  const signatures = MAGIC_BYTES[ext];
  if (signatures !== undefined) {
    const match = signatures.some((sig) => {
      if (sig.length > header.length) {
        return false;
      }
      return sig.every((byte, i) => header[i] === byte);
    });
    if (!match) {
      return Response.json({ error: "File content does not match extension" }, { status: 415 });
    }
    // WEBP needs an additional check: bytes 8-11 must be "WEBP"
    if (ext === ".webp") {
      const webpId = new TextDecoder().decode(header.slice(8, 12));
      if (webpId !== "WEBP") {
        return Response.json({ error: "File content does not match extension" }, { status: 415 });
      }
    }
  }
  // SVG content validation is handled by the sanitizer later.
  // Other formats without a magic-bytes entry are accepted as-is.

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
 * Strip dangerous content from SVGs before serving.
 * Applied at response time so stored files are untouched.
 *
 * Uses a proper XML DOM parser (linkedom) instead of regex, which
 * correctly handles edge cases like CDATA sections, HTML entities,
 * namespace tricks, and nested elements that regex cannot reliably parse.
 *
 * Whitelist approach: only known-safe SVG elements are kept, and
 * dangerous attributes (event handlers, javascript: URIs) are removed.
 */

// SVG elements that are safe to render. Absent elements are stripped.
const SAFE_SVG_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "textpath",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "pattern",
  "filter",
  "fegaussianblur",
  "feoffset",
  "feblend",
  "fecolormatrix",
  "fecomposite",
  "feflood",
  "feturbulence",
  "fedisplacementmap",
  "fedropshadow",
  "fecomponenttransfer",
  "fefunca",
  "fefuncr",
  "fefuncg",
  "fefuncb",
  "femerge",
  "femergenode",
  "clipPath",
  "mask",
  "marker",
  "symbol",
  "use",
  "switch",
  "title",
  "desc",
  "metadata",
  "style",
]);

// Index page-type resources (external images) are not allowed.
// Events and URI-based attacks are blocked via attribute checks.
const URI_ATTRIBUTES = new Set(["href", "xlink:href", "src", "action", "formaction", "xlink:show"]);
const EVENT_HANDLER_RE = /^on\w+$/iu;
const SAFE_URI_RE = /^(?:https?|ftp|mailto|tel|#|[^:]*)$/iu;

function sanitizeSvg(raw: string): string {
  try {
    const { document } = parseHTML(raw);

    const walker = (el: Element): void => {
      const tagName = el.tagName.toLowerCase();

      // Strip disallowed elements entirely
      if (!SAFE_SVG_ELEMENTS.has(tagName)) {
        el.replaceWith("");
        return;
      }

      // For <use> elements, only allow fragment-only hrefs (#id)
      if (tagName === "use") {
        for (const attr of ["href", "xlink:href"] as const) {
          const val = el.getAttribute(attr);
          if (val !== null && val !== "" && !val.startsWith("#")) {
            el.removeAttribute(attr);
          }
        }
      }

      // Remove dangerous attributes
      const attrs = [...el.attributes] as { name: string; value: string }[];
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        // Remove event handlers (onclick, onload, onerror, etc.)
        if (EVENT_HANDLER_RE.test(name)) {
          el.removeAttribute(attr.name);
          continue;
        }

        // Validate URI attributes
        if (URI_ATTRIBUTES.has(name)) {
          const trimmed = value.trim().toLowerCase();
          if (!SAFE_URI_RE.test(trimmed)) {
            el.removeAttribute(attr.name);
          }
        }
      }

      // Recurse into children (snapshot because we may mutate)
      const children = [...el.children];
      for (const child of children) {
        walker(child);
      }
    };

    const svgEl = document.querySelector("svg");
    if (!svgEl) {
      return "";
    }

    walker(svgEl);
    return svgEl.outerHTML;
  } catch {
    // If parsing fails, return empty string -- don't serve malformed SVG.
    return "";
  }
}

// GET /images/:filename
async function serveRepoAsset(assetPath: string, config: Config): Promise<Response> {
  const imagesDir = path.resolve(config.repoPath, "images");
  const fullPath = path.resolve(config.repoPath, assetPath);
  // Only serve from images/; isSafePath alone doesn't stop 'images/../.env'.
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

  // SVGs are sanitized in-memory on serve so stored files are never modified.
  // CSP provides defense-in-depth if the sanitizer misses something.
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
// Capped at 200 entries to prevent unbounded memory growth.
const AVATAR_CACHE_MAX = 200;
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

  // Evict oldest entry when at capacity
  if (avatarCache.size >= AVATAR_CACHE_MAX) {
    const firstKey = avatarCache.keys().next().value;
    if (firstKey !== undefined) {
      avatarCache.delete(firstKey);
    }
  }
  avatarCache.set(hash, { body, type });

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": type,
    },
  });
}

export { apiUploadImage, apiImagesList, apiImageDelete, serveRepoAsset, apiAvatarProxy };
