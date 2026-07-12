import type { Dispatch, SetStateAction } from "react";
import type { FileType, PresenceUser, User } from "@/lib/types";
import PageHeaderButton from "@/components/layout/page-header-button";
import HeaderMenu from "@/components/layout/header-menu";
import { SAVE_BADGE_TEXT, getEditButtonClass, getSaveBadgeClass } from "./utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
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
  manualSaveOnly: boolean;
  saveStatus: SaveStatus;
  toggleManualSaveOnly: () => void;
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

function saveLabel(manualSaveOnly: boolean, saveStatus: SaveStatus): string {
  if (manualSaveOnly && (saveStatus === "saved" || saveStatus === "unsaved")) {
    return saveStatus === "saved" ? "Saved, no auto-save" : "Auto-save disabled";
  }
  return SAVE_BADGE_TEXT[saveStatus];
}

function SaveBadge({
  manualSaveOnly,
  saveStatus,
  saveBadgeClass,
  toggleManualSaveOnly,
}: {
  manualSaveOnly: boolean;
  saveStatus: SaveStatus;
  saveBadgeClass: string;
  toggleManualSaveOnly: () => void;
}): JSX.Element {
  return (
    <Badge
      variant="outline"
      className={`text-xs h-5 shrink-0 cursor-pointer select-none${
        manualSaveOnly ? " border-destructive text-destructive" : saveBadgeClass
      }`}
      onClick={toggleManualSaveOnly}
      role="button"
    >
      {saveLabel(manualSaveOnly, saveStatus)}
    </Badge>
  );
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
  manualSaveOnly,
  saveStatus,
  toggleManualSaveOnly,
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
          <h1 className="font-bold text-base truncate">{title}</h1>
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
        <SaveBadge
          manualSaveOnly={manualSaveOnly}
          saveStatus={saveStatus}
          saveBadgeClass={saveBadgeClass}
          toggleManualSaveOnly={toggleManualSaveOnly}
        />
      )}

      {/* Right: viewers + info + dropdown */}
      <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
        {/* Viewers deduplicated by id (same user may have multiple tabs open) */}
        <div className="flex -space-x-1 me-3">
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
          <PageHeaderButton
            fileType="toc"
            label="TOC"
            active={tocOpen}
            grayscaleWhenInactive
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
          />
        )}

        {/* Dedicated info button */}
        {!editMode && (
          <PageHeaderButton
            fileType="pageinfo"
            label="Info"
            active={infoOpen}
            grayscaleWhenInactive
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
          />
        )}

        {/* Advanced / dangerous actions only */}
        {user?.canEdit === true && (
          <HeaderMenu>
            <PageMenuItems
              variant="dropdown"
              href={`/p/${rawPath}`}
              path={filePath}
              displayTitle={title}
              canEdit={user.canEdit}
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
          </HeaderMenu>
        )}
      </div>
    </div>
  );
}

export default FilePageHeader;
// Line to prevent merge
