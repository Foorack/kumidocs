import { expect, test } from "@playwright/test";
import { SECOND_EDITOR, VIEWER, asUser } from "./support/env";
import { createPage, uniqueSlug } from "./support/pages";
import { remoteFile, remoteLog } from "./support/git";
import PIXEL_PNG from "./support/images";

test.describe("workflows", () => {
  test("a moved page is followed by everyone viewing it", async ({ browser, page }, testInfo) => {
    const slug = uniqueSlug(testInfo, "moved");
    const title = `Moved ${slug}`;
    await createPage(page.request, `${slug}.md`, `# ${title}\n`);

    const viewerContext = await browser.newContext({ extraHTTPHeaders: asUser(VIEWER) });
    const viewer = await viewerContext.newPage();
    await viewer.goto(`/p/${slug}.md`);
    await expect(viewer.getByRole("heading", { level: 1, name: title }).first()).toBeVisible();

    await page.goto(`/p/${slug}.md`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Move" }).click();
    const dialog = page.getByRole("dialog", { name: "Move page" });
    await dialog.getByRole("textbox", { name: "page-name" }).fill(`${slug}-renamed`);
    await dialog.getByRole("button", { exact: true, name: "Move" }).click();

    const target = `${slug}-renamed.md`;
    await expect(page).toHaveURL(new RegExp(`/p/${slug}-renamed`, "u"));
    await expect(page.getByRole("heading", { level: 1, name: title }).first()).toBeVisible();
    await expect.poll(async () => remoteFile(target)).toContain(title);
    expect(await remoteFile(`${slug}.md`)).toBeUndefined();

    // Regression: a move used to look like a delete, so other viewers (and
    // sometimes the mover) were sent to the README.
    await expect(viewer).toHaveURL(new RegExp(`/p/${slug}-renamed`, "u"));
    await expect(viewer.getByRole("heading", { level: 1, name: title }).first()).toBeVisible();
    await viewerContext.close();
  });

  test("an image can be uploaded from the editor", async ({ page }, testInfo) => {
    const file = `${uniqueSlug(testInfo, "image")}.md`;
    await createPage(page.request, file, "# Image Page\n\n");

    await page.goto(`/p/${file}`);
    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Insert image" }).click();
    const fileChooser = await chooser;
    await fileChooser.setFiles({ buffer: PIXEL_PNG, mimeType: "image/png", name: "pixel.png" });

    const editor = page.getByRole("textbox", { name: "Start writing…" });
    await expect(editor).toHaveValue(/!\[[^\]]*\]\(\/images\/[^)]+\.png\)/u);
    const markdown = await editor.inputValue();
    const imagePath = /\((?<url>\/images\/[^)]+)\)/u.exec(markdown)?.groups?.url ?? "";

    const res = await page.request.get(imagePath);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    await expect.poll(async () => remoteLog(imagePath.slice(1))).toHaveLength(1);
  });

  test("a second editor cannot edit a page that someone is editing", async ({
    browser,
    page,
  }, testInfo) => {
    const file = `${uniqueSlug(testInfo, "locked")}.md`;
    await createPage(page.request, file, "# Locked Page\n");

    await page.goto(`/p/${file}`);
    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    await expect(page.getByRole("textbox", { name: "Start writing…" })).toBeVisible();

    const otherContext = await browser.newContext({ extraHTTPHeaders: asUser(SECOND_EDITOR) });
    const other = await otherContext.newPage();
    await other.goto(`/p/${file}`);
    const otherEdit = other.getByRole("button", { exact: true, name: "Edit" });
    await expect(otherEdit).toBeDisabled();
    await expect(other.getByTitle("Editor is editing")).toBeVisible();

    // The lock is released as soon as the first editor goes back to reading.
    await page.getByRole("button", { exact: true, name: "Read" }).click();
    await expect(otherEdit).toBeEnabled();
    await otherContext.close();
  });

  test("a slide deck can switch to one slide at a time", async ({ page }) => {
    await page.goto("/p/deck");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Paginate mode" }).click();
    await expect(main.getByRole("heading", { name: "First Slide" }).first()).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(main.getByRole("heading", { name: "Second Slide" }).first()).toBeVisible();
  });
});
