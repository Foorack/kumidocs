import type { Root, RootContent } from "hast";

/** Route prefix the app serves content pages under (see app.tsx: `/p/*`). */
const CONTENT_ROOT = "/p";

/**
 * Resolve relative URLs against the current page path before harden processes
 * them. Without this, harden resolves relative URLs against the server origin
 * (e.g. `./foo` -> `http://localhost:5864/foo`), which breaks links on pages
 * nested under `/p/some-page/`.
 *
 * Root-relative links (starting with `/`) are rewritten too: a link written
 * as `/docs/foo.md` means "foo.md relative to the repo root", but the repo
 * root is served at `/p/`, not `/`. Links that already start with the
 * content root (e.g. ones produced by wikilink resolution) are left alone
 * so they don't get prefixed twice.
 *
 * The page directory must be read inside the returned transformer, not in the
 * outer factory. Streamdown caches the compiled unified processor in a
 * module-level cache keyed by a serialization of the rehypePlugins array
 * (function name + options). Since that array is a constant, the factory
 * only ever runs once per app session - if it captured `pageDir` in its own
 * closure, every page after the first would reuse whichever directory was
 * current the first time any markdown rendered. Reading it inside the
 * transformer ensures it's recomputed on every actual render.
 */

const walk = (node: Root | RootContent, pageDir: string): void => {
  if (node.type === "element" && node.tagName === "a" && typeof node.properties.href === "string") {
    const href = node.properties.href;
    const isFragment = href.startsWith("#");
    const isProtocolAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(href);
    if (!isFragment && !isProtocolAbsolute) {
      if (href.startsWith("/")) {
        const hasContentRoot = href === CONTENT_ROOT || href.startsWith(`${CONTENT_ROOT}/`);
        if (!hasContentRoot) {
          node.properties.href = CONTENT_ROOT + href;
        }
      } else {
        node.properties.href = pageDir + href;
      }
    }
  }
  if ("children" in node) {
    for (const child of node.children) {
      walk(child, pageDir);
    }
  }
};

const rehypeResolveRelativeUrlsPlugin = (): ((tree: Root) => void) =>
  (tree: Root): void => {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    const pathname = globalThis.location === undefined ? "/" : globalThis.location.pathname;
    const pageDir = pathname.replace(/\/[^/]*$/u, "/");
    walk(tree, pageDir);
  };

export default rehypeResolveRelativeUrlsPlugin;
