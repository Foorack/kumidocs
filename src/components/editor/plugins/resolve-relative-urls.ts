import type { Root, RootContent } from "hast";

/** Route prefix the app serves content pages under (see app.tsx: `/p/*`). */
const CONTENT_ROOT = "/p";

/**
 * Resolve relative URLs against the current page path before harden processes
 * them. Without this, harden resolves relative URLs against the server origin
 * (e.g. `./foo` -> `http://localhost:5864/foo`), breaking links on nested pages.
 *
 * Root-relative links starting with `/` are rewritten too. `/docs/foo.md`
 * means "foo.md relative to the repo root", but the root is served at `/p/`,
 * not `/`. Links already starting with the content root are left alone.
 *
 * pageDir is read inside the transformer, not the factory, because
 * Streamdown caches the compiled processor keyed by the rehypePlugins
 * array. Since that array is constant, the factory only runs once.
 * If pageDir were captured in a closure, every page would use the first
 * page's directory.
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

const rehypeResolveRelativeUrlsPlugin =
  (): ((tree: Root) => void) =>
  (tree: Root): void => {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    const pathname = globalThis.location === undefined ? "/" : globalThis.location.pathname;
    const pageDir = pathname.replace(/\/[^/]*$/u, "/");
    walk(tree, pageDir);
  };

export default rehypeResolveRelativeUrlsPlugin;
