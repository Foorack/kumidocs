import { expect, test } from "@playwright/test";

test.describe("icon galleries", () => {
  // Thousands of SVGs: give these pages room when workers run in parallel.
  test.slow();

  for (const { path, heading, min } of [
    { heading: "Icons", min: 1000, path: "/icons" },
    { heading: "Emoji", min: 1000, path: "/emoji" },
    { heading: "Fluent Icons", min: 100, path: "/fluenticons" },
  ]) {
    test(`${path} lists its icons and names the hovered one`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();

      const total = page.getByText(/^\d+ total$/u);
      await expect(total).not.toHaveText("0 total", { timeout: 15_000 });
      const totalText = await total.textContent();
      const count = Number(totalText?.split(" ")[0]);
      expect(count).toBeGreaterThan(min);

      const first = page.getByRole("main").getByRole("img").first();
      await first.hover();
      const name = await first.getAttribute("alt");
      await expect(page.getByText(String(name), { exact: true }).first()).toBeVisible();
    });
  }

  // Regression: rendering thousands of SVGs without content-visibility froze
  // the tab, so leaving /icons took 20 seconds or more.
  test("leaving a gallery is quick", async ({ page }) => {
    await page.goto("/icons");
    await expect(page.getByText(/^\d+ total$/u)).not.toHaveText("0 total", { timeout: 15_000 });
    await page.locator("aside").first().getByRole("link", { exact: true, name: "Notes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Notes" }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
