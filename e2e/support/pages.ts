/** Helpers for specs that need their own scratch pages. */
import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * A slug that is unique per test, repeat and retry, so tests that create
 * pages never collide, even when running in parallel against one server.
 * Use it in page titles too, since the sidebar matches pages by title.
 */
function uniqueSlug(testInfo: TestInfo, prefix: string): string {
  const parts = [prefix, testInfo.testId, testInfo.repeatEachIndex, testInfo.retry];
  return parts
    .join("-")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-");
}

/** Create a markdown page through the API and wait until the server has committed it. */
async function createPage(
  request: APIRequestContext,
  filePath: string,
  content: string,
): Promise<void> {
  const res = await request.post("/api/file", { data: { content, path: filePath } });
  expect(res.status(), await res.text()).toBe(200);
}

export { createPage, uniqueSlug };
