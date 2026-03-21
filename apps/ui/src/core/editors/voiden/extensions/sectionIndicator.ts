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
 * - Readable on both dark and light backgrounds at 50% opacity for borders
 * - Ordered so that consecutive colors have maximum contrast
 *
 * The ordering follows a "maximally spaced" pattern across the hue wheel:
 * blue → orange → teal → rose → lime → purple → amber → cyan → red → green
 */
export const SECTION_COLORS = [
  "#4A90D9",  // 0  blue
  "#D97B3F",  // 1  orange
  "#2DA89E",  // 2  teal
  "#D9587B",  // 3  rose
  "#7BBF40",  // 4  lime
  "#9B6FCF",  // 5  purple
  "#C9A832",  // 6  amber
  "#3FAED4",  // 7  cyan
  "#CF4F4F",  // 8  red
  "#4CAF7D",  // 9  green
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
  // Convert hex to rgba with 50% opacity for the border
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.5)`;
}

/** Get a muted version for text/lines */
export function getSectionLineColor(colorIndex: number): string {
  const hex = SECTION_COLORS[colorIndex % SECTION_COLORS.length];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.45)`;
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
});
