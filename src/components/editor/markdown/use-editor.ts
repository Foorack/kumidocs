import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  HEADING_OPTIONS,
  insertLink,
  insertLinkWithUrl,
  insertWrap,
  setLinePrefix,
  toggleListPrefix,
} from "./editor-utils";
import { buildFrontmatter, parseFrontmatter } from "@/lib/frontmatter";
import { useCallback, useMemo, useRef, useState } from "react";
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide";
import { splitSlides } from "@/components/editor/slides/utils";
import type { PageMeta } from "@/lib/frontmatter";
import type { SlideThemeMap } from "@/lib/slide";
import useMarkdownImageHandler from "./use-image-handler";

interface UseMarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  onSave?: () => void;
  slideThemes?: SlideThemeMap;
  onMetaChange?: (meta: PageMeta) => void;
}

interface UseMarkdownEditorReturn {
  applyMeta: (newMeta: PageMeta) => void;
  dlgMeta: PageMeta;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleBold: () => void;
  handleCode: () => void;
  handleContextCopy: () => Promise<void>;
  handleEmoji: (emoji: string) => void;
  handleContextCut: () => Promise<void>;
  handleContextPaste: () => Promise<void>;
  handleContextRedo: () => void;
  handleContextSelectAll: () => void;
  handleContextUndo: () => void;
  handleDragOver: (ev: React.DragEvent) => void;
  handleDrop: (ev: React.DragEvent) => void;
  handleEditorScroll: (ev: React.UIEvent<HTMLTextAreaElement>) => void;
  handleHeading: (val: string) => void;
  handleImageFiles: (files: FileList | File[]) => void;
  handleItalic: () => void;
  handleKeyDown: (ev: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleLink: () => void;
  handleNumbered: () => void;
  handlePaste: (ev: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  handlePropsOpen: (open: boolean) => void;
  handleQuote: () => void;
  handleStrikethrough: () => void;
  handleTask: () => void;
  handleTextareaChange: (ev: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleUnordered: () => void;
  activeSlideIndex: number;
  headingValue: string;
  previewRef: RefObject<HTMLDivElement | null>;
  previewValue: string;
  propsOpen: boolean;
  saveSelection: () => void;
  selectAllPendingRef: React.RefObject<boolean>;
  setShowPreview: Dispatch<SetStateAction<boolean>>;
  showPreview: boolean;
  taRef: RefObject<HTMLTextAreaElement | null>;
  themeOptions: string[];
}

/**
 * Given a cursor offset in the raw text (including frontmatter), determine
 * which slide index that cursor falls into.  Slides are split on `---`
 * separators (fence-aware via splitSlides).
 */
const getSlideIndexAtCursor = (cursorPos: number, fullValue: string): number => {
  // Strip frontmatter to match what SlideViewer receives
  const bodyMatch = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u.exec(fullValue);
  const frontmatterLen = bodyMatch ? bodyMatch[0].length : 0;
  const offsetInBody = Math.max(0, cursorPos - frontmatterLen);

  const body = fullValue.slice(frontmatterLen);
  const slides = splitSlides(body);
  if (slides.length <= 1) {
    return 0;
  }

  // Walk through the body tracking where each slide's content sits
  let searchPos = 0;
  let slideIndex = 0;
  for (const slideText of slides) {
    const found = body.indexOf(slideText, searchPos);
    if (found === -1) {
      continue;
    }
    if (offsetInBody >= found && offsetInBody < found + slideText.length) {
      return slideIndex;
    }
    searchPos = found + slideText.length;
    slideIndex++;
  }

  return slides.length - 1;
};

/** A snapshot of the editor state before an edit, used for undo/redo. */
interface UndoEntry {
  value: string;
  cursor: number;
}

function useMarkdownEditor({
  value,
  onChange,
  onSave,
  slideThemes,
  onMetaChange,
}: UseMarkdownEditorProps): UseMarkdownEditorReturn {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [headingValue, setHeadingValue] = useState("normal");
  const [showPreview, setShowPreview] = useState(true);
  const [propsOpen, setPropsOpen] = useState(false);
  const [dlgMeta, setDlgMeta] = useState<PageMeta>({});
  // Strip frontmatter from value for the preview pane (textarea shows full raw content).
  const previewValue = useMemo(() => parseFrontmatter(value).content, [value]);
  // Available theme names for the properties dialog.
  const themeOptions = useMemo(() => {
    const builtin = Object.keys(BUILTIN_SLIDE_THEMES);
    const custom = slideThemes
      ? Object.keys(slideThemes).filter((key) => !builtin.includes(key))
      : [];
    return ["default", ...builtin, ...custom];
  }, [slideThemes]);

  // Undo/redo history stack
  const valueRef = useRef(value);
  valueRef.current = value;
  const undoStackRef = useRef<UndoEntry[]>([{ cursor: 0, value }]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const isUndoRedoRef = useRef(false);
  const selectAllPendingRef = useRef(false);

  // Active slide index derived from cursor position (used for syncing editor cursor to slide preview)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Track the last known cursor/selection so toolbar actions that steal focus
  // (especially the heading Select dropdown) still operate at the right position.
  const savedSelectionRef = useRef({ end: 0, start: 0 });
  const saveSelection = useCallback(() => {
    if (taRef.current) {
      const start = taRef.current.selectionStart;
      savedSelectionRef.current = {
        end: taRef.current.selectionEnd,
        start,
      };
      // Update active slide index from cursor position
      setActiveSlideIndex(getSlideIndexAtCursor(start, valueRef.current));
    }
  }, []);

  // Dispatch a synthetic change so React picks up imperative textarea edits.
  // Pushes the previous value to the undo stack so toolbar actions are undoable.
  const syncChange = useCallback(() => {
    if (taRef.current) {
      const oldValue = valueRef.current;
      const newValue = taRef.current.value;
      if (!isUndoRedoRef.current && newValue !== oldValue) {
        undoStackRef.current.push({ cursor: savedSelectionRef.current.start, value: oldValue });
        redoStackRef.current = [];
      }
      valueRef.current = newValue;
      onChange(newValue);
    }
  }, [onChange]);

  const { handleImageFiles, handleDragOver, handleDrop } = useMarkdownImageHandler(taRef, onChange);

  const handlePropsOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setDlgMeta(parseFrontmatter(value).data);
      }
      setPropsOpen(open);
    },
    [value],
  );

  const applyMeta = useCallback(
    (newMeta: PageMeta) => {
      setDlgMeta(newMeta);
      const body = parseFrontmatter(value).content;
      const newRaw = buildFrontmatter(newMeta) + body;
      onChange(newRaw);
      onMetaChange?.(newMeta);
    },
    [value, onChange, onMetaChange],
  );

  const handleHeading = useCallback(
    (val: string) => {
      setHeadingValue(val);
      const opt = HEADING_OPTIONS.find((option) => option.value === val);
      if (!opt || !taRef.current) {
        return;
      }
      const ta = taRef.current;
      // Restore the saved selection: the dropdown stole focus and may have
      // caused the browser or React to reset the textarea cursor position.
      ta.focus();
      ta.setSelectionRange(savedSelectionRef.current.start, savedSelectionRef.current.end);
      setLinePrefix(ta, opt.prefix ? `${opt.prefix} ` : "");
      syncChange();
    },
    [syncChange],
  );

  const handleBold = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    insertWrap(taRef.current, "**", "**");
    syncChange();
  }, [syncChange]);

  const handleItalic = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    insertWrap(taRef.current, "*", "*");
    syncChange();
  }, [syncChange]);

  const handleStrikethrough = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    insertWrap(taRef.current, "~~", "~~");
    syncChange();
  }, [syncChange]);

  const handleCode = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    insertWrap(taRef.current, "`", "`");
    syncChange();
  }, [syncChange]);

  const handleLink = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    insertLink(taRef.current);
    syncChange();
  }, [syncChange]);

  const handleQuote = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    toggleListPrefix(taRef.current, "> ");
    syncChange();
  }, [syncChange]);

  const handleUnordered = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    toggleListPrefix(taRef.current, "- ");
    syncChange();
  }, [syncChange]);

  const handleNumbered = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    toggleListPrefix(taRef.current, "1. ");
    syncChange();
  }, [syncChange]);

  const handleTask = useCallback(() => {
    if (!taRef.current) {
      return;
    }
    toggleListPrefix(taRef.current, "- [ ] ");
    syncChange();
  }, [syncChange]);

  const handlePaste = useCallback(
    (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const ta = taRef.current;
      if (!ta) {
        return;
      }

      // 1. Paste image files: upload and insert as markdown image syntax.
      const imageFiles = [...ev.clipboardData.files].filter((file) =>
        file.type.startsWith("image/"),
      );
      if (imageFiles.length > 0) {
        ev.preventDefault();
        handleImageFiles(imageFiles);
        return;
      }

      // 2. Paste link over selected text: wrap selection as [selected](url).
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start !== end) {
        const text = ev.clipboardData.getData("text/plain").trim();
        if (text && /^https?:\/\/|^ftp:\/\/|^www\./iu.test(text)) {
          ev.preventDefault();
          insertLinkWithUrl(ta, text);
          syncChange();
        }
      }

      // Otherwise, let the default paste happen.
    },
    [handleImageFiles, syncChange],
  );

  const handleEditorScroll = useCallback((ev: React.UIEvent<HTMLTextAreaElement>) => {
    const ta = ev.currentTarget;
    const preview = previewRef.current;
    if (!preview) {
      return;
    }
    const scrollable = ta.scrollHeight - ta.clientHeight;
    if (scrollable <= 0) {
      return;
    }
    preview.scrollTop = (ta.scrollTop / scrollable) * (preview.scrollHeight - preview.clientHeight);
  }, []);

  const handleTextareaChange = useCallback(
    (ev: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = ev.target.value;
      const oldValue = valueRef.current;
      if (!isUndoRedoRef.current && newValue !== oldValue) {
        undoStackRef.current.push({ cursor: savedSelectionRef.current.start, value: oldValue });
        redoStackRef.current = [];
      }
      valueRef.current = newValue;
      onChange(newValue);
    },
    [onChange],
  );

  const handleContextUndo = useCallback(() => {
    const ta = taRef.current;
    if (!ta || undoStackRef.current.length <= 1) {
      return;
    }
    redoStackRef.current.push({
      cursor: savedSelectionRef.current.start,
      value: valueRef.current,
    });
    const entry = undoStackRef.current.pop();
    if (!entry) {
      return;
    }
    isUndoRedoRef.current = true;
    onChange(entry.value);
    isUndoRedoRef.current = false;
    queueMicrotask(() => {
      ta.setSelectionRange(entry.cursor, entry.cursor);
      saveSelection();
    });
  }, [onChange, saveSelection]);

  const handleContextRedo = useCallback(() => {
    const ta = taRef.current;
    if (!ta || redoStackRef.current.length === 0) {
      return;
    }
    const next = redoStackRef.current.pop();
    if (!next) {
      return;
    }
    undoStackRef.current.push({
      cursor: savedSelectionRef.current.start,
      value: valueRef.current,
    });
    isUndoRedoRef.current = true;
    onChange(next.value);
    isUndoRedoRef.current = false;
    queueMicrotask(() => {
      ta.setSelectionRange(next.cursor, next.cursor);
      saveSelection();
    });
  }, [onChange, saveSelection]);

  const handleContextCut = useCallback(async () => {
    const ta = taRef.current;
    if (!ta) {
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      return;
    }
    const text = valueRef.current.slice(start, end);
    try {
      await navigator.clipboard.writeText(text);
      const newValue = valueRef.current.slice(0, start) + valueRef.current.slice(end);
      undoStackRef.current.push({ cursor: start, value: valueRef.current });
      redoStackRef.current = [];
      valueRef.current = newValue;
      onChange(newValue);
      queueMicrotask(() => {
        ta.setSelectionRange(start, start);
      });
    } catch {
      // Clipboard write permission denied
    }
  }, [onChange]);

  const handleContextCopy = useCallback(async () => {
    const ta = taRef.current;
    if (!ta) {
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      return;
    }
    try {
      await navigator.clipboard.writeText(valueRef.current.slice(start, end));
    } catch {
      // Clipboard write permission denied
    }
  }, []);

  const handleEmoji = useCallback(
    (emoji: string) => {
      const ta = taRef.current;
      if (!ta) {
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.setRangeText(emoji, start, end, "preserve");
      ta.setSelectionRange(start + emoji.length, start + emoji.length);
      ta.focus();
      syncChange();
    },
    [syncChange],
  );

  const handleContextPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const ta = taRef.current;
      if (!ta) {
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newValue = valueRef.current.slice(0, start) + text + valueRef.current.slice(end);
      undoStackRef.current.push({ cursor: start, value: valueRef.current });
      redoStackRef.current = [];
      valueRef.current = newValue;
      onChange(newValue);
      queueMicrotask(() => {
        ta.setSelectionRange(start + text.length, start + text.length);
      });
    } catch {
      // Clipboard read requires user gesture + permission
    }
  }, [onChange]);

  const handleContextSelectAll = useCallback(() => {
    selectAllPendingRef.current = true;
  }, []);

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "s") {
        ev.preventDefault();
        onSave?.();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "b") {
        ev.preventDefault();
        handleBold();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "i") {
        ev.preventDefault();
        handleItalic();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "z") {
        ev.preventDefault();
        handleContextUndo();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "y") {
        ev.preventDefault();
        handleContextRedo();
      }
    },
    [onSave, handleBold, handleItalic, handleContextUndo, handleContextRedo],
  );

  return {
    activeSlideIndex,
    applyMeta,
    dlgMeta,
    fileInputRef,
    handleBold,
    handleCode,
    handleContextCopy,
    handleContextCut,
    handleContextPaste,
    handleContextRedo,
    handleContextSelectAll,
    handleContextUndo,
    handleDragOver,
    handleDrop,
    handleEditorScroll,
    handleEmoji,
    handleHeading,
    handleImageFiles,
    handleItalic,
    handleKeyDown,
    handleLink,
    handleNumbered,
    handlePaste,
    handlePropsOpen,
    handleQuote,
    handleStrikethrough,
    handleTask,
    handleTextareaChange,
    handleUnordered,
    headingValue,
    previewRef,
    previewValue,
    propsOpen,
    saveSelection,
    selectAllPendingRef,
    setShowPreview,
    showPreview,
    taRef,
    themeOptions,
  };
}

export { useMarkdownEditor };
export type { UseMarkdownEditorProps };
