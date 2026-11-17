import { expect, test } from "@playwright/test";
import { EDITOR } from "./support/env";
import search from "./support/search";

test.describe("api", () => {
  test("/api/me describes the current user and instance", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(200);
    const me: unknown = await res.json();
    expect(me).toMatchObject({
      canEdit: true,
      email: EDITOR,
      gravatar: false,
      instanceName: "E2E Docs",
    });
  });

  test("with Gravatar disabled, avatars are never requested", async ({ page, request }) => {
    const avatarRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/avatar/")) {
        avatarRequests.push(req.url());
      }
    });
    const meResponse = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/me");
    await page.goto("/p/notes");
    // The gravatar flag comes from /api/me, so the header cannot build an
    // avatar URL before this response lands. Waiting for it makes the empty
    // request list mean something instead of being read too early.
    const meBody = await meResponse;
    const me: unknown = await meBody.json();
    expect(me).toMatchObject({ gravatar: false });
    await expect(page.getByRole("banner").getByText("ED", { exact: true })).toBeVisible();
    expect(avatarRequests).toEqual([]);

    const res = await request.get(`/api/avatar/${"a".repeat(64)}`);
    expect(res.status()).toBe(404);
  });

  test("search returns matching pages", async ({ request }) => {
    const res = await request.get("/api/search?q=pineapple");
    expect(res.status()).toBe(200);
    const results: unknown = await res.json();
    expect(results).toEqual([expect.objectContaining({ path: "notes.md", title: "Notes" })]);
  });

  test("search snippets are plain text, without Markdown syntax", async ({ request }) => {
    const [hit] = await search(request, "pineapple");
    expect(hit?.snippet).toContain("The word pineapple only appears on this page.");
    for (const markup of ["```", "|", "![", "- [x]"]) {
      expect(hit?.snippet).not.toContain(markup);
    }
  });

  test("search finds words inside code blocks and snake_case identifiers", async ({ request }) => {
    const codeHits = await search(request, "answer");
    expect(codeHits.map((hit) => hit.path)).toContain("notes.md");

    const [snakeHit] = await search(request, "cache_dir");
    expect(snakeHit?.path).toBe("guide/setup.md");
  });

  test("unknown API paths return a JSON 404", async ({ request }) => {
    const res = await request.get("/api/does-not-exist");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("a known path with the wrong method returns 405 with Allow", async ({ request }) => {
    const res = await request.delete("/api/me");
    expect(res.status()).toBe(405);
    expect(res.headers().allow).toBe("GET, HEAD");
  });

  test("HEAD is answered wherever GET is, without a body", async ({ request }) => {
    for (const path of ["/api/me", "/favicon.ico", "/p/README.md"]) {
      const res = await request.head(path);
      expect(res.status(), path).toBe(200);
      const body = await res.body();
      expect(body.length, path).toBe(0);
    }
  });

  test("scripts are served gzip-compressed to clients that accept it", async ({ request }) => {
    const index = await request.get("/");
    const html = await index.text();
    const script = /<script type="module"[^>]*src="\.\/(?<src>[^"]+)"/u.exec(html)?.groups?.src;
    expect(script).toBeDefined();

    const gzipped = await request.get(`/${String(script)}`, {
      headers: { "Accept-Encoding": "gzip" },
    });
    expect(gzipped.status()).toBe(200);
    expect(gzipped.headers()["content-encoding"]).toBe("gzip");
    expect(gzipped.headers().vary).toBe("Accept-Encoding");
  });

  // Regression: these endpoints once reused a single Response object, so the
  // second request crashed the whole server.
  test("emoji and icon data can be fetched repeatedly", async ({ request }) => {
    for (let round = 0; round < 3; round++) {
      for (const endpoint of ["/api/emojis", "/api/icons/devicon"]) {
        const res = await request.get(endpoint);
        expect(res.status(), `${endpoint} round ${String(round)}`).toBe(200);
        const body = await res.body();
        expect(body.length).toBeGreaterThan(1000);
      }
    }
    const me = await request.get("/api/me");
    expect(me.status()).toBe(200);
  });
});
