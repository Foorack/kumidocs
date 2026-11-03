import { expect, test } from "@playwright/test";

test.describe("rendering", () => {
  test("markdown renders tables, code, task lists and images", async ({ page }) => {
    await page.goto("/p/notes");
    const main = page.getByRole("main");

    const table = main.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "Role" })).toBeVisible();
    await expect(table.getByRole("cell", { exact: true, name: "Alice" })).toBeVisible();

    await expect(
      main.getByRole("code").filter({ hasText: "const answer: number = 42;" }),
    ).toBeVisible();

    await expect(main.getByRole("checkbox").first()).toBeChecked();
    await expect(main.getByRole("checkbox").nth(1)).not.toBeChecked();

    const logo = main.getByRole("img", { name: "Logo" });
    await expect(logo).toBeVisible();
    await expect
      .poll(async () => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("a slide deck renders every slide with page numbers", async ({ page }) => {
    await page.goto("/p/deck");
    const main = page.getByRole("main");
    for (const [index, title] of ["First Slide", "Second Slide", "Third Slide"].entries()) {
      await expect(main.getByRole("heading", { name: title }).last()).toBeVisible();
      // Each slide's number shows on the slide and on its thumbnail.
      await expect(
        main.getByText(`${String(index + 1)} / 3`, { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(main.getByRole("button", { name: "Paginate mode" })).toBeVisible();
  });

  test("a CSV file renders as a grid", async ({ page }) => {
    await page.goto("/p/data.csv");
    const table = page.getByRole("main").getByRole("table");
    await expect(table.getByRole("row", { name: "2 apples 3" })).toBeVisible();
    await expect(table.getByRole("row", { name: "3 pears 5" })).toBeVisible();
  });

  test("a code file shows its source", async ({ page }) => {
    await page.goto("/p/script.ts");
    await expect(
      page.getByRole("main").getByText('export const greeting = "hello from script";'),
    ).toBeVisible();
  });

  test("a kumidraw file renders as a diagram", async ({ page }) => {
    await page.goto("/p/diagram.kumidraw");
    const diagram = page.getByRole("main").locator("svg").filter({ hasText: "Client" });
    await expect(diagram).toBeVisible();
    await expect(diagram).toContainText("Server");
  });

  test("a mermaid file renders as a chart", async ({ page }) => {
    await page.goto("/p/flow.mermaid");
    const chart = page.getByRole("img", { name: "Mermaid chart" });
    await expect(chart).toBeVisible();
    await expect(chart).toContainText("Start");
    await expect(chart).toContainText("Finish");
  });

  test("the table of contents lists the page headings", async ({ page }) => {
    await page.goto("/p/guide/setup");
    await page.getByRole("button", { name: "TOC" }).click();
    for (const heading of ["Install", "Configure"]) {
      await expect(page.getByRole("link", { exact: true, name: heading })).toBeVisible();
    }
  });

  test("the image library lists repo images", async ({ page }) => {
    await page.goto("/i");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Image Library" })).toBeVisible();
    await expect(main.getByText("1 image")).toBeVisible();
    await expect(main.getByRole("img", { name: "logo.png" })).toBeVisible();
  });
});
