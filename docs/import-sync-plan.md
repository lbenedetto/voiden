# Import Dependency Sync

## Problem

When a `.void` file imports blocks from another file (or from the same file), changes to the source block are not reflected in the imported block. Imported blocks only refresh on re-render (tab switch, file reload).

## Solution: Source-driven propagation

Instead of auto-refreshing linked blocks (which causes flickering and inconsistency), the sync is **source-driven**: a small indicator appears on any block that is used as a linked source, and clicking it propagates the latest content to all dependents.

## Architecture

### 1. SourceSyncIndicator (ProseMirror Extension)

A lightweight ProseMirror plugin that scans the document for `linkedBlock` nodes, identifies which source blocks they reference, and renders a clickable decoration on each source block.

**Location:** `apps/ui/src/core/editors/voiden/extensions/SourceSyncIndicator.tsx`

**How it works:**
1. On every doc change, `findLinkedSourceUids()` traverses the document and builds a `Map<sourceUid, Set<originalFile>>` of all block UIDs referenced by `linkedBlock` nodes
2. `buildDecorations()` creates a `Decoration.widget` at `pos + 1` of each source block whose UID is in the map
3. The widget is a plain `<div class="source-sync-indicator">` styled via CSS — a small dot with a superscript consumer count
4. The plugin's `handleClick` intercepts clicks on the indicator:
   - Finds the source block by UID in the current doc
   - Serializes it via `sourceBlock.toJSON()`
   - Updates `blockContentStore` with the fresh content
   - Invalidates all React Query caches matching `["voiden-wrapper:blockContent", *, blockUid]`
   - All linked blocks re-fetch and re-render with the latest data
   - A brief CSS animation provides visual feedback

### 2. BlockLink (unchanged from original)

`BlockLink.tsx` remains simple — it fetches block content via React Query on mount and on tab focus. No auto-refresh, no dependency tracking, no Zustand subscriptions.

**Content resolution:**
- React Query with `refetchOnMount: true` and `staleTime: 0`
- Fetches from disk via `window.electron.voiden.getBlockContent()`
- Parses markdown, finds block by UID, caches in `blockContentStore`
- The `SourceSyncIndicator`'s click handler invalidates the query cache, which triggers a refetch

### 3. Execution-time guarantee

At request execution time, `expandLinkedBlocks()` accepts a `{ forceRefresh: true }` option that bypasses the `blockContentStore` cache and always reads from disk. This ensures the HTTP request uses the latest data regardless of visual state.

**Callers updated with `forceRefresh: true`:**
- `voiden-rest-api/plugin.ts` — REST API request building
- `voiden-sockets/plugin.ts` — WebSocket/gRPC request building
- `simple-assertions/plugin.ts` — Assertion evaluation
- `voiden-scripting/lib/pipelineHooks.ts` — Pre/post script execution
- `apps/ui/src/core/request-engine/sendRequestHybrid.ts` — Hybrid request engine (2 call sites)

## Key Files

| File | Role |
|------|------|
| `apps/ui/src/core/editors/voiden/extensions/SourceSyncIndicator.tsx` | ProseMirror plugin — decorations + click-to-propagate |
| `apps/ui/src/core/editors/voiden/extensions/BlockLink.tsx` | Linked block rendering — fetch on mount, no auto-refresh |
| `apps/ui/src/core/editors/voiden/utils/expandLinkedBlocks.ts` | Block expansion with `forceRefresh` option for execution time |
| `apps/ui/src/core/imports/importDependencyStore.ts` | Zustand store — bidirectional dependency map (available for future use) |
| `apps/ui/src/styles.css` | CSS for `.source-sync-indicator` decoration |

## Design Decisions

**Why source-driven instead of auto-refresh?**
Auto-refresh (via editor subscriptions or Zustand version tracking) caused UI flickering because `BlockPreviewEditor` recreates its entire TipTap editor instance when the `block` prop changes. A 150-300ms debounce helped but made sync feel inconsistent. Source-driven propagation is explicit, instant, and flicker-free.

**Why ProseMirror decorations instead of React node views?**
The indicator needs to appear on any block type (request, headers-table, json_body, etc.) without modifying each block's node view. Decorations are non-invasive — they overlay content without changing the document model.

**Why invalidate React Query instead of setting state directly?**
Linked blocks may reference cross-file sources. React Query handles the async disk read and cache lifecycle. The `SourceSyncIndicator` first updates `blockContentStore` (for same-file, instant), then invalidates the query (for cross-file, triggers refetch from disk).

## Edge Cases

- **No linked consumers:** The indicator only appears when `linkedBlock` nodes reference the source UID. If all linked blocks are removed, the decoration disappears on the next doc change.
- **Cross-file sources:** The indicator appears on the source block in the current document. Cross-file consumers refresh via React Query cache invalidation when clicked.
- **Deleted source block:** `BlockLink.tsx` shows an error state ("Missing or outdated block") when the query fails to find the block by UID.
- **Execution time:** Always fresh — `forceRefresh: true` bypasses all caches and reads from disk.

## Out of Scope 

We should have a thorough look at a later point - but right now - this makes this whole thing managable. 

- Real-time collaborative editing sync 
- Import versioning / pinning to a specific version
- Import from remote URLs
- Auto-refresh on file save (removed — was causing flickering; the source sync button is the intended UX)
