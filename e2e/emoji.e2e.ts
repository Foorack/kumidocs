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
    const house = page.getByRole("main").getByRole("img", { exact: true, name: "🏠" }).first();
    await expect(house).toBeVisible();
    await expect
      .poll(async () => house.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
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
