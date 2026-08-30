import { ApiError, getFile, putFile } from "@/lib/api";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { buildFrontmatter, parseFrontmatter } from "@/lib/frontmatter";
import { useCallback, useRef, useState } from "react";
import type { PageMeta as DocMeta } from "@/lib/frontmatter";
import { toast } from "@/components/ui/toaster";
import useMountEffect from "@/hooks/use-mount-effect";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

interface UseFilePageSaveProps {
  filePath: string;
  setFilePath: (path: string) => void;
  reloadTree: () => void;
  autoSaveDelay: number;
  setEditMode: (mode: boolean) => void;
}

interface UseFilePageSaveReturn {
  content: string;
  manualSaveOnly: boolean;
  toggleManualSaveOnly: () => void;
  contentRef: RefObject<string>;
  doSave: (currentContent: string, isRaw?: boolean) => Promise<void>;
  handleChange: (val: string) => void;
  handleSave: () => Promise<void>;
  isDirtyRef: RefObject<boolean>;
  lastSha: string | undefined;
  loadDoc: (path: string) => Promise<void>;
  loading: boolean;
  loadError: string | undefined;
  meta: DocMeta;
  metaRef: RefObject<DocMeta>;
  notFound: boolean;
  rawContent: string;
  rawContentRef: RefObject<string>;
  saveError: string | undefined;
  savedContent: string;
  savePromiseRef: RefObject<Promise<void>>;
  saveStatus: SaveStatus;
  setContent: Dispatch<SetStateAction<string>>;
  setMeta: Dispatch<SetStateAction<DocMeta>>;
  setRawContent: Dispatch<SetStateAction<string>>;
}

function useFilePageSave({
  filePath,
  setFilePath,
  reloadTree,
  autoSaveDelay,
  setEditMode,
}: UseFilePageSaveProps): UseFilePageSaveReturn {
  const [content, setContent] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [meta, setMeta] = useState<DocMeta>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSha, setLastSha] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [manualSaveOnly, setManualSaveOnly] = useState(false);

  const autoSaveTimer = useRef(undefined as ReturnType<typeof setTimeout> | undefined);
  const isMountedRef = useRef(true);
  const savePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const isDirtyRef = useRef(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  const rawContentRef = useRef(rawContent);
  rawContentRef.current = rawContent;
  const savedContentRef = useRef(savedContent);
  savedContentRef.current = savedContent;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  // Keep a ref to doSave so the unmount cleanup below can call it without
  // referencing the useCallback const before it is defined.
  const doSaveRef = useRef<(currentContent: string, isRaw?: boolean) => Promise<void>>(
    async () => undefined,
  );
  // doSave is assigned after its useCallback definition below; declare the
  // cleanup reference lazily through doSaveRef so there are no use-before-
  // define errors while still calling the latest doSave at unmount.
  useMountEffect(() => (): void => {
    isMountedRef.current = false;
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = undefined;
    }
    // This cleanup runs when FilePage tears down, which happens on every route
    // change (the route keys FilePage by rawPath). Clear the pending debounced
    // auto-save timer, then flush any unsaved edits so navigating away never
    // drops changes. exitEdit() also saves, but it is only wired to the Read
    // button, so sidebar/wiki-link/breadcrumb navigation needs this fallback.
    if (isDirtyRef.current) {
      void doSaveRef.current(rawContentRef.current, true);
    }
  });

  const loadDoc = useCallback(
    async (path: string) => {
      setLoading(true);
      setNotFound(false);
      setLoadError(undefined);
      try {
        // Extensionless files (e.g. LICENSE, Makefile) get ".md" appended by the
        // routing heuristic. If that 404s and the bare name has no extension,
        // retry with the original path and correct filePath for the whole page.
        let data;
        let resolvedPath = path;
        try {
          data = await getFile(path);
        } catch (error: unknown) {
          const isMissing = error instanceof ApiError && error.status === 404;
          const wasAppended = path.endsWith(".md") && !path.slice(0, -3).includes(".");
          if (isMissing && wasAppended) {
            resolvedPath = path.slice(0, -3);
            data = await getFile(resolvedPath);
          } else {
            throw error;
          }
        }
        if (resolvedPath !== path) {
          setFilePath(resolvedPath);
        }
        const parsed = parseFrontmatter(data.content);
        setContent(parsed.content);
        setRawContent(data.content);
        setSavedContent(parsed.content);
        isDirtyRef.current = false;
        setMeta(parsed.data);
        setLastSha(data.sha);
        setSaveStatus("saved");
        setEditMode(false);
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 404) {
          setNotFound(true);
        } else {
          const msg =
            error instanceof ApiError
              ? `Failed to load page (${String(error.status)}).`
              : "Failed to load page: network error.";
          setLoadError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [setEditMode, setFilePath],
  );

  useMountEffect(() => {
    void (async (): Promise<void> => {
      try {
        await loadDoc(filePath);
      } catch (error: unknown) {
        console.error("Failed to load document:", error);
      }
    })();
  });

  const doSave = useCallback(
    async (currentContent: string, isRaw = false): Promise<void> => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = undefined;
      }
      const prev = savePromiseRef.current;
      const next: Promise<void> = (async () => {
        try {
          await prev;
        } catch (error: unknown) {
          console.error("Previous save failed, continuing queue:", error);
        }
        setSaveStatus("saving");

        const fullContent = isRaw
          ? currentContent
          : buildFrontmatter(metaRef.current) + currentContent;

        try {
          const data = await putFile(filePath, fullContent);
          if (isRaw) {
            const parsed = parseFrontmatter(currentContent);
            setContent(parsed.content);
            setSavedContent(parsed.content);
            savedContentRef.current = parsed.content;
            setMeta(parsed.data);
            metaRef.current = parsed.data;
          } else {
            setSavedContent(currentContent);
            savedContentRef.current = currentContent;
          }
          isDirtyRef.current = false;
          setManualSaveOnly(false);
          setSaveStatus("saved");
          setSaveError(undefined);
          setLastSha(data.sha);
          reloadTree();
          if (data.pushWarning === true) {
            toast.warning("Saved locally. Remote push failed: check git remote config.");
          }
        } catch (error: unknown) {
          setSaveStatus("error");
          setSaveError(error instanceof ApiError ? "Save failed." : "Save failed: network error.");
        }
      })();
      savePromiseRef.current = next;
      return next;
    },
    [filePath, reloadTree],
  );
  // Keep doSaveRef in sync so the unmount cleanup flushes with the latest
  // doSave (which closes over the current filePath).
  doSaveRef.current = doSave;

  const toggleManualSaveOnly = useCallback(() => {
    setManualSaveOnly((prev) => !prev);
  }, []);

  const handleChange = useCallback(
    (val: string) => {
      setRawContent(val);
      rawContentRef.current = val;
      setSaveStatus("unsaved");
      isDirtyRef.current = true;
      if (manualSaveOnly) {
        return;
      }
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      autoSaveTimer.current = setTimeout(async () => {
        if (!isMountedRef.current) {
          return;
        }
        try {
          await doSave(val, true);
        } catch (error: unknown) {
          console.error("Auto-save failed:", error);
        }
      }, autoSaveDelay);
    },
    [doSave, autoSaveDelay, manualSaveOnly],
  );

  const handleSave = useCallback(async () => {
    try {
      await doSave(rawContentRef.current, true);
      setManualSaveOnly(false);
    } catch (error: unknown) {
      console.error("Manual save failed:", error);
    }
  }, [doSave]);

  return {
    content,
    contentRef,
    doSave,
    handleChange,
    handleSave,
    isDirtyRef,
    lastSha,
    loadDoc,
    loadError,
    loading,
    manualSaveOnly,
    meta,
    metaRef,
    notFound,
    rawContent,
    rawContentRef,
    saveError,
    savePromiseRef,
    saveStatus,
    savedContent,
    setContent,
    setMeta,
    setRawContent,
    toggleManualSaveOnly,
  };
}

export { useFilePageSave };
export type { SaveStatus };
