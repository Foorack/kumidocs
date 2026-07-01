import { PageActionDialogs, ROOT } from "@/components/dialogs/page-action-dialogs";
import { deleteFile, getTree, renameFile } from "@/lib/api";
import { useCallback, useRef, useState } from "react";
import type { PageOption } from "@/components/dialogs/page-action-dialogs";
import type { TreeNode } from "@/lib/types";
import { toast } from "@/components/ui/toaster";
import useMountEffect from "@/hooks/use-mount-effect";
import { useNavigate } from "react-router-dom";

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => (node.type === "dir" ? flattenTree(node.children ?? []) : [node]));
}

interface UsePageActionsResult {
  openMove: (filePath: string) => Promise<void>;
  openDelete: (filePath: string, title?: string) => void;
  dialogs: JSX.Element;
}

/**
 * Shared hook for Move + Delete page actions.
 * Manages all dialog state internally; returns open-functions and dialog JSX.
 *
 * Usage:
 *   const { openMove, openDelete, dialogs } = usePageActions(reloadTree);
 *   // ... render {dialogs} somewhere in the component tree
 */
export default function usePageActions(reloadTree: () => void): UsePageActionsResult {
  const navigate = useNavigate();

  // Move dialog
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveFrom, setMoveFrom] = useState("");
  const [moveParent, setMoveParent] = useState(ROOT); // sentinel = root
  const [moveSlug, setMoveSlug] = useState("");
  const [movePages, setMovePages] = useState<PageOption[]>([]);
  const [parentOpen, setParentOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const comboboxRef = useRef<HTMLDivElement>(null);
  const outsideHandlerRef = useRef(undefined as ((ev: MouseEvent) => void) | undefined);

  const closeParentDropdown = useCallback(() => {
    if (outsideHandlerRef.current) {
      document.removeEventListener("mousedown", outsideHandlerRef.current);
      outsideHandlerRef.current = undefined;
    }
    setParentOpen(false);
  }, []);

  // Remove any stale listener on mount and clean up on unmount (e.g. route
  // navigation while dropdown is open) to prevent leaking event listeners.
  useMountEffect(() => {
    closeParentDropdown();
    return closeParentDropdown;
  });

  // Close the parent combobox dropdown when clicking outside
  const openParentDropdown = useCallback(() => {
    closeParentDropdown(); // remove any previously registered handler before adding a new one
    const handler = (ev: MouseEvent): void => {
      if (
        comboboxRef.current &&
        ev.target instanceof Node &&
        !comboboxRef.current.contains(ev.target)
      ) {
        closeParentDropdown();
      }
    };
    outsideHandlerRef.current = handler;
    document.addEventListener("mousedown", handler);
    setParentOpen(true);
  }, [closeParentDropdown]);

  const openMove = useCallback(async (filePath: string) => {
    const parts = filePath.replace(/\.md$/u, "").split("/");
    const slug = parts.pop() ?? "";
    const parent = parts.join("/");
    setMoveFrom(filePath);
    setMoveSlug(slug);
    setParentSearch("");
    try {
      const tree = await getTree();
      // Flatten the nested tree into a flat list of file nodes
      const pages: PageOption[] = flattenTree(tree)
        .filter(({ path: pagePath }) => pagePath.endsWith(".md") && pagePath !== filePath)
        .map(({ path: pagePath, fileEntry }) => ({
          dir: pagePath.replace(/\.md$/iu, ""),
          path: pagePath,
          title: fileEntry?.title ?? pagePath.replace(/\.md$/iu, ""),
        }))
        .toSorted((pageA, pageB) =>
          pageA.title.localeCompare(pageB.title, undefined, { sensitivity: "base" }),
        );
      setMovePages(pages);
      const parentPageExists = pages.some((pg) => pg.dir === parent);
      setMoveParent(parent && parentPageExists ? parent : ROOT);
    } catch {
      setMovePages([]);
      setMoveParent(ROOT);
    }
    setMoveOpen(true);
  }, []);

  const [moveError, setMoveError] = useState<string | undefined>();

  const confirmMove = useCallback(async () => {
    const slug = moveSlug.trim().replace(/\.md$/u, "");
    if (!slug) {
      return;
    }
    const parent = moveParent === ROOT ? "" : moveParent;
    const toPath = parent ? `${parent}/${slug}.md` : `${slug}.md`;
    setMoveError(undefined);
    try {
      await renameFile(moveFrom, toPath);
      toast.success("Page moved");
      reloadTree();
      void navigate(`/p/${toPath}`);
    } catch {
      setMoveError("Move failed");
      return; // keep dialog open
    }
    setMoveOpen(false);
  }, [moveFrom, moveParent, moveSlug, navigate, reloadTree]);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [deleteTitle, setDeleteTitle] = useState("");

  const openDelete = useCallback((filePath: string, title?: string) => {
    setDeleteTarget(filePath);
    setDeleteTitle(title ?? filePath);
    setDeleteOpen(true);
  }, []);

  const [deleteError, setDeleteError] = useState<string | undefined>();

  const confirmDelete = useCallback(async () => {
    setDeleteError(undefined);
    try {
      await deleteFile(deleteTarget);
      toast.success("Page deleted");
      reloadTree();
      void navigate("/p/README.md");
    } catch {
      setDeleteError("Delete failed");
      return; // keep dialog open
    }
    setDeleteOpen(false);
  }, [deleteTarget, navigate, reloadTree]);

  // Preview path
  const previewParent = moveParent === ROOT ? "" : moveParent;
  const previewSlug = moveSlug || "page-name";
  const previewPath = previewParent ? `${previewParent}/${previewSlug}.md` : `${previewSlug}.md`;

  // Dialog JSX
  const dialogs = (
    <PageActionDialogs
      moveOpen={moveOpen}
      setMoveOpen={(open) => {
        setMoveOpen(open);
        if (!open) {
          setMoveError(undefined);
        }
      }}
      movePages={movePages}
      moveParent={moveParent}
      setMoveParent={setMoveParent}
      moveSlug={moveSlug}
      setMoveSlug={setMoveSlug}
      parentOpen={parentOpen}
      parentSearch={parentSearch}
      setParentSearch={setParentSearch}
      comboboxRef={comboboxRef}
      closeParentDropdown={closeParentDropdown}
      openParentDropdown={openParentDropdown}
      confirmMove={confirmMove}
      moveError={moveError}
      previewPath={previewPath}
      deleteOpen={deleteOpen}
      setDeleteOpen={(open) => {
        setDeleteOpen(open);
        if (!open) {
          setDeleteError(undefined);
        }
      }}
      deleteTitle={deleteTitle}
      deleteTarget={deleteTarget}
      confirmDelete={confirmDelete}
      deleteError={deleteError}
    />
  );
  return { dialogs, openDelete, openMove };
}
