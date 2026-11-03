import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { useWsListener, wsClient } from "@/store/ws";
import type { PresenceUser } from "@/lib/types";
import { toast } from "@/components/ui/toaster";
import { useNavigate } from "react-router-dom";

interface UsePagePresenceReturn {
  conflictBanner: string | undefined;
  editLocked: PresenceUser | undefined;
  remoteBanner: string | undefined;
  setRemoteBanner: Dispatch<SetStateAction<string | undefined>>;
  setConflictBanner: Dispatch<SetStateAction<string | undefined>>;
  viewers: PresenceUser[];
}

export default function usePagePresence(
  filePath: string,
  userId: string | undefined,
  editModeRef: RefObject<boolean>,
  isDirtyRef: RefObject<boolean>,
  loadDoc: (path: string) => Promise<void>,
): UsePagePresenceReturn {
  const navigate = useNavigate();
  const [editLocked, setEditLocked] = useState<PresenceUser | undefined>();
  const [viewers, setViewers] = useState<PresenceUser[]>([]);
  const [remoteBanner, setRemoteBanner] = useState<string | undefined>();
  const [conflictBanner, setConflictBanner] = useState<string | undefined>();

  useEffect(() => {
    if (userId !== undefined && userId !== "") {
      wsClient.joinPage(filePath);
    }
    return (): void => {
      if (editModeRef.current) {
        wsClient.stopEditing(filePath);
      }
      wsClient.leavePage();
    };
  }, [filePath, userId]);

  useWsListener((msg) => {
    if (msg.type === "presence_update" && msg.pageId === filePath) {
      setViewers(msg.viewers);
      setEditLocked(msg.editor);
    }
    if (msg.type === "page_changed" && msg.pageId === filePath) {
      if (msg.changedBy === userId) {
        return;
      }
      if (isDirtyRef.current) {
        setRemoteBanner(`${msg.changedByName} saved this page remotely`);
      } else {
        // Release the edit lock before reloading; loadDoc calls
        // setEditMode(false) but doesn't send the WS message to the server.
        if (editModeRef.current) {
          wsClient.stopEditing(filePath);
        }
        void (async (): Promise<void> => {
          try {
            await loadDoc(filePath);
          } catch (error: unknown) {
            console.error("Failed to reload document after remote change:", error);
          }
        })();
        toast.info(`Page updated by ${msg.changedByName}`);
      }
    }
    if (msg.type === "page_moved" && msg.from === filePath) {
      toast.info(`Page moved to ${msg.to}`);
      void navigate(`/p/${msg.to}`, { replace: true });
    }
    if (msg.type === "page_deleted" && msg.pageId === filePath) {
      toast.warning("This page was deleted");
      void navigate("/p/README.md");
    }
    if (msg.type === "save_conflict_lost" && msg.pageId === filePath) {
      setConflictBanner("Your changes were lost due to a remote conflict.");
      // Release the edit lock; the server kicked us out, make sure the WS
      // message is sent so other editors can claim the lock immediately.
      if (editModeRef.current) {
        wsClient.stopEditing(filePath);
      }
      void (async (): Promise<void> => {
        try {
          await loadDoc(filePath);
        } catch (error: unknown) {
          console.error("Failed to reload document after conflict:", error);
        }
      })();
    }
  });

  return { conflictBanner, editLocked, remoteBanner, setConflictBanner, setRemoteBanner, viewers };
}
