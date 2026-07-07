import { duplicatePage } from "@/lib/api";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmojiIcon, TitleWithEmoji } from "@/components/ui/emoji-icon";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { PageNode, PresenceUser, User } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageMenuItems } from "@/components/ui/page-menu-items";
import { UserAvatar } from "@/components/ui/avatar";
import { toast } from "@/components/ui/toaster";
import { useCallback, useEffect, useMemo, useState } from "react";

function getParentDir(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

/** Overlapping presence avatars shown in the sidebar next to a page node. */
function PresenceAvatars({
  presenceByPage,
  nodePath,
  isActive,
  currentUser,
  users,
  compact,
}: {
  presenceByPage: Map<string, PresenceUser[]>;
  nodePath: string;
  isActive: boolean;
  currentUser: User | undefined;
  /** Pre-computed user list (e.g. aggregated from a subtree for folders). */
  users?: { id: string; name: string; email: string }[];
  /** Use smaller xxs avatars with tighter overlap (for folders). */
  compact?: boolean;
}): JSX.Element | false {
  const resolved =
    users ??
    ((): { id: string; name: string; email: string }[] => {
      const othersOnPage = presenceByPage.get(nodePath) ?? [];
      const selfPresence =
        isActive && currentUser
          ? [{ email: currentUser.email, id: currentUser.id, name: currentUser.displayName }]
          : [];
      return [...selfPresence, ...othersOnPage];
    })();
  const slice = resolved.slice(0, 3);
  if (slice.length === 0) {
    return false;
  }
  const isCompact = compact === true;
  const size = isCompact ? "xxs" : "xs";
  const circleSize = isCompact ? "w-[11px] h-[11px]" : "w-[18px] h-[18px]";
  const textSize = isCompact ? "text-[4px]" : "text-[7px]";
  return (
    <div className={`flex items-center shrink-0 ${isCompact ? "-space-x-[3px]" : "-space-x-1"}`}>
      {slice.map((user) => (
        <Tooltip key={user.id}>
          <TooltipTrigger asChild>
            <UserAvatar
              name={user.name}
              email={user.email}
              size={size}
              className="ring-1 ring-sidebar cursor-default shrink-0"
            />
          </TooltipTrigger>
          <TooltipContent>{user.id === currentUser?.id ? "You" : user.name}</TooltipContent>
        </Tooltip>
      ))}
      {resolved.length > 3 && (
        <div
          className={`${circleSize} rounded-full bg-muted flex items-center justify-center ${textSize} font-bold ring-1 ring-sidebar text-muted-foreground cursor-default shrink-0`}
        >
          +{resolved.length - 3}
        </div>
      )}
    </div>
  );
}

async function handleDuplicatePage(
  path: string,
  navigate: (to: string) => void,
): Promise<string | undefined> {
  const result = await duplicatePage(path);
  if ("error" in result) {
    return result.error;
  }
  toast.success("Page duplicated");
  navigate(`/p/${result.newPath}`);
  return undefined;
}

// oxlint-disable-next-line complexity
function PageNodeRow({
  node,
  depth,
  defaultDepth,
  presenceByPage,
  currentUser,
  onNewSubPage,
  onMove,
  onDelete,
}: {
  node: PageNode;
  depth: number;
  defaultDepth: number;
  presenceByPage: Map<string, PresenceUser[]>;
  currentUser: User | undefined;
  onNewSubPage: (parentDir: string) => void;
  onMove: (path: string) => void;
  onDelete: (path: string, title: string) => void;
}): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;
  const href = `/p/${node.path}`.replace(/\.md$/iu, "");
  const isActive = location.pathname === href;
  const isAncestor = hasChildren && location.pathname.startsWith(`${href}/`);

  const [open, setOpen] = useState(depth < defaultDepth || isAncestor);

  // When navigating to a child of this node, auto-open this ancestor.
  // defaultDepth is intentionally excluded; it only sets the initial default;
  // reapplying it would override manual toggles and make it act as a max depth.
  useEffect(() => {
    if (isAncestor) {
      setOpen(true);
    }
  }, [isAncestor]);

  // Aggregate presence from all descendant pages (for folder presence badge).
  // Includes self (isAncestor) so collapsed folders show avatars when you're inside.
  const folderPresenceUsers = useMemo(() => {
    if (!hasChildren) {
      return [];
    }
    const prefix = `${node.path.replace(/\.md$/iu, "")}/`;
    const seen = new Set<string>();
    const users: { id: string; name: string; email: string }[] = [];
    for (const [pagePath, pageUsers] of presenceByPage) {
      if (pagePath.startsWith(prefix)) {
        for (const user of pageUsers) {
          if (!seen.has(user.id)) {
            users.push(user);
            seen.add(user.id);
          }
        }
      }
    }
    // Include self when inside this folder
    if (isAncestor && currentUser && !seen.has(currentUser.id)) {
      users.push({ email: currentUser.email, id: currentUser.id, name: currentUser.displayName });
    }
    return users;
  }, [hasChildren, node.path, presenceByPage, isAncestor, currentUser]);

  const [dotsHovered, setDotsHovered] = useState(false);
  const [dotsOpen, setDotsOpen] = useState(false);
  const indent = 8 + depth * 14;
  const parentDir = getParentDir(node.path);
  const rowVariant = isActive
    ? "bg-accent text-accent-foreground font-medium"
    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground";
  const rowClassName = `group flex items-center gap-1 px-2 py-[3px] rounded text-sm select-none min-w-0 ${rowVariant}`;
  const iconClassName = `flex items-center justify-center ${node.isVirtual ? "opacity-40 shrink-0" : "shrink-0"}`;
  const [sidebarDuplicateError, setSidebarDuplicateError] = useState<string | undefined>();

  const handleDuplicate = useCallback(() => {
    void (async (): Promise<void> => {
      const err = await handleDuplicatePage(node.path, navigate);
      if (err !== undefined) {
        setSidebarDuplicateError(err);
      }
    })();
  }, [node.path, navigate]);

  const entry = node.fileEntry;
  const entryEmoji = entry?.emoji;
  const entryType = entry?.type ?? "doc";
  const linkClass = `truncate flex-1 min-w-0${node.isVirtual ? " italic opacity-50" : ""}`;

  const dotsIcon =
    dotsHovered || dotsOpen ? (
      <MoreHorizontal className="w-4 h-4" />
    ) : (
      <MoreHorizontal className="w-4 h-4" />
    );

  const toggleOpen = (ev: React.MouseEvent): void => {
    ev.preventDefault();
    ev.stopPropagation();
    setOpen((prev) => !prev);
  };

  const chevron = (
    <span
      className={`shrink-0 w-3 h-3 flex items-center justify-center ${
        hasChildren ? "cursor-pointer" : "pointer-events-none opacity-0"
      }`}
      onClick={hasChildren ? toggleOpen : undefined}
    >
      {hasChildren && open && <ChevronDown className="w-3 h-3" />}
      {hasChildren && !open && <ChevronRight className="w-3 h-3" />}
    </span>
  );

  return (
    <div className="w-full">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={rowClassName} style={{ paddingLeft: `${String(indent)}px` }}>
            {chevron}

            {/* Page icon */}
            <span className={iconClassName}>
              <EmojiIcon emoji={entryEmoji} fileType={entryType} size={24} />
            </span>

            {/* Title navigates on click */}
            <Link to={href} className={linkClass} title={node.displayTitle}>
              <TitleWithEmoji title={node.displayTitle} />
            </Link>

            <PresenceAvatars
              presenceByPage={presenceByPage}
              nodePath={node.path}
              isActive={isActive}
              currentUser={currentUser}
            />

            {/* Folder presence avatars: shown when collapsed with users in subtree */}
            {!open && (
              <PresenceAvatars
                presenceByPage={presenceByPage}
                nodePath={node.path}
                isActive={isActive}
                currentUser={currentUser}
                users={folderPresenceUsers}
                compact
              />
            )}

            {/* 3-dot menu: visible on hover, same actions as right-click */}
            <DropdownMenu onOpenChange={setDotsOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-current transition-opacity"
                  onClick={(ev) => {
                    ev.stopPropagation();
                  }}
                  onMouseEnter={() => {
                    setDotsHovered(true);
                  }}
                  onMouseLeave={() => {
                    setDotsHovered(false);
                  }}
                >
                  {dotsIcon}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <PageMenuItems
                  variant="dropdown"
                  href={href}
                  path={node.path}
                  displayTitle={node.displayTitle}
                  isVirtual={node.isVirtual}
                  parentDir={parentDir}
                  onNewSubPage={onNewSubPage}
                  onNewPage={onNewSubPage}
                  onDuplicate={() => {
                    handleDuplicate();
                  }}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <PageMenuItems
            variant="context"
            href={href}
            path={node.path}
            displayTitle={node.displayTitle}
            isVirtual={node.isVirtual}
            parentDir={parentDir}
            onNewSubPage={onNewSubPage}
            onNewPage={onNewSubPage}
            onDuplicate={() => {
              handleDuplicate();
            }}
            onMove={onMove}
            onDelete={onDelete}
          />
        </ContextMenuContent>
      </ContextMenu>

      {sidebarDuplicateError !== undefined && sidebarDuplicateError !== "" && (
        <p
          className="text-red px-3 pt-0.5 pb-1 cursor-pointer"
          onClick={() => {
            setSidebarDuplicateError(undefined);
          }}
        >
          {sidebarDuplicateError}
        </p>
      )}

      {/* Children rendered outside ContextMenu so right-click doesn't bubble */}
      {hasChildren && open && (
        <div>
          {node.children.map((child, childIdx) => (
            <PageNodeRow
              key={`${child.path}-${childIdx}`}
              node={child}
              depth={depth + 1}
              defaultDepth={defaultDepth}
              presenceByPage={presenceByPage}
              currentUser={currentUser}
              onNewSubPage={onNewSubPage}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default PageNodeRow;
