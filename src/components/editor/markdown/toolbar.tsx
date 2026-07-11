import {
  Bold,
  Code,
  Eye,
  EyeOff,
  Image,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Settings2,
  SmilePlus,
  Strikethrough,
  TextQuote,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { HEADING_OPTIONS } from "./editor-utils";
import EmojiPicker from "@/components/ui/emoji-picker";
import MarkdownCheatsheet from "./cheatsheet";
import { Popover } from "radix-ui";
import type React from "react";

interface MarkdownToolbarProps {
  disabled?: boolean;
  editorOnly?: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleBold: () => void;
  handleCode: () => void;
  handleEmoji: (emoji: string) => void;
  handleHeading: (val: string) => void;
  handleItalic: () => void;
  handleLink: () => void;
  handleNumbered: () => void;
  handlePropsOpen: (open: boolean) => void;
  handleQuote: () => void;
  handleStrikethrough: () => void;
  handleTask: () => void;
  handleUnordered: () => void;
  headingValue: string;
  setShowPreview: React.Dispatch<React.SetStateAction<boolean>>;
  showPreview: boolean;
}

function MarkdownToolbar({
  disabled,
  editorOnly,
  headingValue,
  showPreview,
  handleHeading,
  handleBold,
  handleEmoji,
  handleItalic,
  handleStrikethrough,
  handleCode,
  handleLink,
  handleQuote,
  handleUnordered,
  handleNumbered,
  handleTask,
  fileInputRef,
  handlePropsOpen,
  setShowPreview,
}: MarkdownToolbarProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border shrink-0">
      {/* Left: formatting controls */}
      <div className="flex items-center gap-1">
        <Select value={headingValue} onValueChange={handleHeading} disabled={disabled}>
          <SelectTrigger size="sm" className="w-32 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEADING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-px h-4 bg-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 font-bold"
          onClick={handleBold}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Bold (Ctrl+B)"
        >
          <Bold />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 italic"
          onClick={handleItalic}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Italic (Ctrl+I)"
        >
          <Italic />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleStrikethrough}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Strikethrough"
        >
          <Strikethrough />
        </Button>

        <div className="w-px h-4 bg-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleCode}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Inline code"
        >
          <Code />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleLink}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Link"
        >
          <Link2 />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 font-serif text-base leading-none"
          onClick={handleQuote}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Blockquote"
        >
          <TextQuote />
        </Button>

        <div className="w-px h-4 bg-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleUnordered}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Unordered list"
        >
          <List />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleNumbered}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Numbered list"
        >
          <ListOrdered />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleTask}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Task list"
        >
          <ListChecks />
        </Button>

        <div className="w-px h-4 bg-border mx-0.5" />

        <Popover.Root>
          <Popover.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onMouseDown={(ev) => {
                ev.preventDefault();
              }}
              disabled={disabled}
              title="Insert emoji"
            >
              <SmilePlus />
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" align="start" sideOffset={4} className="z-50">
              <EmojiPicker
                onEmojiSelect={(emoji) => {
                  handleEmoji(emoji);
                }}
                autoFocus
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            fileInputRef.current?.click();
          }}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Insert image"
        >
          <Image />
        </Button>

        <div className="w-px h-4 bg-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            handlePropsOpen(true);
          }}
          onMouseDown={(ev) => {
            ev.preventDefault();
          }}
          disabled={disabled}
          title="Page properties"
        >
          <Settings2 />
        </Button>
      </div>

      {/* Right: meta controls */}
      <div className="flex items-center gap-1">
        {editorOnly !== true && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              setShowPreview((prev) => !prev);
            }}
            onMouseDown={(ev) => {
              ev.preventDefault();
            }}
            disabled={disabled}
            title={showPreview ? "Hide preview" : "Show preview"}
          >
            {showPreview ? <Eye /> : <EyeOff />}
          </Button>
        )}
        <div className="w-px h-4 bg-border mx-0.5" />
        <MarkdownCheatsheet />
      </div>
    </div>
  );
}

export default MarkdownToolbar;
