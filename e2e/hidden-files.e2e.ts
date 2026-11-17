import { expect, test } from "@playwright/test";
import { instances } from "./support/env";
import search from "./support/search";

test.use({ baseURL: instances.hiddenFiles.baseURL });

interface TreeNode {
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
}

const flattenPaths = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((node) => [node.path, ...flattenPaths(node.children ?? [])]);

test("a hidden page is gone from the tree and the search index", async ({ request }) => {
  const res = await request.get("/api/tree");
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) {
    throw new TypeError(`Unexpected tree response: ${JSON.stringify(body)}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const treePaths = flattenPaths(body as TreeNode[]);
  expect(treePaths).toContain("notes.md");
  expect(treePaths).not.toContain("hidden-page.md");

  // Search must agree with the tree: the hidden word finds nothing, a visible one still does.
  const hiddenHits = await search(request, "sasquatch");
  expect(hiddenHits).toEqual([]);
  const visibleHits = await search(request, "pineapple");
  expect(visibleHits.map((hit) => hit.path)).toEqual(["notes.md"]);
});
