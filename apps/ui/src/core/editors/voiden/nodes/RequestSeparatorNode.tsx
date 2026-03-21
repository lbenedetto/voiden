/**
 * Request Separator Node
 *
 * Visual divider that splits a .void document into independent request sections.
 * Each section between separators has its own scope for endpoint, headers, body, etc.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

const RequestSeparatorView = () => {
  return (
    <NodeViewWrapper>
      <div
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
            borderTop: "2px dashed color-mix(in srgb, var(--accent) 40%, transparent)",
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: "color-mix(in srgb, var(--accent) 60%, transparent)",
            whiteSpace: "nowrap",
          }}
        >
          New Request
        </span>
        <div
          style={{
            flex: 1,
            height: "1px",
            borderTop: "2px dashed color-mix(in srgb, var(--accent) 40%, transparent)",
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
