import {
  apiAvatarProxy,
  apiBacklinks,
  apiFileCreate,
  apiFileDelete,
  apiFileDiff,
  apiFileGet,
  apiFileHistory,
  apiFilePut,
  apiEmojis,
  apiIconPack,
  apiFileRename,
  apiImageDelete,
  apiImagesList,
  apiMe,
  apiSearch,
  apiTree,
  apiUploadImage,
  serveRepoAsset,
} from "./api";
import { getJwtKids, makeUser } from "./auth";
import path from "node:path";
import RateLimiter from "./rate-limit";
import type { Config } from "./config";
import type { User } from "@/lib/types";
import { doesFileExist, mimeTypeFromPath, readFileBuffer, serveFileResponse } from "./runtime";
import publicDir from "./public-dir";
import apiEmojiSvg from "./api-emoji";

// No 'unsafe-inline' or 'unsafe-eval' in script-src: the page ships no inline
// script, so a missed sanitizer case cannot execute as script.
const SPA_CSP = `default-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self' ws: wss:`;

async function serveSPA(req: Request): Promise<Response> {
  const rel = new URL(req.url).pathname.replace(/^\/+/u, "") || "index.html";
  const filePath = path.resolve(publicDir, rel);
  if (!filePath.startsWith(publicDir + path.sep)) {
    return serveFileResponse(path.join(publicDir, "index.html"), {
      "Content-Security-Policy": SPA_CSP,
    });
  }
  if (await doesFileExist(filePath)) {
    // Prefer the precompressed copy written by scripts/build.ts.
    const gzPath = `${filePath}.gz`;
    const useGzip =
      rel !== "index.html" &&
      (req.headers.get("Accept-Encoding") ?? "").includes("gzip") &&
      (await doesFileExist(gzPath));
    const content = await readFileBuffer(useGzip ? gzPath : filePath);
    const headers: Record<string, string> =
      rel === "index.html"
        ? {
            "Content-Security-Policy": SPA_CSP,
            "Content-Type": "text/html; charset=utf-8",
          }
        : {
            "Cache-Control": "public, max-age=31536000, immutable",
          };
    const mime = mimeTypeFromPath(filePath);
    if (mime !== undefined && headers["Content-Type"] === undefined) {
      headers["Content-Type"] = mime;
    }
    if (useGzip) {
      headers["Content-Encoding"] = "gzip";
    }
    if (rel !== "index.html") {
      headers.Vary = "Accept-Encoding";
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return new Response(content as unknown as BodyInit, { headers });
  }
  return serveFileResponse(path.join(publicDir, "index.html"), {
    "Content-Security-Policy": SPA_CSP,
  });
}

type RequireUser = (req: Request) => User | undefined;

/**
 * Handles every request no explicit route matched. Unknown API paths get a
 * JSON 404 so clients see a real error instead of the SPA's index.html.
 */
async function serveCatchAll(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return serveSPA(req);
}

async function buildRoutes(
  config: Config,
  requireUser: RequireUser,
): Promise<Record<string, unknown>> {
  /** Authenticate and return the user, or return a 401 response. */
  function requireUserOr(req: Request): User | Response {
    const user = requireUser(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }
    return user;
  }

  /** Authenticate user and enforce rate limit. Returns user or error response. */
  function requireRateLimitOr(req: Request, limiter: RateLimiter): User | Response {
    const user = requireUser(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!limiter.check(user.id)) {
      return new Response("Too many requests", { status: 429 });
    }
    return user;
  }
  /** Per-user rate limiter with configurable limits. */
  const mutationLimiter = new RateLimiter(config.rateLimit.count, config.rateLimit.windowMs);
  const routes: Record<string, unknown> = {
    // oxlint-disable sort-keys -- Route patterns must be ordered for match priority, not alphabetically.
    "/api/auth/email": {
      async POST(req: Request) {
        // The cookie is a fallback identity for instances with no proxy. If the
        // proxy already supplied one, minting a second would let a read-only
        // user turn themselves into an editor. The same goes for instances
        // that require signed JWTs.
        const forwarded = (req.headers.get(config.authHeader) ?? "").trim();
        if (forwarded !== "" || getJwtKids() !== undefined) {
          return new Response("Forbidden", { status: 403 });
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const rawEmail = (body as Record<string, unknown>).email;
        if (typeof rawEmail !== "string" || rawEmail === "") {
          return new Response("Bad request", { status: 400 });
        }
        const email = rawEmail.trim().toLowerCase();
        // Max email length per RFC 5321 (path element, excluding angle brackets).
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
          return new Response("Bad request", { status: 400 });
        }
        const user = makeUser(email);
        const secureFlag = req.url.startsWith("https:") ? "; Secure" : "";
        const cookie = `kumidocs_email=${encodeURIComponent(email)}; Path=/; SameSite=Lax; HttpOnly${secureFlag}`;
        const res = await apiMe(user, config);
        const headers = new Headers(res.headers);
        headers.set("Set-Cookie", cookie);
        return new Response(await res.text(), { headers, status: res.status });
      },
    },

    "/api/avatar/:hash": {
      async GET(req: Request) {
        const hash = new URL(req.url).pathname.slice("/api/avatar/".length);
        return apiAvatarProxy(hash, !config.disableGravatar);
      },
    },

    "/api/backlinks": {
      async GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiBacklinks(new URL(req.url));
      },
    },

    "/api/emojis": {
      GET() {
        return apiEmojis();
      },
    },

    "/api/emoji/:file": {
      async GET(req: Request) {
        const file = new URL(req.url).pathname.slice("/api/emoji/".length);
        return apiEmojiSvg(req, file);
      },
    },
    "/api/file": {
      async DELETE(req: Request) {
        const user = requireRateLimitOr(req, mutationLimiter);
        if (user instanceof Response) {
          return user;
        }
        return apiFileDelete(new URL(req.url), user, config);
      },
      async GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiFileGet(new URL(req.url), config);
      },
      async POST(req: Request) {
        const user = requireRateLimitOr(req, mutationLimiter);
        if (user instanceof Response) {
          return user;
        }
        return apiFileCreate(req, user, config);
      },
      async PUT(req: Request) {
        const user = requireRateLimitOr(req, mutationLimiter);
        if (user instanceof Response) {
          return user;
        }
        return apiFilePut(new URL(req.url), req, user, config);
      },
    },

    "/api/file/diff": {
      async GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiFileDiff(new URL(req.url), config);
      },
    },

    "/api/file/history": {
      async GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiFileHistory(new URL(req.url), config);
      },
    },

    "/api/file/rename": {
      async POST(req: Request) {
        const user = requireRateLimitOr(req, mutationLimiter);
        if (user instanceof Response) {
          return user;
        }
        return apiFileRename(req, user, config);
      },
    },

    "/api/icons/:pack": {
      GET(req: Request) {
        const pack = new URL(req.url).pathname.slice("/api/icons/".length);
        return apiIconPack(pack);
      },
    },

    "/api/images": {
      async GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiImagesList(config);
      },
    },

    "/api/images/:filename": {
      async DELETE(req: Request) {
        const user = requireRateLimitOr(req, mutationLimiter);
        if (user instanceof Response) {
          return user;
        }
        const filename = new URL(req.url).pathname.slice("/api/images/".length);
        return apiImageDelete(decodeURIComponent(filename), user, config);
      },
    },

    "/api/me": {
      async GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiMe(user, config);
      },
    },

    "/api/search": {
      GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiSearch(new URL(req.url));
      },
    },

    "/api/tree": {
      GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        return apiTree();
      },
    },

    "/api/upload/image": {
      async POST(req: Request) {
        const user = requireRateLimitOr(req, mutationLimiter);
        if (user instanceof Response) {
          return user;
        }
        return apiUploadImage(req, user, config);
      },
    },

    "/images/:filename": {
      async GET(req: Request) {
        const user = requireUserOr(req);
        if (user instanceof Response) {
          return user;
        }
        const filename = decodeURIComponent(new URL(req.url).pathname.slice("/images/".length));
        return serveRepoAsset(`images/${filename}`, config);
      },
    },

    "/favicon.ico": {
      async GET() {
        const filePath = path.join(publicDir, "icon.png");
        return serveFileResponse(filePath, {
          "Cache-Control": "public, max-age=31536000, immutable",
        });
      },
    },
  };
  // oxlint-enable sort-keys

  return routes;
}

export { serveCatchAll, serveSPA };
export default buildRoutes;
