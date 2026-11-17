import { expect, test } from "@playwright/test";
import { EDITOR, asUser, instances } from "./support/env";

test.use({ baseURL: instances.readonly.baseURL, extraHTTPHeaders: asUser(EDITOR) });

test.describe("a readonly instance", () => {
  test("reports that even an editor cannot edit", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ canEdit: false, email: EDITOR });
  });

  test("hides every editing action in the UI", async ({ page }) => {
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

  test("rejects writes from the API", async ({ request }) => {
    const put = await request.put("/api/file?path=notes.md", { data: { content: "hacked" } });
    expect(put.status()).toBe(403);

    const post = await request.post("/api/file", {
      data: { content: "x", path: "readonly-made.md" },
    });
    expect(post.status()).toBe(403);

    const del = await request.delete("/api/file?path=notes.md");
    expect(del.status()).toBe(403);
  });
});
