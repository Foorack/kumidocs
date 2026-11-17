import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { FIXTURE_DIR, REPO_DIR } from "./support/env";
import { uniqueSlug } from "./support/pages";

// The fixture repo lives inside FIXTURE_DIR, so "../<name>" points at a real
// directory outside the repo that the guard has to refuse.
const outsideFile = (name: string): string => path.join(FIXTURE_DIR, name);

test.describe("path traversal guard", () => {
  test("PUT, POST and DELETE refuse a path outside the repo", async ({ request }, testInfo) => {
    const slug = uniqueSlug(testInfo, "escape");
    const canary = outsideFile(`${slug}.md`);
    await writeFile(canary, "# Canary\n");
    const target = `../${slug}.md`;

    try {
      const put = await request.put(`/api/file?path=${encodeURIComponent(target)}`, {
        data: { content: "# Escaped\n" },
      });
      expect(put.status()).toBe(403);

      const post = await request.post("/api/file", {
        data: { content: "# Escaped\n", path: target },
      });
      expect(post.status()).toBe(403);

      const del = await request.delete(`/api/file?path=${encodeURIComponent(target)}`);
      expect(del.status()).toBe(403);

      expect(await readFile(canary, "utf8")).toBe("# Canary\n");
    } finally {
      await rm(canary, { force: true });
    }
  });

  test("a traversal path cannot create a directory outside the repo", async ({
    request,
  }, testInfo) => {
    const slug = uniqueSlug(testInfo, "escape-dir");
    const dir = outsideFile(slug);
    const target = `../${slug}/page.md`;

    const res = await request.put(`/api/file?path=${encodeURIComponent(target)}`, {
      data: { content: "# Escaped\n" },
    });
    expect(res.status()).toBe(403);
    expect(await Bun.file(dir).exists()).toBe(false);
  });

  test("absolute paths are refused", async ({ request }, testInfo) => {
    const slug = uniqueSlug(testInfo, "absolute");
    const target = `/etc/${slug}.md`;

    const res = await request.put(`/api/file?path=${encodeURIComponent(target)}`, {
      data: { content: "# Escaped\n" },
    });
    expect(res.status()).toBe(403);
    expect(await Bun.file(target).exists()).toBe(false);
  });

  test("writes inside the repo still work", async ({ request }, testInfo) => {
    const file = `${uniqueSlug(testInfo, "inside")}.md`;

    const created = await request.put(`/api/file?path=${encodeURIComponent(file)}`, {
      data: { content: "# Inside\n" },
    });
    expect(created.status(), await created.text()).toBe(200);
    expect(await readFile(path.join(REPO_DIR, file), "utf8")).toContain("# Inside");

    const deleted = await request.delete(`/api/file?path=${encodeURIComponent(file)}`);
    expect(deleted.status(), await deleted.text()).toBe(200);
    expect(await Bun.file(path.join(REPO_DIR, file)).exists()).toBe(false);
  });
});
