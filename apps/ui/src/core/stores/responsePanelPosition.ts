import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryClient } from "@/main";
import { usePanelStore } from "./panelStore";

export type ResponsePanelPosition = "right" | "bottom";

const QUERY_KEY = ["response-panel-position"] as const;
const STORAGE_KEY = "voiden:response-panel-position";

function readFromStorage(): ResponsePanelPosition {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "right" || stored === "bottom") return stored;
  } catch {}
  return "right";
}

/** Read the current position outside of React (sync). */
export function getResponsePanelPosition(): ResponsePanelPosition {
  const client = getQueryClient();
  return client.getQueryData<ResponsePanelPosition>(QUERY_KEY) ?? readFromStorage();
}

/** Set the position outside of React (sync). */
export function setResponsePanelPositionImperative(position: ResponsePanelPosition) {
  localStorage.setItem(STORAGE_KEY, position);
  getQueryClient().setQueryData(QUERY_KEY, position);
}

/** React hook — reactive to position changes. */
export function useResponsePanelPosition() {
  const queryClient = useQueryClient();
  const { data: position = readFromStorage() } = useQuery<ResponsePanelPosition>({
    queryKey: QUERY_KEY,
    queryFn: readFromStorage,
    staleTime: Infinity,
    initialData: readFromStorage,
  });

  const setPosition = (next: ResponsePanelPosition) => {
    const prev = getResponsePanelPosition();
    localStorage.setItem(STORAGE_KEY, next);
    queryClient.setQueryData(QUERY_KEY, next);

    // Switching bottom → right: close the bottom panel unless it was opened for terminal
    if (next === "right" && prev === "bottom") {
      const { bottomOpenedByTerminal, closeBottomPanel, bottomPanelRef, setBottomOpenedByTerminal } = usePanelStore.getState();
      if (!bottomOpenedByTerminal) {
        closeBottomPanel();
        bottomPanelRef?.current?.collapse();
      }
      setBottomOpenedByTerminal(false);
    }

    // Switching right → bottom: open the bottom panel
    if (next === "bottom" && prev === "right") {
      const { openBottomPanel } = usePanelStore.getState();
      openBottomPanel();
    }
  };

  const togglePosition = () =>
    setPosition(position === "right" ? "bottom" : "right");

  return { position, setPosition, togglePosition };
}
