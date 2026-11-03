import { expect, test } from "@playwright/test";

test.describe("search", () => {
  test("Ctrl+K finds a page by its body text and opens it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await palette.getByRole("combobox").fill("pineapple");

    const result = palette.getByRole("option").filter({ hasText: "notes.md" });
    await expect(result).toBeVisible();
    await expect(palette.getByRole("option")).toHaveCount(1);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/p\/notes\.md$/u);
    await expect(palette).toBeHidden();
  });

  test("the header search button opens the palette", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Search/u }).click();
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
  });

  test("a query with no matches says so", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Search/u }).click();
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await palette.getByRole("combobox").fill("zzqqxx");
    await expect(palette.getByText('No results for "zzqqxx".')).toBeVisible();
  });
});
