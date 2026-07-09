import MarkdownToolbar from "@/components/editor/markdown/toolbar";
import type { RefObject } from "react";

interface InlineEditorProps {
  value: string;
  onChange: (value: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  minHeight?: string;
  onKeyDown?: (ev: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  onSelect?: () => void;
  onClick?: () => void;

  // Toolbar handlers (passed through to MarkdownToolbar)
  headingValue: string;
  handleHeading: (val: string) => void;
  handleBold: () => void;
  handleItalic: () => void;
  handleStrikethrough: () => void;
  handleCode: () => void;
  handleLink: () => void;
  handleQuote: () => void;
  handleUnordered: () => void;
  handleNumbered: () => void;
  handleTask: () => void;
  handleEmoji: (emoji: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export default function InlineEditor({
  value,
  onChange,
  textareaRef,
  placeholder = "",
  minHeight = "min-h-[260px]",
  onKeyDown,
  onFocus,
  onSelect,
  onClick,
  headingValue,
  handleHeading,
  handleBold,
  handleItalic,
  handleStrikethrough,
  handleCode,
  handleLink,
  handleQuote,
  handleUnordered,
  handleNumbered,
  handleTask,
  handleEmoji,
  fileInputRef,
}: InlineEditorProps): JSX.Element {
  return (
    <div className="flex flex-col border rounded-md overflow-hidden">
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
        fileInputRef={fileInputRef}
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
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onSelect={onSelect}
        onClick={onClick}
        placeholder={placeholder}
        className={`w-full p-3 resize-none outline-none font-mono text-sm leading-relaxed ${minHeight}`}
      />
    </div>
  );
}
