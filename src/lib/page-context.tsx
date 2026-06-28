import type { ReactNode } from "react";
import type { TreeNode } from "@/lib/types";
import { createContext, useContext } from "react";

interface PageContextValue {
  /** Raw file path of the current page (e.g. "docs/guide.md"). */
  pagePath: string;
  /** Raw markdown content of the current page (without frontmatter). */
  rawContent: string;
  /** Full file tree from the server. */
  tree: TreeNode[];
  /** Whether the page is currently being edited (vs. viewed read-only). */
  editMode: boolean;
}

const PageContext = createContext<PageContextValue>({
  editMode: false,
  pagePath: "",
  rawContent: "",
  tree: [],
});

function usePageContext(): PageContextValue {
  return useContext(PageContext);
}

function PageContextProvider({
  pagePath,
  rawContent,
  tree,
  editMode,
  children,
}: PageContextValue & { children: ReactNode }): JSX.Element {
  return (
    <PageContext.Provider value={{ editMode, pagePath, rawContent, tree }}>
      {children}
    </PageContext.Provider>
  );
}

export { PageContextProvider, usePageContext };
export type { PageContextValue };
