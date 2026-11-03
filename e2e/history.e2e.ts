import { expect, test } from "@playwright/test";

test.describe("page history", () => {
  test("the info panel lists commits and opens a diff", async ({ page }) => {
    await page.goto("/p/notes");
    await page.getByRole("button", { name: "Info" }).click();

    const commit = page.getByRole("button", { name: /Initial fixture content/u });
    await expect(commit).toBeVisible();
    await commit.click();

    // The diff viewer is lazy-loaded the first time a commit is opened.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("The word pineapple only appears on this page.")).toBeVisible();
  });
});
