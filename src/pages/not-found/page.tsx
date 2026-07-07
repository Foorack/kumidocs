import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmojiIcon } from "@/components/ui/emoji-icon";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import buildPageTree from "@/lib/page-tree";
import { PageTreeView } from "@/components/editor/markdown/tree-components";
import type { PageNode, TreeNode } from "@/lib/types";
import { useMemo } from "react";
import useMountEffect from "@/hooks/use-mount-effect";

interface OutletCtx {
  instanceName: string;
  tree: TreeNode[];
}

/** Walk the tree upward to find the closest ancestor that has children. */
function findNodeWithPrefix(nodes: PageNode[], prefix: string): PageNode | undefined {
  for (const node of nodes) {
    const nodePath = node.path.replace(/\.md$/u, "");
    if (nodePath === prefix) {
      return node;
    }
    if (node.children.length > 0) {
      const found = findNodeWithPrefix(node.children, prefix);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function findSubtreeForPath(pages: PageNode[], rawPath: string): PageNode[] | undefined {
  // Collect all node paths that could be the target or its parent
  const parts = rawPath.split("/");
  for (let depth = parts.length; depth >= 0; depth--) {
    const prefix = parts.slice(0, depth).join("/");
    if (!prefix) {
      continue;
    }
    // Look for a node whose raw path matches this directory
    const node = findNodeWithPrefix(pages, prefix);
    if (node && node.children.length > 0) {
      return node.children;
    }
  }
  return undefined;
}

const NotFound = (): JSX.Element => {
  const navigate = useNavigate();
  const location = useLocation();
  const { instanceName, tree } = useOutletContext<OutletCtx>();
  const pages = useMemo(() => buildPageTree(tree), [tree]);

  // Extract the attempted file path from the URL
  const rawPath = useMemo(() => {
    const PATH_RE = /^\/p\/(?<path>.+)$/u;
    const execResult = PATH_RE.exec(location.pathname);
    return execResult?.groups?.path ?? "";
  }, [location.pathname]);

  const subtree = useMemo(() => findSubtreeForPath(pages, rawPath) ?? pages, [pages, rawPath]);

  useMountEffect(() => {
    document.title = `Page Not Found | ${instanceName}`;
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="text-5xl">
          <EmojiIcon emoji="🔍" size="1em" />
        </div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="max-w-xs">The path you navigated to doesn't match any known route.</p>
        <Button
          variant="outline"
          onClick={() => {
            void navigate("/p/README.md");
          }}
        >
          <ArrowLeft className="mr-2 w-4 h-4" />
          Go to home
        </Button>
      </div>
      {subtree.length > 0 && (
        <div className="w-full max-w-lg">
          <h2 className="font-semibold mb-2">Pages in this section</h2>
          <PageTreeView nodes={subtree} />
        </div>
      )}
    </div>
  );
};

export default NotFound;
