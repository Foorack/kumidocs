import { expect, test } from "./support/test";

test.describe("theme", () => {
  // No explicit console check here: the shared fixture fails the test if the
  // page logs an error while the theme is switched and restored.
  test("the header toggle switches the theme and the choice survives a reload", async ({
    page,
  }) => {
    await page.goto("/p/README.md");
    const root = page.locator("html");
    const toggle = page.getByRole("button", { name: "Toggle theme" });
    await expect(root).not.toHaveClass(/dark/u);

    await toggle.click();
    await expect(root).toHaveClass(/dark/u);
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("kumidocs:theme")))
      .toBe("dark");

    await page.reload();
    await expect(root).toHaveClass(/dark/u);

    await toggle.click();
    await expect(root).not.toHaveClass(/dark/u);
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("kumidocs:theme")))
      .toBe("light");
  });
});
