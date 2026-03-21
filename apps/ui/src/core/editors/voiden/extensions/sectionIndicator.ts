/**
 * Section Indicator Extension
 *
 * Adds a colored left border to each top-level node in the ProseMirror document,
 * cycling colors per request section (delimited by request-separator nodes).
 * Colors are stored on each separator's `colorIndex` attribute and persisted
 * in the .void file. Adjacent sections always get distinct colors.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const sectionIndicatorKey = new PluginKey("sectionIndicator");

/**
 * 10 curated colors that are:
 * - Visually distinct from each other (especially adjacent pairs)
 * - Soft enough for dark backgrounds, visible enough on light backgrounds
 * - Ordered so that consecutive colors have maximum contrast
 *
 * The ordering follows a "maximally spaced" pattern across the hue wheel:
 * blue → orange → teal → rose → lime → purple → amber → cyan → red → green
 */
export const SECTION_COLORS = [
  "#6BA3D6",  // 0  blue
  "#D4956A",  // 1  orange
  "#5DBCB5",  // 2  teal
  "#D47A93",  // 3  rose
  "#8EC76A",  // 4  lime
  "#A98ED4",  // 5  purple
  "#CDB458",  // 6  amber
  "#5BC0D9",  // 7  cyan
  "#D47272",  // 8  red
  "#6BBF92",  // 9  green
];

/**
 * Pick a color index for a new separator that avoids its neighbors.
 * `prevColorIndex` is the color of the section before, or -1 if first separator.
 * `nextColorIndex` is the color of the section after, or -1 if last separator.
 */
export function pickDistinctColorIndex(
  prevColorIndex: number,
  nextColorIndex: number
): number {
  const avoid = new Set<number>();
  if (prevColorIndex >= 0) avoid.add(prevColorIndex);
  if (nextColorIndex >= 0) avoid.add(nextColorIndex);

  // Pick a random index that avoids neighbors
  const candidates = Array.from({ length: SECTION_COLORS.length }, (_, i) => i)
    .filter((i) => !avoid.has(i));

  if (candidates.length === 0) {
    // All colors are taken by neighbors (shouldn't happen with 10 colors)
    return Math.floor(Math.random() * SECTION_COLORS.length);
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Get the display color string (with opacity for borders) */
export function getSectionColor(colorIndex: number): string {
  const hex = SECTION_COLORS[colorIndex % SECTION_COLORS.length];
  return hex;
}

/** Get the border color with appropriate opacity */
export function getSectionBorderColor(colorIndex: number): string {
  const hex = SECTION_COLORS[colorIndex % SECTION_COLORS.length];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.6)`;
}

/** Get a muted version for text/lines */
export function getSectionLineColor(colorIndex: number): string {
  const hex = SECTION_COLORS[colorIndex % SECTION_COLORS.length];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.55)`;
}

function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  let currentColorIndex = 0; // Default for first section (before any separator)
  let hasSeparators = false;

  // First pass: collect separator color indices to determine first section color
  const separatorColors: number[] = [];
  doc.forEach((node: any) => {
    if (node.type.name === "request-separator") {
      separatorColors.push(
        typeof node.attrs.colorIndex === "number" ? node.attrs.colorIndex : 0
      );
    }
  });

  if (separatorColors.length === 0) {
    return DecorationSet.empty;
  }

  // First section gets a color that's distinct from the first separator's section
  // We use index 0 by default for the first section
  currentColorIndex = pickDistinctColorIndex(separatorColors[0], -1);
  // But make it deterministic: always use 0 for the first section
  currentColorIndex = 0;

  let separatorIdx = 0;

  doc.forEach((node: any, offset: number) => {
    if (node.type.name === "request-separator") {
      hasSeparators = true;
      const storedIndex = typeof node.attrs.colorIndex === "number"
        ? node.attrs.colorIndex
        : separatorIdx; // fallback for legacy separators without colorIndex

      currentColorIndex = storedIndex;
      separatorIdx++;

      const borderColor = getSectionBorderColor(currentColorIndex);

      decorations.push(
        Decoration.node(offset, offset + node.nodeSize, {
          style: `border-left: 3px solid ${borderColor}; padding-left: 8px;`,
          "data-section-color": getSectionLineColor(currentColorIndex),
        })
      );
      return;
    }

    const borderColor = getSectionBorderColor(currentColorIndex);

    decorations.push(
      Decoration.node(offset, offset + node.nodeSize, {
        style: `border-left: 3px solid ${borderColor}; padding-left: 8px;`,
      })
    );
  });

  if (!hasSeparators) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(doc, decorations);
}

const sectionIndicatorPlugin = new Plugin({
  key: sectionIndicatorKey,
  state: {
    init(_, state) {
      return buildDecorations(state.doc);
    },
    apply(tr, old, _oldState, newState) {
      if (tr.docChanged) {
        return buildDecorations(newState.doc);
      }
      return old;
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});

export const SectionIndicatorExtension = Extension.create({
  name: "sectionIndicator",
  addProseMirrorPlugins() {
    return [sectionIndicatorPlugin];
  },

  /**
   * Auto-assign distinct colors to separators that have duplicate or
   * conflicting colors with their neighbors. Runs once after doc loads
   * and after any structural changes.
   */
  onTransaction({ editor, transaction }) {
    if (!transaction.docChanged) return;
    this.storage.pendingColorFix = true;
  },

  onUpdate({ editor }) {
    if (this.storage.pendingColorFix) {
      this.storage.pendingColorFix = false;
      fixSeparatorColors(editor);
    }
  },

  addStorage() {
    return {
      pendingColorFix: false,
    };
  },
});

/**
 * Checks all separators and fixes any that have the same color as their
 * neighbor (the previous separator). Also assigns colors to separators
 * that still have the default colorIndex=0 when there are multiple separators.
 */
function fixSeparatorColors(editor: any) {
  const { doc } = editor.state;
  const separators: Array<{ pos: number; colorIndex: number }> = [];

  doc.forEach((node: any, offset: number) => {
    if (node.type.name === "request-separator") {
      separators.push({
        pos: offset,
        colorIndex: typeof node.attrs.colorIndex === "number" ? node.attrs.colorIndex : 0,
      });
    }
  });

  if (separators.length === 0) return;

  // Check if colors need fixing: adjacent duplicates or all same color
  let needsFix = false;

  // First section is always color 0 — check if first separator conflicts
  let prevColor = 0; // first section's implicit color
  for (const sep of separators) {
    if (sep.colorIndex === prevColor) {
      needsFix = true;
      break;
    }
    prevColor = sep.colorIndex;
  }

  if (!needsFix) return;

  // Build new color assignments ensuring no adjacent duplicates
  const newColors: number[] = [];
  prevColor = 0; // first section's color

  for (let i = 0; i < separators.length; i++) {
    const nextColor = i + 1 < separators.length ? separators[i + 1].colorIndex : -1;
    const newColor = pickDistinctColorIndex(prevColor, nextColor);
    newColors.push(newColor);
    prevColor = newColor;
  }

  // Apply changes in a single transaction
  let tr = editor.state.tr;
  let changed = false;

  for (let i = 0; i < separators.length; i++) {
    if (separators[i].colorIndex !== newColors[i]) {
      const node = tr.doc.nodeAt(separators[i].pos);
      if (node && node.type.name === "request-separator") {
        tr = tr.setNodeMarkup(separators[i].pos, undefined, {
          ...node.attrs,
          colorIndex: newColors[i],
        });
        changed = true;
      }
    }
  }

  if (changed) {
    tr.setMeta("addToHistory", false); // Don't pollute undo stack
    editor.view.dispatch(tr);
  }
}
