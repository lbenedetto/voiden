import { create } from "zustand";

export interface ImportDependencyStore {
  // "who imports what" — keyed by consumer file path
  consumers: Record<string, Set<string>>;
  // "who is imported by whom" — keyed by source file path
  producers: Record<string, Set<string>>;
  // stale block UIDs that need refresh
  staleBlocks: Set<string>;
  // version counter per source file — bumped on each change
  sourceVersions: Record<string, number>;

  // Register a dependency: consumerPath imports from sourcePath
  registerImport: (consumerPath: string, sourcePath: string) => void;
  // Unregister a dependency
  unregisterImport: (consumerPath: string, sourcePath: string) => void;
  // Unregister all dependencies for a consumer (on unmount)
  unregisterAllForConsumer: (consumerPath: string) => void;
  // Notify that a source file changed — marks all consumers' blocks as stale
  notifySourceChanged: (sourcePath: string) => void;
  // Mark a specific block UID as stale
  markBlockStale: (blockUid: string) => void;
  // Clear stale status for a block UID (after refresh)
  clearBlockStale: (blockUid: string) => void;
  // Check if a block is stale
  isBlockStale: (blockUid: string) => boolean;
  // Get all consumer paths for a given source
  getConsumersOf: (sourcePath: string) => string[];
  // Check for circular imports between two paths
  hasCircularImport: (consumerPath: string, sourcePath: string) => boolean;
  // Get the current version of a source file
  getSourceVersion: (sourcePath: string) => number;
}

export const useImportDependencyStore = create<ImportDependencyStore>((set, get) => ({
  consumers: {},
  producers: {},
  staleBlocks: new Set(),
  sourceVersions: {},

  registerImport: (consumerPath, sourcePath) => {
    set((state) => {
      const consumers = { ...state.consumers };
      const producers = { ...state.producers };

      if (!consumers[consumerPath]) {
        consumers[consumerPath] = new Set();
      }
      consumers[consumerPath] = new Set(consumers[consumerPath]).add(sourcePath);

      if (!producers[sourcePath]) {
        producers[sourcePath] = new Set();
      }
      producers[sourcePath] = new Set(producers[sourcePath]).add(consumerPath);

      return { consumers, producers };
    });
  },

  unregisterImport: (consumerPath, sourcePath) => {
    set((state) => {
      const consumers = { ...state.consumers };
      const producers = { ...state.producers };

      if (consumers[consumerPath]) {
        const updated = new Set(consumers[consumerPath]);
        updated.delete(sourcePath);
        if (updated.size === 0) {
          delete consumers[consumerPath];
        } else {
          consumers[consumerPath] = updated;
        }
      }

      if (producers[sourcePath]) {
        const updated = new Set(producers[sourcePath]);
        updated.delete(consumerPath);
        if (updated.size === 0) {
          delete producers[sourcePath];
        } else {
          producers[sourcePath] = updated;
        }
      }

      return { consumers, producers };
    });
  },

  unregisterAllForConsumer: (consumerPath) => {
    set((state) => {
      const consumers = { ...state.consumers };
      const producers = { ...state.producers };
      const sources = consumers[consumerPath];

      if (sources) {
        for (const sourcePath of sources) {
          if (producers[sourcePath]) {
            const updated = new Set(producers[sourcePath]);
            updated.delete(consumerPath);
            if (updated.size === 0) {
              delete producers[sourcePath];
            } else {
              producers[sourcePath] = updated;
            }
          }
        }
        delete consumers[consumerPath];
      }

      return { consumers, producers };
    });
  },

  notifySourceChanged: (sourcePath) => {
    set((state) => {
      const sourceVersions = { ...state.sourceVersions };
      sourceVersions[sourcePath] = (sourceVersions[sourcePath] || 0) + 1;
      return { sourceVersions };
    });
  },

  markBlockStale: (blockUid) => {
    set((state) => {
      const staleBlocks = new Set(state.staleBlocks);
      staleBlocks.add(blockUid);
      return { staleBlocks };
    });
  },

  clearBlockStale: (blockUid) => {
    set((state) => {
      const staleBlocks = new Set(state.staleBlocks);
      staleBlocks.delete(blockUid);
      return { staleBlocks };
    });
  },

  isBlockStale: (blockUid) => {
    return get().staleBlocks.has(blockUid);
  },

  getConsumersOf: (sourcePath) => {
    const producers = get().producers;
    return producers[sourcePath] ? Array.from(producers[sourcePath]) : [];
  },

  hasCircularImport: (consumerPath, sourcePath) => {
    // BFS to check if sourcePath eventually imports from consumerPath
    const visited = new Set<string>();
    const queue = [sourcePath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === consumerPath) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const sources = get().consumers[current];
      if (sources) {
        for (const s of sources) {
          if (!visited.has(s)) {
            queue.push(s);
          }
        }
      }
    }

    return false;
  },

  getSourceVersion: (sourcePath) => {
    return get().sourceVersions[sourcePath] || 0;
  },
}));
