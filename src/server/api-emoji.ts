/**
 * GET /api/emoji/:key.svg serves one Fluent Emoji SVG.
 *
 * emojis.txt holds every emoji as one "<emoji>;<svg>" line, about 39 MB in
 * total. Holding it in memory would be wasteful, so at startup we only record
 * where each SVG starts and ends in the file, then read that slice per request.
 * Browsers cache the result for a year, so each emoji is fetched once.
 */
import { emojiKey } from "@/lib/emoji-key";
import path from "node:path";
import publicDir from "./public-dir";
import { readFileSync } from "node:fs";

const emojiFile = path.join(publicDir, "emojis.txt");

const NEWLINE = "\n".codePointAt(0) ?? 0;
const SEMICOLON = ";".codePointAt(0) ?? 0;

/** Byte range of each emoji's SVG in emojis.txt, keyed by emojiKey(). */
function buildIndex(): Map<string, { start: number; end: number }> {
  const index = new Map<string, { start: number; end: number }>();
  let bytes: Uint8Array;
  try {
    // oxlint-disable-next-line node/no-sync
    bytes = readFileSync(emojiFile);
  } catch {
    console.error(`[kumidocs] Failed to index emoji data from ${emojiFile}`);
    return index;
  }
  const decoder = new TextDecoder();
  let lineStart = 0;
  while (lineStart < bytes.length) {
    let lineEnd = bytes.indexOf(NEWLINE, lineStart);
    if (lineEnd === -1) {
      lineEnd = bytes.length;
    }
    const semi = bytes.indexOf(SEMICOLON, lineStart);
    if (semi !== -1 && semi < lineEnd) {
      const native = decoder.decode(bytes.subarray(lineStart, semi));
      index.set(emojiKey(native), { end: lineEnd, start: semi + 1 });
    }
    lineStart = lineEnd + 1;
  }
  return index;
}

const emojiIndex = buildIndex();

// Popular emoji (page icons, the sidebar) are asked for over and over.
const GZIP_CACHE_MAX = 300;
const gzipCache = new Map<string, Uint8Array>();

const SVG_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  // Opened directly, an SVG is a document. Never let one run scripts.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  "Content-Type": "image/svg+xml",
  Vary: "Accept-Encoding",
  "X-Content-Type-Options": "nosniff",
};

async function apiEmojiSvg(req: Request, file: string): Promise<Response> {
  const key = file.replace(/\.svg$/u, "");
  const range = emojiIndex.get(key);
  if (range === undefined) {
    return new Response("Not found", { status: 404 });
  }
  const acceptsGzip = (req.headers.get("Accept-Encoding") ?? "").includes("gzip");

  let gzipped = gzipCache.get(key);
  if (gzipped === undefined || !acceptsGzip) {
    const svg = await Bun.file(emojiFile).slice(range.start, range.end).bytes();
    if (!acceptsGzip) {
      return new Response(svg, { headers: SVG_HEADERS });
    }
    const stream = new Blob([svg]).stream().pipeThrough(new CompressionStream("gzip"));
    gzipped = await new Response(stream).bytes();
    if (gzipCache.size >= GZIP_CACHE_MAX) {
      const oldest = gzipCache.keys().next().value;
      if (oldest !== undefined) {
        gzipCache.delete(oldest);
      }
    }
    gzipCache.set(key, gzipped);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return new Response(gzipped as unknown as BodyInit, {
    headers: { ...SVG_HEADERS, "Content-Encoding": "gzip" },
  });
}

export default apiEmojiSvg;
