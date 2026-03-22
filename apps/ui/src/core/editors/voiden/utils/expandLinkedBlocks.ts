import { JSONContent } from "@tiptap/core";
import { useBlockContentStore } from "@/core/stores/blockContentStore";
import { getQueryClient } from "@/main";

interface ExpandOptions {
  /** When true, bypass the store cache and always re-read from disk. Use at execution time. */
  forceRefresh?: boolean;
}

/**
 * Recursively expands linkedBlock nodes in editor JSON to their actual content.
 * This allows plugins to process linked blocks as if they were direct blocks.
 *
 * @param json - The editor JSON content (can be a single node or document)
 * @param depth - Current recursion depth (for safety)
 * @param options - Expansion options (e.g., forceRefresh for execution-time guarantee)
 * @returns The JSON with all linkedBlocks expanded to their actual content
 */
export async function expandLinkedBlocks(
  json: JSONContent,
  depth: number = 0,
  options: ExpandOptions = {}
): Promise<JSONContent> {
  // Safety check to prevent infinite recursion
  if (depth > 10) {
    // console.warn('[expandLinkedBlocks] Max recursion depth reached');
    return json;
  }

  // If this is a linkedBlock, resolve it to actual content
  if (json.type === 'linkedBlock') {
    const blockUid = json.attrs?.blockUid;
    const originalFile = json.attrs?.originalFile;

    if (!blockUid) {
      // console.warn('[expandLinkedBlocks] linkedBlock missing blockUid:', json);
      return json;
    }

    try {
      const store = useBlockContentStore.getState();
      let blockContent: any = null;

      // When forceRefresh is false, try the store cache first (faster for UI)
      if (!options.forceRefresh) {
        blockContent = store.blocks[blockUid];
      }

      // If not in store (or forceRefresh), fetch from disk
      if (!blockContent && originalFile) {
        const queryClient = getQueryClient();
        const projects = queryClient.getQueryData<{
          projects: { path: string; name: string }[];
          activeProject: string;
        }>(["projects"]);
        const activeProject = projects?.activeProject;
        const sourcePath = activeProject ? (await window.electron?.utils.pathJoin(activeProject, originalFile)) ?? originalFile : originalFile;
        const fetchedContent = await window.electron?.voiden.getBlockContent(sourcePath);
        if (typeof fetchedContent === "string") {
          return json;
        }
        blockContent = fetchedContent;

        // Cache it for future use
        if (blockContent) {
          store.setBlock(blockUid, blockContent);
        }
      }

      if (!blockContent || typeof blockContent !== "object") {
        // console.warn(`[expandLinkedBlocks] Could not resolve linkedBlock ${blockUid}`);
        return json;
      }

      // Recursively expand the block content first
      const expandedBlock = await expandLinkedBlocks(blockContent, depth + 1, options);

      // Mark the expanded block with importedFrom attribute to track its origin
      // This allows override logic to differentiate between imported and local blocks
      const result = {
        ...expandedBlock,
        attrs: {
          ...expandedBlock.attrs,
          importedFrom: originalFile,
        },
      };

      return result;
    } catch (error) {
      return json;
    }
  }

  // If this node has content array, recursively expand it
  if (json.content && Array.isArray(json.content)) {
    const expandedContent = await Promise.all(
      json.content.map(child => expandLinkedBlocks(child, depth + 1, options))
    );

    return {
      ...json,
      content: expandedContent,
    };
  }

  // No expansion needed
  return json;
}

/**
 * Expands all linkedBlocks in an editor document's content array.
 * This is the main entry point for processing editor JSON before passing to plugins.
 *
 * @param doc - The editor document JSON
 * @param options - Expansion options. Pass { forceRefresh: true } at execution time
 *                  to guarantee fresh content is read from disk.
 * @returns The document with all linkedBlocks expanded
 */
export async function expandLinkedBlocksInDoc(doc: JSONContent, options: ExpandOptions = {}): Promise<JSONContent> {
  if (!doc.content || !Array.isArray(doc.content)) {
    return doc;
  }

  const startTime = performance.now();

  const expandedContent = await Promise.all(
    doc.content.map(node => expandLinkedBlocks(node, 0, options))
  );

  const duration = performance.now() - startTime;

  return {
    ...doc,
    content: expandedContent,
  };
}
