import { expect, test } from "@playwright/test";

test.describe("emoji", () => {
  test("page emoji load one by one, without the full emoji set", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/emoji")) {
        requests.push(new URL(req.url()).pathname);
      }
    });
    await page.goto("/p/README.md");

    // 🏠 is the README's page emoji, shown in the sidebar and the page header.
    // Both copies are plain <img> loads, so waiting until every one of them has
    // decoded means the sidebar tree and the page body both rendered. A code
    // path that pulled the full set would have started by then.
    await expect
      .poll(async () =>
        page
          .getByRole("img", { exact: true, name: "🏠" })
          .evaluateAll(
            (images: HTMLImageElement[]) => images.filter((img) => img.naturalWidth > 0).length,
          ),
      )
      .toBeGreaterThanOrEqual(2);
    expect(requests).toContain("/api/emoji/1f3e0.svg");
    expect(requests).not.toContain("/api/emojis");
  });

  test("an unknown emoji key is a 404, not the app page", async ({ request }) => {
    const res = await request.get("/api/emoji/zzz.svg");
    expect(res.status()).toBe(404);
  });

  test("opening the emoji picker loads the full set", async ({ page }) => {
    await page.goto("/p/notes");
    await page.getByRole("button", { exact: true, name: "Edit" }).click();

    const fullSet = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/emojis");
    await page.getByRole("button", { name: "Change page emoji" }).click();
    await fullSet;
    await expect(page.getByRole("dialog").getByRole("img").first()).toBeVisible();
  });
});
