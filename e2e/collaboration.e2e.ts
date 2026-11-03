import { expect, test } from "@playwright/test";
import { VIEWER, asUser } from "./support/env";
import { createPage, uniqueSlug } from "./support/pages";

test.describe("collaboration", () => {
  test("users on the same page see each other", async ({ browser, page }, testInfo) => {
    const file = `${uniqueSlug(testInfo, "presence")}.md`;
    await createPage(page.request, file, "# Presence Page\n");

    const viewerContext = await browser.newContext({ extraHTTPHeaders: asUser(VIEWER) });
    const viewerPage = await viewerContext.newPage();

    await page.goto(`/p/${file}`);
    await viewerPage.goto(`/p/${file}`);

    await expect(page.getByRole("main").getByText("VI", { exact: true }).first()).toBeVisible();
    await expect(
      viewerPage.getByRole("main").getByText("ED", { exact: true }).first(),
    ).toBeVisible();

    await viewerContext.close();
  });

  test("a saved change shows up for other readers without a reload", async ({
    browser,
    page,
  }, testInfo) => {
    const file = `${uniqueSlug(testInfo, "live")}.md`;
    await createPage(page.request, file, "# Live Page\n\nFirst version.\n");

    const viewerContext = await browser.newContext({ extraHTTPHeaders: asUser(VIEWER) });
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(`/p/${file}`);
    await expect(
      viewerPage.getByRole("paragraph").filter({ hasText: "First version." }).first(),
    ).toBeVisible();

    const res = await page.request.put(`/api/file?path=${encodeURIComponent(file)}`, {
      data: { content: "# Live Page\n\nSecond version.\n" },
    });
    expect(res.status()).toBe(200);

    await expect(
      viewerPage.getByRole("paragraph").filter({ hasText: "Second version." }).first(),
    ).toBeVisible();
    await viewerContext.close();
  });
});
