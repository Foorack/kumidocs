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

  test("inline code is shown without literal backticks", async ({ page }) => {
    await page.goto("/p/guide/setup");
    const code = page.getByRole("main").getByRole("code").filter({ hasText: "cache_dir" });
    await expect(code).toBeVisible();
    const pseudo = await code.evaluate((el) => [
      getComputedStyle(el, "::before").content,
      getComputedStyle(el, "::after").content,
    ]);
    expect(pseudo).toEqual(["none", "none"]);
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

  test("a kumidraw file renders as a diagram with its icons", async ({ page }) => {
    const packRequest = page.waitForRequest(/\/api\/icons\/devicon$/u);
    await page.goto("/p/diagram.kumidraw");
    const diagram = page.getByRole("main").locator("svg").filter({ hasText: "Client" });
    await expect(diagram).toBeVisible();
    await expect(diagram).toContainText("Server");

    // Icon packs load on demand, then the diagram redraws with the real icon
    // instead of the grey fallback.
    await packRequest;
    const icon = diagram.locator("image").first();
    await expect
      .poll(async () => {
        const href = (await icon.getAttribute("href")) ?? "";
        return atob(href.replace(/^data:image\/svg\+xml;base64,/u, ""));
      })
      .not.toContain("#94a3b8");
  });

  test("a mermaid architecture diagram loads only the icon pack it uses", async ({ page }) => {
    const packRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/icons/")) {
        packRequests.push(req.url().replace(/^.*\/api\/icons\//u, ""));
      }
    });
    await page.goto("/p/architecture.mermaid");
    const chart = page.getByRole("img", { name: "Mermaid chart" });
    await expect(chart).toContainText("Web Server");
    await expect.poll(() => packRequests).toEqual(["devicon"]);
  });

  test("a page without diagrams loads no icon packs", async ({ page }) => {
    const packRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/icons")) {
        packRequests.push(req.url());
      }
    });
    await page.goto("/p/notes");
    await expect(page.getByRole("heading", { level: 1, name: "Notes" }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(packRequests).toEqual([]);
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
    // Other tests upload images, so check for the fixture image, not a count.
    await expect(main.getByText(/^\d+ images?$/u)).toBeVisible();
    await expect(main.getByRole("img", { name: "logo.png" })).toBeVisible();
  });
});
