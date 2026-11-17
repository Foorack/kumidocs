import { expect, test } from "@playwright/test";
import { RATE_LIMIT_COUNT, asUser, instances } from "./support/env";
import { uniqueSlug } from "./support/pages";

test.use({ baseURL: instances.rateLimited.baseURL });

test("a burst of writes from one user is rate limited", async ({ request }, testInfo) => {
  // A fresh identity per attempt, so a retry starts with an empty bucket.
  const headers = asUser(`burst-${testInfo.testId}-${String(testInfo.retry)}@example.com`);
  const slug = uniqueSlug(testInfo, "burst");

  const statuses: number[] = [];
  for (let index = 0; index < RATE_LIMIT_COUNT + 3; index++) {
    const res = await request.post("/api/file", {
      data: { content: `# Burst ${String(index)}\n`, path: `${slug}-${String(index)}.md` },
      headers,
    });
    statuses.push(res.status());
  }

  const expected = Array.from({ length: RATE_LIMIT_COUNT + 3 }, (_, index) =>
    index < RATE_LIMIT_COUNT ? 200 : 429,
  );
  expect(statuses).toEqual(expected);
});
