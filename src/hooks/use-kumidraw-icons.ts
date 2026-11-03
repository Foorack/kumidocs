import type { KumidrawElement } from "@/lib/kumidraw/types";
import {
  getKumidrawIconPacks,
  loadKumidrawIcons,
  subscribeKumidrawIcons,
} from "@/client/kumidraw-icons";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Load the Kumidraw icon packs if any box uses an icon, and re-render once
 * they arrive. Diagrams without icons never trigger a download.
 */
export default function useKumidrawIcons(elements: KumidrawElement[]): void {
  const needed = elements.some((el) => el.kind === "box" && el.icon !== undefined);
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribe = subscribeKumidrawIcons(listener);
      if (needed) {
        void loadKumidrawIcons();
      }
      return unsubscribe;
    },
    [needed],
  );
  useSyncExternalStore(subscribe, getKumidrawIconPacks);
}
