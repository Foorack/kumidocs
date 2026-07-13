import { useMemo } from "react";
import { ClipboardPaste, Copy, FileText, Redo2, Scissors, TextSelect, Undo2 } from "lucide-react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Checkbox from "@/components/ui/checkbox";
import Label from "@/components/ui/label";
import MarkdownToolbar from "./toolbar";
import MarkdownViewer from "./viewer";
import type { PageMeta } from "@/lib/frontmatter";
import type { PageTemplateMap } from "@/lib/page";
import type { SlideThemeMap } from "@/lib/slide";
import { SlideViewer } from "@/components/editor/slides/viewer";
import { useMarkdownEditor } from "./use-editor";

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  onSave?: () => void;
  disabled?: boolean;
  fileType?: string;
  slideTheme?: string;
  slidePaginate?: boolean;
  slideThemes?: SlideThemeMap;
  slideThemeVars?: Record<string, string>;
  onMetaChange?: (meta: PageMeta) => void;
  pageTemplates?: PageTemplateMap;
  border?: boolean;
}

export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  disabled,
  fileType,
  slideTheme,
  slidePaginate,
  slideThemes,
  slideThemeVars,
  onMetaChange,
  pageTemplates,
  border: showBorder = true,
}: MarkdownEditorProps): JSX.Element {
  const templateOptions = useMemo(() => {
    if (!pageTemplates) {
      return [];
    }
    return Object.keys(pageTemplates).toSorted();
  }, [pageTemplates]);

  const {
    taRef,
    previewRef,
    fileInputRef,
    headingValue,
    showPreview,
    setShowPreview,
    propsOpen,
    dlgMeta,
    previewValue,
    themeOptions,
    handlePropsOpen,
    handleHeading,
    handleBold,
    handleItalic,
    handleStrikethrough,
    handleCode,
    handleEmoji,
    handleLink,
    handleQuote,
    handleUnordered,
    handleNumbered,
    handleTask,
    handleImageFiles,
    handleDragOver,
    handleDrop,
    handleKeyDown,
    handlePaste,
    handleEditorScroll,
    applyMeta,
    saveSelection,
    handleTextareaChange,
    handleContextUndo,
    handleContextRedo,
    handleContextCut,
    handleContextCopy,
    handleContextPaste,
    activeSlideIndex,
    handleContextSelectAll,
    selectAllPendingRef,
  } = useMarkdownEditor({ onChange, onMetaChange, onSave, slideThemes, value });

  return (
    <div
      className={`flex flex-col h-full${showBorder ? " rounded-md border" : ""}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <MarkdownToolbar
        disabled={disabled}
        headingValue={headingValue}
        showPreview={showPreview}
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
        handlePropsOpen={handlePropsOpen}
        setShowPreview={setShowPreview}
      />
      {/* Properties dialog */}
      <Dialog open={propsOpen} onOpenChange={handlePropsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Page properties</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Presentation mode + Page mode */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="props-slides"
                  checked={Boolean(dlgMeta.slides)}
                  onCheckedChange={(checked) => {
                    const update: PageMeta = { ...dlgMeta, slides: Boolean(checked) };
                    if (checked === true) {
                      // mutually exclusive: unset page mode
                      delete update.page;
                    }
                    applyMeta(update);
                  }}
                />
                <Label htmlFor="props-slides">Presentation mode</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="props-page"
                  checked={Boolean(dlgMeta.page)}
                  onCheckedChange={(checked) => {
                    const update: PageMeta = { ...dlgMeta };
                    if (checked === true) {
                      update.page = "blank";
                      // mutually exclusive: unset slide mode
                      delete update.slides;
                    } else {
                      delete update.page;
                    }
                    applyMeta(update);
                  }}
                />
                <Label htmlFor="props-page">Page mode</Label>
              </div>
            </div>
            {dlgMeta.page !== undefined && dlgMeta.page !== "" && templateOptions.length > 0 && (
              <>
                <div className="border-t border-border" />
                {/* Page template */}
                <div className="flex items-center justify-between gap-4">
                  <Label>Template</Label>
                  <Select
                    value={dlgMeta.page ?? "blank"}
                    onValueChange={(val) => {
                      applyMeta({ ...dlgMeta, page: val });
                    }}
                  >
                    <SelectTrigger size="sm" className="w-36 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templateOptions.map((name) => (
                        <SelectItem key={name} value={name} className="text-xs">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {dlgMeta.slides === true && (
              <>
                <div className="border-t border-border" />
                {/* Theme */}
                <div className="flex items-center justify-between gap-4">
                  <Label>Theme</Label>
                  <Select
                    value={dlgMeta.theme ?? "default"}
                    onValueChange={(val) => {
                      applyMeta({
                        ...dlgMeta,
                        theme: val === "default" ? undefined : val,
                      });
                    }}
                  >
                    <SelectTrigger size="sm" className="w-36 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {themeOptions.map((theme) => (
                        <SelectItem key={theme} value={theme} className="text-xs">
                          {theme}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Paginate */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="props-paginate"
                    checked={Boolean(dlgMeta.paginate)}
                    onCheckedChange={(checked) => {
                      applyMeta({ ...dlgMeta, paginate: Boolean(checked) });
                    }}
                  />
                  <Label htmlFor="props-paginate">Show page numbers</Label>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Two-pane content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: editor */}
        <ContextMenu
          onOpenChange={(open) => {
            if (open) {
              setTimeout(() => {
                // Radix adds aria-hidden to the trigger when content opens.
                // Strip it because the textarea descendant still has focus.
                document
                  .querySelector('[data-slot="context-menu-trigger"]')
                  ?.removeAttribute("aria-hidden");
              }, 0);
            }
          }}
        >
          <ContextMenuTrigger asChild>
            <div
              className={`flex-1 min-w-0 flex flex-col overflow-hidden${showPreview ? " border-r border-border" : ""}`}
            >
              <textarea
                ref={taRef}
                value={value}
                onChange={handleTextareaChange}
                onSelect={saveSelection}
                onClick={saveSelection}
                onKeyUp={saveSelection}
                onScroll={handleEditorScroll}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={disabled}
                spellCheck
                className="flex-1 resize-none outline-none bg-background text-foreground font-mono text-sm leading-relaxed p-6 overflow-y-auto placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Start writing…"
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent
            className="min-w-[13rem]"
            onCloseAutoFocus={(ev) => {
              if (selectAllPendingRef.current) {
                selectAllPendingRef.current = false;
                ev.preventDefault();
                taRef.current?.select();
              }
            }}
          >
            <ContextMenuItem onSelect={handleContextUndo}>
              <Undo2 className="mr-2 size-4" />
              Undo
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <Kbd>Z</Kbd>
              </KbdGroup>
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleContextRedo}>
              <Redo2 className="mr-2 size-4" />
              Redo
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <Kbd>Y</Kbd>
              </KbdGroup>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleContextCut}>
              <Scissors className="mr-2 size-4" />
              Cut
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <Kbd>X</Kbd>
              </KbdGroup>
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleContextCopy}>
              <Copy className="mr-2 size-4" />
              Copy
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <Kbd>C</Kbd>
              </KbdGroup>
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleContextPaste}>
              <ClipboardPaste className="mr-2 size-4" />
              Paste
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <Kbd>V</Kbd>
              </KbdGroup>
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleContextPaste}>
              <FileText className="mr-2 size-4" />
              Paste as plain text
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <Kbd>Shift</Kbd>
                <Kbd>V</Kbd>
              </KbdGroup>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleContextSelectAll}>
              <TextSelect className="mr-2 size-4" />
              Select all
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <Kbd>A</Kbd>
              </KbdGroup>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Right: live preview */}
        {showPreview && (
          <div className="flex-1 min-w-0 overflow-hidden">
            {fileType === "slide" ? (
              <SlideViewer
                value={previewValue}
                theme={slideTheme}
                paginate={slidePaginate}
                slideThemes={slideThemes}
                themeVars={slideThemeVars}
                scrollToIndex={activeSlideIndex}
              />
            ) : (
              <div ref={previewRef} className="h-full overflow-y-auto">
                <MarkdownViewer key={previewValue} value={previewValue} className="px-8 py-6" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input for image picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(ev) => {
          if (ev.target.files) {
            handleImageFiles(ev.target.files);
            ev.target.value = "";
          }
        }}
      />
    </div>
  );
}
