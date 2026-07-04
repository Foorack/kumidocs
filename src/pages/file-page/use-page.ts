import { duplicatePage } from "@/lib/api";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { FileType, PresenceUser, TreeNode, User } from "@/lib/types";
import { buildFrontmatter, parseFrontmatter } from "@/lib/frontmatter";
import { computeTitle, resolveFileType } from "./utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { PageMeta as DocMeta } from "@/lib/frontmatter";
import type { SaveStatus } from "./use-save";
import type { SlideThemeMap } from "@/lib/slide";
import type { PageTemplateMap } from "@/lib/page";
import type { WikilinkLookup } from "@/lib/wikilinks";
import { pathExtension } from "@/lib/filetypes";
import { buildLookupFromTree, resolveWikilinks } from "@/lib/wikilinks";
import { toast } from "@/components/ui/toaster";
import { useFilePageSave } from "./use-save";
import useInfoPanel from "@/hooks/use-info-panel";
import usePageActions from "@/hooks/use-page-actions";
import { usePageContext } from "@/lib/page-context";
import usePagePdfExport from "./use-pdf-export";
import usePagePresence from "@/hooks/use-page-presence";
import { useUser } from "@/store/user";
import { wsClient } from "@/store/ws";

interface OutletCtx {
  autoSaveDelay: number;
  instanceName: string;
  reloadTree: () => void;
  tree: TreeNode[];
}
interface UseFilePageReturn {
  breadcrumb: string[];
  conflictBanner: string | undefined;
  setConflictBanner: Dispatch<SetStateAction<string | undefined>>;
  content: string;
  duplicateError: string | undefined;
  setDuplicateError: Dispatch<SetStateAction<string | undefined>>;
  editLocked: PresenceUser | undefined;
  editMode: boolean;
  enterEdit: () => void;
  exitEdit: () => Promise<void>;
  exportPagePdf: () => Promise<void>;
  filePath: string;
  fileType: FileType;
  handleChange: (val: string) => void;
  handleEmojiChange: (newEmoji: string) => void;
  handlePageDuplicate: () => Promise<void>;
  handleSave: () => Promise<void>;
  infoOpen: boolean;
  lastSha: string | undefined;
  setTocOpen: Dispatch<SetStateAction<boolean>>;
  tocOpen: boolean;
  loadDoc: (path: string) => Promise<void>;
  loading: boolean;
  loadError: string | undefined;
  manualSaveOnly: boolean;
  meta: DocMeta;
  metaRef: RefObject<DocMeta>;
  notFound: boolean;
  openDelete: (filePath: string, title?: string) => void;
  openMove: (filePath: string) => Promise<void>;
  pageActionDialogs: ReactNode;
  pdfContentRef: RefObject<HTMLDivElement | null>;
  rawContent: string;
  rawExt: string;
  rawPath: string;
  remoteBanner: string | undefined;
  resolvedContent: string;
  saveError: string | undefined;
  saveStatus: SaveStatus;
  setInfoOpen: Dispatch<SetStateAction<boolean>>;
  setMeta: Dispatch<SetStateAction<DocMeta>>;
  setRemoteBanner: Dispatch<SetStateAction<string | undefined>>;
  slideThemes: SlideThemeMap;
  pageTemplates: PageTemplateMap;
  title: string;
  toggleManualSaveOnly: () => void;
  user: User | undefined;
  viewers: PresenceUser[];
}

function useFilePage(): UseFilePageReturn {
  const { "*": rawPath = "" } = useParams();
  const [filePath, setFilePath] = useState(rawPath.includes(".") ? rawPath : `${rawPath}.md`);
  const navigate = useNavigate();
  const { reloadTree, autoSaveDelay, instanceName } = useOutletContext<OutletCtx>();
  const { user, slideThemes } = useUser();
  const pageTemplates = useUser().pageTemplates;

  const [editMode, setEditMode] = useState(false);
  const {
    content,
    doSave,
    handleChange,
    handleSave,
    isDirtyRef,
    lastSha,
    loadDoc,
    loading,
    loadError,
    meta,
    metaRef,
    notFound,
    rawContent,
    rawContentRef,
    saveError,
    manualSaveOnly,
    savePromiseRef,
    saveStatus,
    setMeta,
    setRawContent,
    toggleManualSaveOnly,
  } = useFilePageSave({ autoSaveDelay, filePath, reloadTree, setEditMode, setFilePath });

  const { openMove, openDelete, dialogs: pageActionDialogs } = usePageActions(reloadTree);
  const [infoOpen, setInfoOpen] = useInfoPanel(filePath);
  const [tocOpen, setTocOpen] = useState(
    () => localStorage.getItem("kumidocs:toc-open") === "true",
  );
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;
  const { conflictBanner, editLocked, setConflictBanner, viewers, remoteBanner, setRemoteBanner } =
    usePagePresence(filePath, user?.id, editModeRef, isDirtyRef, loadDoc);
  const rawExt = pathExtension(filePath);
  const fileType = resolveFileType(rawExt, meta.slides, meta.page);
  const title = computeTitle(fileType, content, filePath);

  // Document title
  useEffect(() => {
    if (loading) {
      document.title = "Loading…";
    } else if (title) {
      document.title = `${title} | ${instanceName}`;
    } else {
      document.title = instanceName;
    }
  }, [title, instanceName, loading]);

  const breadcrumb = filePath.replace(/\.md$/u, "").split("/").slice(0, -1);
  const { tree } = usePageContext();
  const { exportPagePdf, pdfContentRef } = usePagePdfExport(title);

  // Wiki-link lookup: build from tree data (already fetched by AppShell)
  const pagesLookup = useMemo<WikilinkLookup | undefined>(
    () => (tree.length > 0 ? buildLookupFromTree(tree) : undefined),
    [tree],
  );
  const resolvedContent = useMemo(
    () =>
      pagesLookup && (fileType === "doc" || fileType === "slide") && !editMode
        ? resolveWikilinks(content, pagesLookup)
        : content,
    [content, editMode, fileType, pagesLookup],
  );

  const enterEdit = useCallback(() => {
    if (user?.canEdit !== true) {
      return;
    }
    if (editLocked && editLocked.id !== user.id) {
      toast.warning(`${editLocked.name} is currently editing this page.`);
      return;
    }
    wsClient.startEditing(filePath);
    setEditMode(true);
  }, [user, editLocked, filePath]);

  const exitEdit = useCallback(async () => {
    await savePromiseRef.current;
    if (isDirtyRef.current) {
      await doSave(rawContentRef.current, true);
    }
    wsClient.stopEditing(filePath);
    setEditMode(false);
  }, [doSave, filePath, isDirtyRef, rawContentRef, savePromiseRef]);

  const handleEmojiChange = useCallback(
    (newEmoji: string) => {
      const newMeta = { ...metaRef.current, emoji: newEmoji };
      metaRef.current = newMeta;
      setMeta((prev) => ({ ...prev, emoji: newEmoji }));
      // Rebuild raw content with updated frontmatter
      const parsed = parseFrontmatter(rawContentRef.current);
      const newRaw = buildFrontmatter(newMeta) + parsed.content;
      rawContentRef.current = newRaw;
      setRawContent(newRaw);
      void (async (): Promise<void> => {
        try {
          await doSave(newRaw, true);
        } catch (error: unknown) {
          console.error("Emoji save failed:", error);
        }
      })();
    },
    [doSave, metaRef, rawContentRef, setMeta, setRawContent],
  );

  const [duplicateError, setDuplicateError] = useState<string | undefined>();
  const handlePageDuplicate = useCallback(async () => {
    setDuplicateError(undefined);
    const result = await duplicatePage(filePath);
    if ("error" in result) {
      setDuplicateError(result.error);
      return;
    }
    reloadTree();
    toast.success("Page duplicated");
    void navigate(`/p/${result.newPath}`);
  }, [filePath, navigate, reloadTree]);

  return {
    breadcrumb,
    conflictBanner,
    content,
    duplicateError,
    editLocked,
    editMode,
    enterEdit,
    exitEdit,
    exportPagePdf,
    filePath,
    fileType,
    handleChange,
    handleEmojiChange,
    handlePageDuplicate,
    handleSave,
    infoOpen,
    lastSha,
    loadDoc,
    loadError,
    loading,
    manualSaveOnly,
    meta,
    metaRef,
    notFound,
    openDelete,
    openMove,
    pageActionDialogs,
    pageTemplates,
    pdfContentRef,
    rawContent,
    rawExt,
    rawPath,
    remoteBanner,
    resolvedContent,
    saveError,
    saveStatus,
    setConflictBanner,
    setDuplicateError,
    setInfoOpen,
    setMeta,
    setRemoteBanner,
    setTocOpen,
    slideThemes,
    title,
    tocOpen,
    toggleManualSaveOnly,
    user,
    viewers,
  };
}

export { useFilePage };
export type { OutletCtx };
