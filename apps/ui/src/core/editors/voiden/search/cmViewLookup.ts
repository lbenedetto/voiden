import type { EditorView } from "prosemirror-view";
import type { EditorView as CMEditorView } from "@codemirror/view";

/**
 * Finds the CodeMirror EditorView instance rendered inside a ProseMirror
 * node at the given position. Uses the DOM-based `.cmView` pattern already
 * established in seamlessNavigation.ts and ResponsePanelContainer.tsx.
 */
export function findCmViewAtPos(
  pmView: EditorView,
  pmNodePos: number
): CMEditorView | null {
  try {
    const domNode = pmView.nodeDOM(pmNodePos) as HTMLElement | null;
    if (!domNode) return null;

    const cmEditor = domNode.querySelector(".cm-editor") as any;
    if (cmEditor && cmEditor.cmView) {
      return cmEditor.cmView as CMEditorView;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Finds all CodeMirror EditorView instances within a ProseMirror editor's DOM.
 * Useful for clearing highlights across all CM instances when closing the find panel.
 */
export function findAllCmViews(
  pmView: EditorView
): CMEditorView[] {
  const views: CMEditorView[] = [];
  try {
    const cmEditors = pmView.dom.querySelectorAll(".cm-editor");
    for (const el of cmEditors) {
      const cmView = (el as any).cmView as CMEditorView | undefined;
      if (cmView) {
        views.push(cmView);
      }
    }
  } catch {
    // Ignore DOM errors
  }
  return views;
}
