import { ApiError, createFile } from "@/lib/api";
import { ContextMenuItem, ContextMenuSeparator } from "./context-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "./dropdown-menu";
import { Copy, Download, ExternalLink, Link, Plus, Square } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { useNavigate } from "react-router-dom";

interface PageMenuItemsProps {
  variant: "dropdown" | "context";
  href: string;
  path: string;
  displayTitle: string;
  isVirtual?: boolean;
  parentDir?: string;
  onNewSubPage?: (dir: string) => void;
  onNewPage?: (dir: string) => void;
  onDuplicate?: () => void;
  onCopyHtml?: () => Promise<void>;
  onExportPdf?: () => void;
  onMove?: (path: string) => void;
  onDelete?: (path: string, title: string) => void;
  canEdit?: boolean;
}

interface CreateSectionProps {
  variant: "dropdown" | "context";
  path: string;
  parentDir: string;
  onNewSubPage?: (dir: string) => void;
  onNewPage?: (dir: string) => void;
  onDuplicate?: () => void;
}

const CreateSection = (allProps: CreateSectionProps): JSX.Element => {
  const { variant, path, parentDir, onNewSubPage, onNewPage, onDuplicate } = allProps;
  let Item: typeof DropdownMenuItem = DropdownMenuItem;
  if (variant !== "dropdown") {
    Item = ContextMenuItem as typeof DropdownMenuItem;
  }
  let Sep: typeof DropdownMenuSeparator = DropdownMenuSeparator;
  if (variant !== "dropdown") {
    Sep = ContextMenuSeparator as typeof DropdownMenuSeparator;
  }
  return (
    <>
      {onNewSubPage && (
        <Item
          onClick={() => {
            onNewSubPage(path.replace(/\.md$/iu, ""));
          }}
        >
          <Plus className="mr-2 w-4 h-4" />
          New subpage
        </Item>
      )}
      {onNewPage && (
        <Item
          onClick={() => {
            onNewPage(parentDir);
          }}
        >
          <Square className="mr-2 w-4 h-4 opacity-0" />
          New page
        </Item>
      )}
      {onDuplicate && (
        <Item onClick={onDuplicate}>
          <Copy className="mr-2 w-4 h-4" />
          Duplicate
        </Item>
      )}
      <Sep />
    </>
  );
};

interface DangerousSectionProps {
  variant: "dropdown" | "context";
  path: string;
  displayTitle: string;
  onMove?: (path: string) => void;
  onDelete?: (path: string, title: string) => void;
}

const DangerousSection = (allProps: DangerousSectionProps): JSX.Element => {
  const { variant, path, displayTitle, onMove, onDelete } = allProps;
  let Item: typeof DropdownMenuItem = DropdownMenuItem;
  if (variant !== "dropdown") {
    Item = ContextMenuItem as typeof DropdownMenuItem;
  }
  let Sep: typeof DropdownMenuSeparator = DropdownMenuSeparator;
  if (variant !== "dropdown") {
    Sep = ContextMenuSeparator as typeof DropdownMenuSeparator;
  }
  return (
    <>
      <Sep />
      {onMove && (
        <Item
          onClick={() => {
            onMove(path);
          }}
        >
          <Square className="mr-2 w-4 h-4 opacity-0" />
          Move
        </Item>
      )}
      {onDelete && (
        <Item
          className="text-destructive focus:text-destructive"
          onClick={() => {
            onDelete(path, displayTitle);
          }}
        >
          <Square className="mr-2 w-4 h-4 opacity-0" />
          Delete
        </Item>
      )}
    </>
  );
};

const PageMenuItems = (allProps: PageMenuItemsProps): JSX.Element => {
  const {
    variant,
    href,
    path,
    displayTitle,
    isVirtual = false,
    parentDir = "",
    onNewSubPage,
    onNewPage,
    onDuplicate,
    onCopyHtml,
    onExportPdf,
    onMove,
    onDelete,
    canEdit = true,
  } = allProps;
  let Item: typeof DropdownMenuItem = DropdownMenuItem;
  if (variant !== "dropdown") {
    Item = ContextMenuItem as typeof DropdownMenuItem;
  }
  const navigate = useNavigate();

  if (isVirtual) {
    return (
      <Item
        onClick={() => {
          void (async (): Promise<void> => {
            try {
              const nav = href.replace(/^\/p\//u, "");
              await createFile(`${nav}.md`, `# ${displayTitle}\n`);
              toast.success("Page created");
              void navigate(href);
            } catch (error: unknown) {
              if (error instanceof ApiError && error.status === 409) {
                console.warn("A page at that path already exists.");
              } else {
                console.warn("Failed to create page");
              }
            }
          })();
        }}
      >
        Create this page
      </Item>
    );
  }

  const showCreateGroup = Boolean(onNewSubPage ?? onNewPage);
  const showDangerousGroup = Boolean(onMove ?? onDelete);

  return (
    <>
      {canEdit && showCreateGroup && (
        <CreateSection
          variant={variant}
          path={path}
          parentDir={parentDir}
          onNewSubPage={onNewSubPage}
          onNewPage={onNewPage}
          onDuplicate={onDuplicate}
        />
      )}
      <Item
        onClick={() => {
          globalThis.open(href, "_blank");
        }}
      >
        <ExternalLink className="mr-2 w-4 h-4" />
        Open in new tab
      </Item>
      <Item
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(globalThis.location.origin + href);
            toast.success("Link copied");
          } catch {
            console.warn("Failed to copy link");
          }
        }}
      >
        <Link className="mr-2 w-4 h-4" />
        Copy link
      </Item>
      {onCopyHtml && (
        <Item onClick={onCopyHtml}>
          <Copy className="mr-2 w-4 h-4" />
          Copy as HTML
        </Item>
      )}
      {onExportPdf && (
        <Item onClick={onExportPdf}>
          <Download className="mr-2 w-4 h-4" />
          Export as PDF
        </Item>
      )}
      {canEdit && showDangerousGroup && (
        <DangerousSection
          variant={variant}
          path={path}
          displayTitle={displayTitle}
          onMove={onMove}
          onDelete={onDelete}
        />
      )}
    </>
  );
};

export type { PageMenuItemsProps };
export { PageMenuItems };
