import type { Dispatch, SetStateAction } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileType, PresenceUser, User } from "@/lib/types";
import { Info, List, MoreHorizontal } from "lucide-react";
import { SAVE_BADGE_TEXT, getEditButtonClass, getSaveBadgeClass } from "./utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PageMeta as DocMeta } from "@/lib/frontmatter";
import EmojiPickerPopover from "@/components/ui/emoji-picker-popover";
import { Link } from "react-router-dom";
import { PageMenuItems } from "@/components/ui/page-menu-items";
import type { SaveStatus } from "./use-save";
import { UserAvatar } from "@/components/ui/avatar";

interface FilePageHeaderProps {
  meta: DocMeta;
  fileType: FileType;
  title: string;
  breadcrumb: string[];
  user: User | undefined;
  editMode: boolean;
  editLocked: PresenceUser | undefined;
  viewers: PresenceUser[];
  saveStatus: SaveStatus;
  infoOpen: boolean;
  tocOpen: boolean;
  rawPath: string;
  filePath: string;
  handleEmojiChange: (emoji: string) => void;
  exitEdit: () => Promise<void>;
  enterEdit: () => void;
  setInfoOpen: Dispatch<SetStateAction<boolean>>;
  setTocOpen: Dispatch<SetStateAction<boolean>>;
  handlePageDuplicate: () => void;
  onCopyHtml?: () => Promise<void>;
  exportPagePdf: () => void;
  openMove: (path: string) => Promise<void>;
  openDelete: () => void;
}

function FilePageHeader({
  meta,
  fileType,
  title,
  breadcrumb,
  user,
  editMode,
  editLocked,
  viewers,
  saveStatus,
  infoOpen,
  tocOpen,
  rawPath,
  filePath,
  handleEmojiChange,
  exitEdit,
  enterEdit,
  setInfoOpen,
  setTocOpen,
  handlePageDuplicate,
  onCopyHtml,
  exportPagePdf,
  openMove,
  openDelete,
}: FilePageHeaderProps): JSX.Element {
  const editButtonClass = getEditButtonClass(editMode, editLocked, user);
  const saveBadgeClass = getSaveBadgeClass(saveStatus);
  return (
    <div
      className={`flex items-center gap-2 px-4 ${breadcrumb.length > 0 ? "py-1" : "py-2"} border-b border-border shrink-0`}
    >
      {/* Left: icon + title + breadcrumb */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <EmojiPickerPopover
          emoji={meta.emoji}
          fileType={fileType}
          size={24}
          editable={editMode}
          onSelect={handleEmojiChange}
        />
        <div className="flex flex-col min-w-0">
          <h1 className="font-semibold text-base truncate">{title}</h1>
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 text-xs -mt-1">
              {breadcrumb.map((segment, idx) => {
                const path = breadcrumb.slice(0, idx + 1).join("/");
                const isLast = idx === breadcrumb.length - 1;
                return (
                  <span key={path} className="flex items-center gap-1">
                    {idx > 0 && <span className="text-muted-foreground/50">/</span>}
                    {isLast ? (
                      <span className="text-foreground/60">{segment}</span>
                    ) : (
                      <Link
                        to={`/p/${path}`}
                        className="text-primary hover:text-primary/80 transition-colors"
                      >
                        {segment}
                      </Link>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Center: Read/Edit segmented switch */}
      {user?.canEdit === true && (
        <div
          className="flex items-center rounded-md border border-border bg-muted h-7 p-0.5 gap-0.5 shrink-0"
          title={
            editLocked && editLocked.id !== user.id ? `${editLocked.name} is editing` : undefined
          }
        >
          <button
            className={`h-6 px-2.5 rounded text-xs transition-colors select-none ${editMode ? "text-muted-foreground hover:text-foreground" : "bg-background text-foreground shadow-sm"}`}
            onClick={async () => {
              if (editMode) {
                try {
                  await exitEdit();
                } catch (error: unknown) {
                  console.error("Failed to exit edit mode:", error);
                }
              }
            }}
          >
            Read
          </button>
          <button
            className={`h-6 px-2.5 rounded text-xs transition-colors select-none ${editButtonClass}`}
            onClick={() => {
              if (!editMode && !(editLocked && editLocked.id !== user.id)) {
                enterEdit();
              }
            }}
            disabled={editMode || Boolean(editLocked && editLocked.id !== user.id)}
          >
            Edit
          </button>
        </div>
      )}

      {/* Save status - inline next to Edit button */}
      {editMode && (
        <Badge variant="outline" className={`text-xs h-5 shrink-0${saveBadgeClass}`}>
          {SAVE_BADGE_TEXT[saveStatus]}
        </Badge>
      )}

      {/* Right: viewers + info + dropdown */}
      <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
        {/* Viewers deduplicated by id (same user may have multiple tabs open) */}
        <div className="flex -space-x-1">
          {[...new Map(viewers.map((viewer) => [viewer.id, viewer])).values()]
            .slice(0, 5)
            .map((viewer: PresenceUser) => (
              <Tooltip key={viewer.id}>
                <TooltipTrigger asChild>
                  <UserAvatar
                    name={viewer.name}
                    email={viewer.email}
                    size="sm"
                    className="border border-background ring-1 ring-border"
                  />
                </TooltipTrigger>
                <TooltipContent>{viewer.name}</TooltipContent>
              </Tooltip>
            ))}
        </div>

        {/* TOC toggle: only for doc pages in view mode */}
        {!editMode && fileType === "doc" && (
          <Button
            size="sm"
            variant={tocOpen ? "secondary" : "ghost"}
            className="h-7 gap-1 text-xs px-2"
            onClick={() => {
              setTocOpen((prev) => {
                const next = !prev;
                if (next) {
                  localStorage.setItem("kumidocs:toc-open", "true");
                } else {
                  localStorage.removeItem("kumidocs:toc-open");
                }
                return next;
              });
            }}
          >
            <List className="w-4 h-4" />
            TOC
          </Button>
        )}

        {/* Dedicated info button */}
        {!editMode && (
          <Button
            size="sm"
            variant={infoOpen ? "secondary" : "ghost"}
            className="h-7 gap-1 text-xs px-2"
            onClick={() => {
              setInfoOpen((prev) => {
                const next = !prev;
                if (next) {
                  localStorage.setItem("kumidocs:info-open", "true");
                } else {
                  localStorage.removeItem("kumidocs:info-open");
                }
                return next;
              });
            }}
          >
            <Info className="w-4 h-4" />
            Info
          </Button>
        )}

        {/* Advanced / dangerous actions only */}
        {user?.canEdit === true && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <PageMenuItems
                variant="dropdown"
                href={`/p/${rawPath}`}
                path={filePath}
                displayTitle={title}
                onDuplicate={handlePageDuplicate}
                onCopyHtml={onCopyHtml}
                onExportPdf={fileType === "doc" && !editMode ? exportPagePdf : undefined}
                onMove={async (movePath) => {
                  try {
                    await openMove(movePath);
                  } catch (error: unknown) {
                    console.error("Failed to open move dialog:", error);
                  }
                }}
                onDelete={openDelete}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

export default FilePageHeader;
// Line to prevent merge
