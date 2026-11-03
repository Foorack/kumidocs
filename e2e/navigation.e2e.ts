import { expect, test } from "@playwright/test";

test.describe("navigation", () => {
  test("the root redirects to the README", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/p\/README\.md$/u);
    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome to E2E Docs" }).first(),
    ).toBeVisible();
    await expect(page).toHaveTitle("Welcome to E2E Docs | E2E Docs");
  });

  test("the sidebar lists every page and navigates to it", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside").first();
    for (const title of [
      "Welcome to E2E Docs",
      "Guide",
      "Setup",
      "Advanced Topics",
      "Notes",
      "First Slide",
      "data.csv",
      "diagram.kumidraw",
      "flow.mermaid",
      "script.ts",
    ]) {
      await expect(sidebar.getByRole("link", { exact: true, name: title })).toBeVisible();
    }

    await sidebar.getByRole("link", { exact: true, name: "Notes" }).click();
    await expect(page).toHaveURL(/\/p\/notes$/u);
    await expect(page.getByRole("heading", { level: 1, name: "Notes" }).first()).toBeVisible();
  });

  test("a section can be collapsed and expanded", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside").first();
    const setup = sidebar.getByRole("link", { exact: true, name: "Setup" });
    await expect(setup).toBeVisible();

    await sidebar.getByRole("button", { name: "Collapse Guide" }).click();
    await expect(setup).toBeHidden();

    await sidebar.getByRole("button", { name: "Expand Guide" }).click();
    await expect(setup).toBeVisible();
  });

  test("wiki links resolve by path and navigate", async ({ page }) => {
    await page.goto("/p/README.md");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { exact: true, name: "notes" })).toHaveAttribute(
      "href",
      "/p/notes",
    );

    await main.getByRole("link", { exact: true, name: "guide" }).click();
    await expect(page).toHaveURL(/\/p\/guide$/u);
    await expect(page.getByRole("heading", { level: 1, name: "Guide" }).first()).toBeVisible();
  });

  test("an unknown page shows not found with links to existing pages", async ({ page }) => {
    await page.goto("/p/does-not-exist");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Notes" })).toBeVisible();

    await main.getByRole("button", { name: "Go to home" }).click();
    await expect(page).toHaveURL(/\/p\/README/u);
  });
});
