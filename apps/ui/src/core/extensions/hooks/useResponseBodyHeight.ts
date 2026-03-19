import { useCallback } from "react";
import { useResponseStore } from "../../request-engine/stores/responseStore";

/**
 * Hook for reading/writing the response body editor height per tab.
 * Reads activeTabId from the response store internally so callers
 * (e.g. core-extension nodes) don't need to know the tab ID.
 */
export const useResponseBodyHeight = (): {
  height: number | null;
  setHeight: (h: number) => void;
} => {
  const activeTabId = useResponseStore((s) => s.activeTabId);
  const persisted = useResponseStore((s) =>
    activeTabId ? s.responseBodyHeightByTab[activeTabId] ?? null : null
  );
  const setter = useResponseStore((s) => s.setResponseBodyHeightForTab);

  const setHeight = useCallback(
    (h: number) => {
      if (activeTabId) setter(activeTabId, h);
    },
    [activeTabId, setter]
  );

  return { height: persisted, setHeight };
};
