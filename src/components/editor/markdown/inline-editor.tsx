import cn from "@/lib/utils";
import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import MarkdownToolbar from "@/components/editor/markdown/toolbar";
import {
  HEADING_OPTIONS,
  insertLink,
  insertWrap,
  setLinePrefix,
  toggleListPrefix,
} from "@/components/editor/markdown/editor-utils";

interface InlineEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Optional external ref; otherwise one is created internally. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  minHeight?: string;
  /** Called for all keydown events; return false to prevent default handling. */
  onKeyDown?: (ev: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  onSelect?: () => void;
  onClick?: () => void;
  /** Optional: override the heading value if managing it externally. */
  headingValue?: string;
  /** Optional: override heading handler. */
  onHeadingChange?: (val: string) => void;
  border?: boolean;
}

/**
 * Self-contained markdown editor with toolbar.
 * Manages its own textarea ref and toolbar handlers internally.
 */
export default function InlineEditor({
  value,
  onChange,
  textareaRef: externalRef,
  placeholder = "",
  minHeight = "min-h-[260px]",
  onKeyDown,
  onFocus,
  onSelect,
  onClick,
  headingValue: externalHeading,
  onHeadingChange,
  border: showBorder = true,
}: InlineEditorProps): JSX.Element {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalRef ?? internalRef;
  const [heading, setHeading] = useState(externalHeading ?? "normal");
  const headingValue = externalHeading ?? heading;
  const handleHeadingChange = onHeadingChange ?? setHeading;
  const fallbackFileRef = useRef<HTMLInputElement | null>(null);

  const ta = (): HTMLTextAreaElement | null => {
    // Use whichever textarea is focused, falling back to our own
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && active === textareaRef.current) {
      return active;
    }
    return textareaRef.current;
  };

  const handleBold = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    insertWrap(el, "**", "**");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleItalic = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    insertWrap(el, "*", "*");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleStrikethrough = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    insertWrap(el, "~~", "~~");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleCode = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    insertWrap(el, "`", "`");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleHeading = useCallback(
    (val: string): void => {
      const el = ta();
      if (!el) {
        return;
      }
      handleHeadingChange(val);
      const prefix = HEADING_OPTIONS.find((opt) => opt.value === val)?.prefix ?? "";
      setLinePrefix(el, prefix);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [handleHeadingChange],
  );

  const handleQuote = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    setLinePrefix(el, "> ");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleUnordered = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    toggleListPrefix(el, "- ");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleNumbered = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    toggleListPrefix(el, "1. ");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleTask = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    toggleListPrefix(el, "- [ ] ");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleLink = useCallback((): void => {
    const el = ta();
    if (!el) {
      return;
    }
    insertLink(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleEmoji = useCallback((emoji: string): void => {
    const el = ta();
    if (!el) {
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.setRangeText(emoji, start, end, "preserve");
    el.setSelectionRange(start + emoji.length, start + emoji.length);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }, []);

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (onKeyDown) {
        onKeyDown(ev);
        if (ev.defaultPrevented) {
          return;
        }
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "b") {
        ev.preventDefault();
        handleBold();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "i") {
        ev.preventDefault();
        handleItalic();
      }
    },
    [onKeyDown, handleBold, handleItalic],
  );

  return (
    <div className={cn("flex flex-col", showBorder && "border rounded-md overflow-hidden")}>
      <MarkdownToolbar
        editorOnly
        disabled={false}
        headingValue={headingValue}
        showPreview={false}
        handleHeading={handleHeading}
        handleBold={handleBold}
        handleEmoji={handleEmoji}
        handleItalic={handleItalic}
        handleStrikethrough={handleStrikethrough}
        handleCode={handleCode}
        handleLink={handleLink}
        handleQuote={handleQuote}
        handleUnordered={handleUnordered}
        handleNumbered={handleNumbered}
        handleTask={handleTask}
        fileInputRef={fallbackFileRef}
        handlePropsOpen={(_open: boolean): void => {
          /* noop */
        }}
        setShowPreview={(_val: boolean | ((prev: boolean) => boolean)): void => {
          /* noop */
        }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(ev) => {
          onChange(ev.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onSelect={onSelect}
        onClick={onClick}
        placeholder={placeholder}
        className={cn("w-full p-3 resize-none outline-none font-mono text-sm leading-relaxed", minHeight)}
      />
    </div>
  );
}
