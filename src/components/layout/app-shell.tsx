import type { PresenceUser, SyncStatus, TreeNode } from "@/lib/types";
import { getTree } from "@/lib/api";
import { useCallback, useRef, useState } from "react";
import { useWsConnectionState, useWsListener, wsClient } from "@/store/ws";
import { Button } from "@/components/ui/button";
import NewPageDialog from "@/components/dialogs/new-page-dialog";
import { Outlet } from "react-router-dom";
import SearchPalette from "@/components/search/search-palette";
import Sidebar from "./sidebar";
import Toaster from "@/components/ui/toaster";
import TopBar from "./top-bar";
import useMountEffect from "@/hooks/use-mount-effect";
import { useUser } from "@/store/user";

// Connects the WS client once on mount.
// Only rendered when the user is available (authenticated).
function WsConnector({ userId }: { userId: string }): JSX.Element {
  useMountEffect(() => {
    wsClient.connect(userId);
  });
  return <></>;
}

const SIDEBAR_WIDTH_KEY = "kumidocs:sidebar-width";
const SIDEBAR_DEFAULT = 288;
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;

export default function AppShell(): JSX.Element {
  const { user, instanceName, autoSaveDelay, headSha, refreshUser } = useUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [presenceByPage, setPresenceByPage] = useState<Map<string, PresenceUser[]>>(new Map());
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageParentDir, setNewPageParentDir] = useState<string | undefined>();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | undefined>();
  const [treeError, setTreeError] = useState<string | undefined>();
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored === null || stored === "") {
      return SIDEBAR_DEFAULT;
    }
    const num = Number(stored);
    return Number.isFinite(num)
      ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, num))
      : SIDEBAR_DEFAULT;
  });
  const [isDragging, setIsDragging] = useState(false);
  // Keep a ref so the stable mousemove closure always reads the live drag-start values
  const dragStartRef = useRef(undefined as { startX: number; width: number } | undefined);

  // oxlint-disable-next-line unicorn/no-useless-undefined
  const treeReloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reload full file tree for sidebar.
  // Returns void so it's safe to pass as event handler or onCreated callback.
  const loadTree = useCallback(async (): Promise<void> => {
    try {
      const data = await getTree();
      setTree(data);
      setTreeError(undefined);
    } catch (error: unknown) {
      console.error("Failed to load file tree:", error);
      setTreeError("Failed to load file tree.");
    }
  }, []);

  // Debounced variant coalesces burst WS events (e.g. multi-file git pull)
  // into a single /api/tree fetch 200 ms after the last event.
  const scheduleTreeReload = useCallback((): void => {
    clearTimeout(treeReloadTimer.current);
    treeReloadTimer.current = setTimeout((): void => {
      void loadTree();
    }, 200);
  }, [loadTree]);

  // Reload tree whenever the WS reopens (initial connect or reconnect)
  // so the sidebar is never stale after a WS disconnect.
  useMountEffect(() => {
    const unsubscribe = wsClient.onReopen(() => {
      scheduleTreeReload();
    });
    return unsubscribe;
  });

  // Clean up any pending tree reload timer on unmount
  useMountEffect(() => (): void => {
    clearTimeout(treeReloadTimer.current);
  });

  useMountEffect(() => {
    void loadTree();
  });

  // Update per-page presence map from WS presence updates
  useWsListener((msg) => {
    if (msg.type === "presence_update") {
      setPresenceByPage((prev) => {
        const next = new Map(prev);
        // Merge viewers + editor, deduplicated, minus self
        const all: PresenceUser[] = [];
        const seen = new Set<string>();
        for (const viewer of msg.viewers) {
          if (!seen.has(viewer.id) && viewer.id !== user?.id) {
            all.push(viewer);
            seen.add(viewer.id);
          }
        }
        if (msg.editor && !seen.has(msg.editor.id) && msg.editor.id !== user?.id) {
          all.push(msg.editor);
        }
        if (all.length > 0) {
          next.set(msg.pageId, all);
        } else {
          next.delete(msg.pageId);
        }
        return next;
      });
    }
    if (msg.type === "sync_status") {
      setSyncStatus(msg);
    }
    if (msg.type === "page_created" || msg.type === "page_changed" || msg.type === "page_deleted") {
      scheduleTreeReload();
    }
    if (msg.type === "config_changed") {
      void refreshUser();
    }
  });

  // Ctrl+K shortcut
  useMountEffect(() => {
    const handler = (ev: KeyboardEvent): void => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "k") {
        ev.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return (): void => {
      window.removeEventListener("keydown", handler);
    };
  });

  const handleResizeMouseDown = useCallback(
    (ev: React.MouseEvent) => {
      ev.preventDefault();
      dragStartRef.current = { startX: ev.clientX, width: sidebarWidth };
      setIsDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (mouseEv: MouseEvent): void => {
        if (!dragStartRef.current) {
          return;
        }
        const delta = mouseEv.clientX - dragStartRef.current.startX;
        const next = Math.max(
          SIDEBAR_MIN,
          Math.min(SIDEBAR_MAX, dragStartRef.current.width + delta),
        );
        setSidebarWidth(next);
      };

      const onMouseUp = (mouseEv: MouseEvent): void => {
        if (dragStartRef.current) {
          const delta = mouseEv.clientX - dragStartRef.current.startX;
          const next = Math.max(
            SIDEBAR_MIN,
            Math.min(SIDEBAR_MAX, dragStartRef.current.width + delta),
          );
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
        }
        dragStartRef.current = undefined;
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth],
  );

  // Connection state
  const wsConnectionState = useWsConnectionState();
  const isWsOffline = wsConnectionState !== "connected";

  // Error banners

  const errorBanners = ((): JSX.Element[] => {
    const banners: JSX.Element[] = [];

    // WebSocket disconnected
    if (isWsOffline) {
      banners.push(
        <div
          key="ws"
          className="bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-4 py-1.5 flex items-center gap-2 text-sm text-red-800 dark:text-red-200 shrink-0"
        >
          <span className="flex-1">
            {wsConnectionState === "connecting"
              ? "Connecting to server…"
              : "Disconnected from server. Real-time features (collaboration, live updates) are unavailable."}
          </span>
        </div>,
      );
    }

    // Tree load error
    if (treeError !== undefined && treeError !== "") {
      banners.push(
        <div
          key="tree"
          className="bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-4 py-1.5 flex items-center gap-2 text-sm text-red-800 dark:text-red-200 shrink-0"
        >
          <span className="flex-1">{treeError}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs"
            onClick={() => {
              void loadTree();
            }}
          >
            Retry
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs"
            onClick={() => {
              setTreeError(undefined);
            }}
          >
            Dismiss
          </Button>
        </div>,
      );
    }

    return banners;
  })();

  const syncBanner = ((): JSX.Element | undefined => {
    if (!syncStatus || (syncStatus.pull === "ok" && syncStatus.push === "ok")) {
      return undefined;
    }
    let message: string;
    if (syncStatus.push === "failing" && syncStatus.pull === "failing") {
      message = "Remote sync is unreachable. Changes are saved locally.";
    } else if (syncStatus.push === "failing") {
      message =
        "Remote sync is degraded: saves are local-only. Changes will be pushed when the remote is reachable again.";
    } else {
      message = "Remote sync is degraded: pull from remote failed.";
    }
    return (
      <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-1.5 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 shrink-0">
        <span className="flex-1">{message}</span>
      </div>
    );
  })();

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      {user && <WsConnector userId={user.id} />}
      {errorBanners}
      {syncBanner}
      <TopBar
        instanceName={instanceName}
        headSha={headSha}
        onSearchOpen={() => {
          setSearchOpen(true);
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          tree={tree}
          reloadTree={loadTree}
          width={sidebarWidth}
          onNewPage={() => {
            setNewPageParentDir(undefined);
            setNewPageOpen(true);
          }}
          onNewSubPage={(parentDir) => {
            setNewPageParentDir(parentDir || undefined);
            setNewPageOpen(true);
          }}
          presenceByPage={presenceByPage}
        />

        {/* Resize handle */}
        <div
          className={`w-1 shrink-0 cursor-col-resize transition-colors hover:bg-primary/30 ${isDragging ? "bg-primary/40" : ""}`}
          onMouseDown={handleResizeMouseDown}
        />

        <main className="flex-1 overflow-hidden flex flex-col">
          <Outlet context={{ autoSaveDelay, instanceName, reloadTree: loadTree, tree }} />
        </main>
      </div>

      <SearchPalette
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
        }}
      />
      <NewPageDialog
        open={newPageOpen}
        onClose={() => {
          setNewPageOpen(false);
        }}
        parentDir={newPageParentDir}
        onCreated={loadTree}
      />
      <Toaster richColors position="top-right" />
    </div>
  );
}
