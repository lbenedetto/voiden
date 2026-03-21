/**
 * Request Separator Node
 *
 * Visual divider that splits a .void document into independent request sections.
 * Each section between separators has its own scope for endpoint, headers, body, etc.
 * Stores a `colorIndex` attribute that determines the section's indicator color.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewProps, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useRef, useState, useEffect } from "react";
import { getSectionLineColor } from "../extensions/sectionIndicator";

const RequestSeparatorView = (props: NodeViewProps) => {
  const { node } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [decorationColor, setDecorationColor] = useState<string | null>(null);

  // Read section color from decoration data attribute (set by sectionIndicator plugin)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const parentNode = el.closest("[data-section-color]") as HTMLElement | null;
    if (parentNode) {
      setDecorationColor(parentNode.getAttribute("data-section-color"));
    }

    const observer = new MutationObserver(() => {
      const parent = el.closest("[data-section-color]") as HTMLElement | null;
      setDecorationColor(parent?.getAttribute("data-section-color") ?? null);
    });
    const target = el.parentElement?.parentElement;
    if (target) {
      observer.observe(target, { attributes: true, attributeFilter: ["data-section-color"] });
    }
    return () => observer.disconnect();
  }, []);

  // Use decoration color if available, otherwise derive from stored colorIndex
  const colorIndex = typeof node.attrs.colorIndex === "number" ? node.attrs.colorIndex : 0;
  const lineColor = decorationColor ?? getSectionLineColor(colorIndex);
  const textColor = decorationColor ?? getSectionLineColor(colorIndex);

  return (
    <NodeViewWrapper>
      <div
        ref={wrapperRef}
        contentEditable={false}
        data-type="request-separator"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          margin: "24px 0",
          userSelect: "none",
        }}
      >
        <div
          style={{
            flex: 1,
            height: "1px",
            borderTop: `2px dashed ${lineColor}`,
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: textColor,
            whiteSpace: "nowrap",
          }}
        >
          New Request
        </span>
        <div
          style={{
            flex: 1,
            height: "1px",
            borderTop: `2px dashed ${lineColor}`,
          }}
        />
      </div>
    </NodeViewWrapper>
  );
};

export const RequestSeparatorNode = Node.create({
  name: "request-separator",

  group: "block",

  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      colorIndex: {
        default: 0,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="request-separator"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "request-separator" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RequestSeparatorView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { $from } = this.editor.state.selection;
        const node = this.editor.state.doc.nodeAt($from.pos);
        if (node?.type.name === "request-separator") {
          this.editor.commands.deleteSelection();
          return true;
        }
        return false;
      },
    };
  },
});
