import { expect, test } from "@playwright/test";

test.describe("api", () => {
  test("/api/me describes the current user and instance", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(200);
    const me: unknown = await res.json();
    expect(me).toMatchObject({
      canEdit: true,
      email: "editor@example.com",
      instanceName: "E2E Docs",
    });
  });

  test("search returns matching pages", async ({ request }) => {
    const res = await request.get("/api/search?q=pineapple");
    expect(res.status()).toBe(200);
    const results: unknown = await res.json();
    expect(results).toEqual([expect.objectContaining({ path: "notes.md", title: "Notes" })]);
  });

  test("unknown API paths return a JSON 404", async ({ request }) => {
    const res = await request.get("/api/does-not-exist");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("a known path with the wrong method returns 405 with Allow", async ({ request }) => {
    const res = await request.delete("/api/me");
    expect(res.status()).toBe(405);
    expect(res.headers().allow).toBe("GET");
  });

  // Regression: these endpoints once reused a single Response object, so the
  // second request crashed the whole server.
  test("emoji and icon data can be fetched repeatedly", async ({ request }) => {
    for (let round = 0; round < 3; round++) {
      for (const endpoint of ["/api/emojis", "/api/icons"]) {
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
