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
  apiIcons,
  apiFileRename,
  apiImageDelete,
  apiImagesList,
  apiMe,
  apiPagesLookup,
  apiSearch,
  apiSidebar,
  apiTree,
  apiUploadImage,
  serveRepoAsset,
} from "./api";
import { makeUser } from "./auth";
import path from "node:path";
import RateLimiter from "./rate-limit";
import type { Config } from "./config";
import type { User } from "@/lib/types";
import { doesFileExist, mimeTypeFromPath, readFileBuffer, serveFileResponse } from "./runtime";

const SPA_CSP = `default-src 'self'; img-src 'self' https: http: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; font-src 'self' data:; connect-src 'self' ws: wss:`;

// Resolve the public directory relative to this module.
// import.meta.dir is src/server/ so ../../dist/public = dist/public/.
// In dev, ensure you run `bun run build` first, or set KUMIDOCS_PUBLIC_DIR.
const publicDir =
  // oxlint-disable-next-line unicorn/no-process-env
  process.env.KUMIDOCS_PUBLIC_DIR ?? path.join(import.meta.dir, "..", "..", "dist", "public");

async function serveSPA(req: Request): Promise<Response> {
  const rel = new URL(req.url).pathname.replace(/^\/+/u, "") || "index.html";
  const filePath = path.join(publicDir, rel);
  if (!filePath.startsWith(publicDir + path.sep)) {
    return serveFileResponse(path.join(publicDir, "index.html"), {
      "Content-Security-Policy": SPA_CSP,
    });
  }
  if (await doesFileExist(filePath)) {
    const content = await readFileBuffer(filePath);
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return new Response(content as unknown as BodyInit, { headers });
  }
  return serveFileResponse(path.join(publicDir, "index.html"), {
    "Content-Security-Policy": SPA_CSP,
  });
}

type RequireUser = (req: Request) => User | undefined;

/** Serves the SPA entry point in production (bundled) mode. */
async function serveCatchAll(req: Request): Promise<Response> {
  return serveSPA(req);
}

async function buildRoutes(
  config: Config,
  requireUser: RequireUser,
): Promise<Record<string, unknown>> {
  /** Per-user rate limiter with configurable limits. */
  const mutationLimiter = new RateLimiter(config.rateLimit.count, config.rateLimit.windowMs);
  mutationLimiter.startCleanup();
  const routes: Record<string, unknown> = {
    "/api/auth/email": {
      async POST(req: Request) {
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
        if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
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
        return apiAvatarProxy(hash);
      },
    },

    "/api/backlinks": {
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiBacklinks(new URL(req.url));
      },
    },

    "/api/emojis": {
      GET() {
        return apiEmojis();
      },
    },
    "/api/file": {
      async DELETE(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!mutationLimiter.check(user.id)) {
          return new Response("Too many requests", { status: 429 });
        }
        return apiFileDelete(new URL(req.url), user, config);
      },
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiFileGet(new URL(req.url), config);
      },
      async POST(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!mutationLimiter.check(user.id)) {
          return new Response("Too many requests", { status: 429 });
        }
        return apiFileCreate(req, user, config);
      },
      async PUT(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!mutationLimiter.check(user.id)) {
          return new Response("Too many requests", { status: 429 });
        }
        return apiFilePut(new URL(req.url), req, user, config);
      },
    },

    "/api/file/diff": {
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiFileDiff(new URL(req.url), config);
      },
    },

    "/api/file/history": {
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiFileHistory(new URL(req.url), config);
      },
    },

    "/api/file/rename": {
      async POST(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!mutationLimiter.check(user.id)) {
          return new Response("Too many requests", { status: 429 });
        }
        return apiFileRename(req, user, config);
      },
    },

    "/api/icons": {
      GET() {
        return apiIcons();
      },
    },

    "/api/images": {
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiImagesList(config);
      },
    },

    "/api/images/:filename": {
      async DELETE(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!mutationLimiter.check(user.id)) {
          return new Response("Too many requests", { status: 429 });
        }
        const filename = new URL(req.url).pathname.slice("/api/images/".length);
        return apiImageDelete(decodeURIComponent(filename), user, config);
      },
    },

    "/api/me": {
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiMe(user, config);
      },
    },

    "/api/pages/lookup": {
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiPagesLookup();
      },
    },

    "/api/search": {
      GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiSearch(new URL(req.url));
      },
    },

    "/api/sidebar": {
      GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiSidebar();
      },
    },

    "/api/tree": {
      GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return apiTree();
      },
    },

    "/api/upload/image": {
      async POST(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!mutationLimiter.check(user.id)) {
          return new Response("Too many requests", { status: 429 });
        }
        return apiUploadImage(req, user, config);
      },
    },

    "/images/:filename": {
      async GET(req: Request) {
        const user = requireUser(req);
        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const filename = decodeURIComponent(new URL(req.url).pathname.slice("/images/".length));
        return serveRepoAsset(`images/${filename}`, config);
      },
    },
  };

  return routes;
}

export { serveCatchAll, serveSPA };
export default buildRoutes;
