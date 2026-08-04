import type { Dispatch, ReactNode, Ref, RefObject, SetStateAction } from "react";
import type { FileType, PresenceUser, User } from "@/lib/types";
import CodeEditor from "@/components/editor/markdown/code-editor";
import CsvGrid from "@/components/editor/markdown/csv-grid";
import type { PageMeta as DocMeta } from "@/lib/frontmatter";
import MarkdownEditor from "@/components/editor/markdown/editor";
import MarkdownViewer from "@/components/editor/markdown/viewer";
import type { SaveStatus } from "./use-save";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SlideThemeMap } from "@/lib/slide";
import { SlideViewer } from "@/components/editor/slides/viewer";
import addOverlayToPdf from "@/components/editor/slides/pdf-overlay";
import { extensionToType } from "@/lib/filetypes";
import { extractHeadingTitle } from "@/lib/frontmatter";
import type { PageTemplateMap } from "@/lib/page";
import { resolvePageTemplate } from "@/lib/page";
import PageViewer from "@/components/viewer/page-viewer";
import type { PageViewerHandle } from "@/components/viewer/page-viewer";

function pathToTitle(path: string): string {
  return (path.split("/").pop() ?? path)
    .replace(/\.md$/u, "")
    .replaceAll(/[-_]/gu, " ")
    .replaceAll(/\b\w/gu, (char) => char.toUpperCase());
}

// Derived-value helpers

function resolveFileType(rawExt: string, slides: boolean | undefined, page?: string): FileType {
  const base = extensionToType(rawExt);
  if (base === "mermaid") {
    return "mermaid";
  }
  if (base === "kumidraw") {
    return "kumidraw";
  }
  if (base === "doc" && page !== undefined && page !== "") {
    return "page";
  }
  return base === "doc" && slides === true ? "slide" : base;
}

function computeTitle(fileType: FileType, content: string, filePath: string): string {
  if (fileType === "doc" || fileType === "slide" || fileType === "page") {
    return extractHeadingTitle(content) ?? pathToTitle(filePath);
  }
  return filePath.split("/").pop() ?? filePath;
}

/** Check if markdown content has no meaningful text (only frontmatter and headings). */
function isContentEmpty(content: string): boolean {
  const body = content
    // Remove frontmatter
    .replace(/^---[\s\S]*?---\r?\n/u, "")
    // Remove heading lines
    .replace(/^#{1,6}\s+.*$/mu, "")
    // Remove empty lines and whitespace
    .replaceAll(/\s+/gu, "");
  return body.length === 0;
}

function getEditButtonClass(
  editMode: boolean,
  editLocked: PresenceUser | undefined,
  user: User | undefined,
): string {
  if (editMode) {
    return "bg-background text-foreground shadow-sm";
  }
  if (editLocked && user && editLocked.id !== user.id) {
    return "text-muted-foreground opacity-40 cursor-not-allowed";
  }
  return "text-muted-foreground hover:text-foreground";
}

function getSaveBadgeClass(saveStatus: SaveStatus): string {
  if (saveStatus === "saved") {
    return " border-green text-green";
  }
  if (saveStatus === "error") {
    return " border-destructive text-destructive";
  }
  return "";
}

const SAVE_BADGE_TEXT: Record<SaveStatus, string> = {
  error: "Error",
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved",
};

interface EditorContentProps {
  fileType: FileType;
  editMode: boolean;
  content: string;
  /** Wiki-link-resolved markdown (view mode only). Falls back to `content` if undefined. */
  resolvedContent?: string;
  rawContent: string;
  rawExt: string;
  handleChange: (val: string) => void;
  handleSave: () => Promise<void>;
  meta: DocMeta;
  slideThemes: SlideThemeMap;
  pageTemplates: PageTemplateMap;
  setMeta: Dispatch<SetStateAction<DocMeta>>;
  metaRef: RefObject<DocMeta>;
  title: string;
  pageViewerRef?: Ref<PageViewerHandle>;
}

function buildEditorContent({
  fileType,
  editMode,
  content,
  resolvedContent,
  rawContent,
  rawExt,
  handleChange,
  handleSave,
  meta,
  slideThemes,
  pageTemplates,
  setMeta,
  metaRef,
  title,
  pageViewerRef,
}: EditorContentProps): ReactNode {
  // Use wiki-link-resolved content in view mode when available
  const viewContent = resolvedContent ?? content;
  if (fileType === "sheet") {
    return (
      <div className="h-full overflow-hidden">
        <CsvGrid
          value={content}
          readOnly={!editMode}
          onChange={editMode ? handleChange : undefined}
          onSave={editMode ? handleSave : undefined}
        />
      </div>
    );
  }
  if (fileType === "code") {
    return (
      <CodeEditor
        value={content}
        language={rawExt}
        readOnly={!editMode}
        onChange={editMode ? handleChange : undefined}
        onSave={editMode ? handleSave : undefined}
      />
    );
  }
  if (fileType === "mermaid") {
    // Wrap raw mermaid content in a fenced code block so the existing
    // streamdown mermaid plugin renders it. Strip the chrome so only
    // the diagram fills the page.
    const wrapped = `\`\`\`mermaid\n${content}\n\`\`\``;
    return (
      <div className="mermaid-fullpage flex flex-col flex-1 min-h-0">
        <MarkdownViewer value={wrapped} />
      </div>
    );
  }
  if (fileType === "kumidraw") {
    // Wrap raw kumidraw content in a fenced code block so the streamdown
    // kumidraw plugin renders it. Strip the chrome so only the diagram
    // fills the page.
    const wrapped = `\`\`\`kumidraw\n${content}\n\`\`\``;
    return (
      <div className="kumidraw-fullpage flex flex-col flex-1 min-h-0">
        <MarkdownViewer value={wrapped} />
      </div>
    );
  }
  if (editMode) {
    return (
      <MarkdownEditor
        value={rawContent}
        onChange={handleChange}
        onSave={handleSave}
        fileType={fileType}
        slideTheme={meta.theme}
        slidePaginate={meta.paginate}
        slideThemes={slideThemes}
        slideThemeVars={meta.themeVars}
        pageTemplates={pageTemplates}
        onMetaChange={(updatedMeta) => {
          metaRef.current = updatedMeta;
          setMeta(updatedMeta);
        }}
      />
    );
  }
  if (fileType === "slide") {
    return (
      <SlideViewer
        value={viewContent}
        filename={title}
        theme={meta.theme}
        paginate={meta.paginate}
        header={meta.header}
        footer={meta.footer}
        slideThemes={slideThemes}
        themeVars={meta.themeVars}
      />
    );
  }
  if (fileType === "page" && meta.page !== undefined && meta.page !== "") {
    const templateDef = resolvePageTemplate(pageTemplates, meta.page);
    if (templateDef !== undefined) {
      return (
        <ScrollArea className="h-full">
          <PageViewer
            ref={pageViewerRef}
            value={viewContent}
            template={templateDef}
            title={title}
            pageVars={meta.pageVars}
          />
        </ScrollArea>
      );
    }
  }
  return (
    <ScrollArea className="h-full">
      <MarkdownViewer
        value={isContentEmpty(content) ? `${viewContent}\n\n[!PAGES]` : viewContent}
        className="px-8 py-6"
      />
    </ScrollArea>
  );
}

export type { PresenceUser, User, SaveStatus, DocMeta, SlideThemeMap };
export {
  pathToTitle,
  addOverlayToPdf,
  resolveFileType,
  computeTitle,
  getEditButtonClass,
  getSaveBadgeClass,
  SAVE_BADGE_TEXT,
  buildEditorContent,
};
