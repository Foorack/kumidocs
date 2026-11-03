import { expect, test } from "@playwright/test";
import { createPage, uniqueSlug } from "./support/pages";
import { remoteFile, remoteLog } from "./support/git";

test.describe("editing", () => {
  test("a new page is created, committed and pushed", async ({ page }, testInfo) => {
    const slug = uniqueSlug(testInfo, "created");
    const title = `Created ${slug}`;
    await page.goto("/");

    await page.getByRole("button", { name: "New page" }).click();
    const dialog = page.getByRole("dialog", { name: "New page" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    await dialog.getByRole("textbox", { name: "Filename slug" }).fill(slug);
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(new RegExp(`/p/${slug}`, "u"));
    await expect(
      page.locator("aside").first().getByRole("link", { exact: true, name: title }),
    ).toBeVisible();

    await expect
      .poll(async () => remoteLog(`${slug}.md`))
      .toEqual([`docs(${slug}.md): create by Editor`]);
    expect(await remoteFile(`${slug}.md`)).toContain(title);
  });

  test("edits auto-save, survive a reload and land on the remote", async ({ page }, testInfo) => {
    const file = `${uniqueSlug(testInfo, "edited")}.md`;
    await createPage(page.request, file, "# Before Edit\n\nOriginal text.\n");

    await page.goto(`/p/${file}`);
    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    const editor = page.getByRole("textbox", { name: "Start writing…" });
    await editor.fill("# After Edit\n\nChanged in the browser.\n");

    // The preview updates while typing, then auto-save kicks in.
    await expect(
      page.getByRole("main").getByRole("paragraph").filter({ hasText: "Changed in the browser." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Saved" })).toBeVisible();
    await expect.poll(async () => remoteFile(file)).toContain("Changed in the browser.");
    expect(await remoteLog(file)).toContain(`docs(${file}): save by Editor`);

    await page.getByRole("button", { exact: true, name: "Read" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "After Edit" }).first()).toBeVisible();
  });

  test("a page can be deleted from the page menu", async ({ page }, testInfo) => {
    const slug = uniqueSlug(testInfo, "deleted");
    const file = `${slug}.md`;
    const title = `Doomed ${slug}`;
    await createPage(page.request, file, `# ${title}\n`);

    await page.goto(`/p/${file}`);
    const sidebarLink = page
      .locator("aside")
      .first()
      .getByRole("link", { exact: true, name: title });
    await expect(sidebarLink).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog", { name: `Delete "${file}"?` });
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(sidebarLink).toBeHidden();
    await expect.poll(async () => remoteFile(file)).toBeUndefined();
  });
});
