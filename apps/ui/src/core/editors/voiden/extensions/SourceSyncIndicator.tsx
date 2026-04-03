import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { useBlockContentStore } from "@/core/stores/blockContentStore";
import { getQueryClient } from "@/main";

const sourceSyncPluginKey = new PluginKey("sourceSync");

/**
 * Finds all block UIDs in the document that are referenced by linkedBlock nodes.
 * Returns a Map of sourceUid -> Set of originalFile paths.
 */
function findLinkedSourceUids(doc: any): Map<string, Set<string>> {
  const sources = new Map<string, Set<string>>();

  doc.descendants((node: any) => {
    if (node.type.name === "linkedBlock" && node.attrs.blockUid) {
      const existing = sources.get(node.attrs.blockUid) || new Set();
      if (node.attrs.originalFile) {
        existing.add(node.attrs.originalFile);
      }
      sources.set(node.attrs.blockUid, existing);
    }
  });

  return sources;
}

/**
 * Creates decorations for source blocks that are linked from elsewhere.
 * Adds a small widget after each source block's opening position.
 */
function buildDecorations(doc: any, linkedSources: Map<string, Set<string>>): DecorationSet {
  if (linkedSources.size === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    const uid = node.attrs?.uid;
    if (uid && linkedSources.has(uid)) {
      const consumerFiles = linkedSources.get(uid)!;
      const count = consumerFiles.size;

      // Add a widget decoration at the start of the source block
      const widget = Decoration.widget(pos + 1, () => {
        const container = document.createElement("div");
        container.className = "source-sync-indicator";
        container.setAttribute("data-block-uid", uid);
        container.setAttribute("data-consumer-count", String(count));
        // Render will be handled by CSS + click handler below
        return container;
      }, { side: -1, key: `source-sync-${uid}` });

      decorations.push(widget);
    }
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * Extension that shows a sync indicator on source blocks that are linked elsewhere.
 * Clicking the indicator propagates a refresh to all linked blocks.
 */
export const SourceSyncIndicator = Extension.create({
  name: "sourceSyncIndicator",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: sourceSyncPluginKey,
        state: {
          init(_, state) {
            const linkedSources = findLinkedSourceUids(state.doc);
            return buildDecorations(state.doc, linkedSources);
          },
          apply(tr, old, _oldState, newState) {
            if (tr.docChanged) {
              const linkedSources = findLinkedSourceUids(newState.doc);
              return buildDecorations(newState.doc, linkedSources);
            }
            return old.map(tr.mapping, newState.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement;
            const indicator = target.closest(".source-sync-indicator");
            if (!indicator) return false;

            const blockUid = indicator.getAttribute("data-block-uid");
            if (!blockUid) return false;

            // Find the source block in the current editor state
            const doc = view.state.doc;
            let sourceBlock: any = null;
            doc.descendants((node: any) => {
              if (node.attrs?.uid === blockUid) {
                sourceBlock = node;
              }
            });

            if (!sourceBlock) return false;

            // Find all linkedBlock nodes that reference this uid and get their originalFile paths
            const linkedFiles = new Set<string>();
            doc.descendants((node: any) => {
              if (node.type.name === "linkedBlock" && node.attrs.blockUid === blockUid) {
                if (node.attrs.originalFile) {
                  linkedFiles.add(node.attrs.originalFile);
                }
              }
            });

            // Update the block content store with the latest source content
            const sourceJson = sourceBlock.toJSON();
            useBlockContentStore.getState().setBlock(blockUid, sourceJson);

            // Invalidate all React Query caches for linked blocks referencing this uid
            const queryClient = getQueryClient();
            queryClient.invalidateQueries({
              predicate: (query: any) => {
                const key = query.queryKey;
                return key[0] === "voiden-wrapper:blockContent" && key[2] === blockUid;
              },
            });

            // Visual feedback: briefly flash the indicator
            indicator.classList.add("source-sync-active");
            setTimeout(() => indicator.classList.remove("source-sync-active"), 600);

            return true;
          },
        },
      }),
    ];
  },
});
