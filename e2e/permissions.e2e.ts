import { expect, test } from "@playwright/test";
import { VIEWER, asUser } from "./support/env";

test.describe("a user who is not in the editors list", () => {
  test.use({ extraHTTPHeaders: asUser(VIEWER) });

  test("can read pages but sees no edit or create actions", async ({ page }) => {
    await page.goto("/p/notes");
    await expect(page.getByRole("heading", { level: 1, name: "Notes" }).first()).toBeVisible();

    await expect(page.getByRole("button", { exact: true, name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New page" })).toHaveCount(0);

    await page.getByRole("button", { name: "More actions" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Move" })).toHaveCount(0);
  });

  test("is rejected by the write API", async ({ request }) => {
    const put = await request.put("/api/file?path=notes.md", { data: { content: "hacked" } });
    expect(put.status()).toBe(403);

    const post = await request.post("/api/file", {
      data: { content: "x", path: "viewer-made.md" },
    });
    expect(post.status()).toBe(403);

    const del = await request.delete("/api/file?path=notes.md");
    expect(del.status()).toBe(403);
  });
});

test.describe("an anonymous request", () => {
  test.use({ extraHTTPHeaders: {} });

  test("gets 401 from the API", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(401);
  });
});
