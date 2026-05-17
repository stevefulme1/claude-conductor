import { useState, useRef, useCallback } from "react";
import { PaneNode } from "../types";

interface Props {
  node: PaneNode;
  renderTerminal: (sessionId: string) => React.ReactNode;
  onClosePane?: (sessionId: string) => void;
}

export default function SplitPane({ node, renderTerminal, onClosePane }: Props) {
  if (node.type === "terminal" && node.sessionId) {
    return <div style={styles.terminalPane}>{renderTerminal(node.sessionId)}</div>;
  }

  if (node.type === "split" && node.children) {
    return (
      <SplitContainer
        direction={node.direction || "horizontal"}
        initialPercent={node.splitPercent || 50}
        left={
          <SplitPane
            node={node.children[0]}
            renderTerminal={renderTerminal}
            onClosePane={onClosePane}
          />
        }
        right={
          <SplitPane
            node={node.children[1]}
            renderTerminal={renderTerminal}
            onClosePane={onClosePane}
          />
        }
      />
    );
  }

  return null;
}

interface SplitContainerProps {
  direction: "horizontal" | "vertical";
  initialPercent: number;
  left: React.ReactNode;
  right: React.ReactNode;
}

function SplitContainer({ direction, initialPercent, left, right }: SplitContainerProps) {
  const [percent, setPercent] = useState(initialPercent);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const isHorizontal = direction === "horizontal";

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        let pct: number;
        if (isHorizontal) {
          pct = ((ev.clientX - rect.left) / rect.width) * 100;
        } else {
          pct = ((ev.clientY - rect.top) / rect.height) * 100;
        }
        pct = Math.max(15, Math.min(85, pct));
        setPercent(pct);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [isHorizontal]
  );

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: isHorizontal ? "row" : "column",
    flex: 1,
    overflow: "hidden",
    height: "100%",
  };

  const firstStyle: React.CSSProperties = isHorizontal
    ? { width: `${percent}%`, overflow: "hidden", display: "flex" }
    : { height: `${percent}%`, overflow: "hidden", display: "flex" };

  const secondStyle: React.CSSProperties = isHorizontal
    ? { flex: 1, overflow: "hidden", display: "flex" }
    : { flex: 1, overflow: "hidden", display: "flex" };

  const dividerStyle: React.CSSProperties = {
    ...(isHorizontal
      ? { width: 4, minWidth: 4, cursor: "col-resize" }
      : { height: 4, minHeight: 4, cursor: "row-resize" }),
    background: "var(--border)",
    flexShrink: 0,
    position: "relative",
    zIndex: 10,
  };

  const dividerHoverStyle: React.CSSProperties = {
    position: "absolute",
    ...(isHorizontal
      ? { top: 0, bottom: 0, left: -3, right: -3 }
      : { left: 0, right: 0, top: -3, bottom: -3 }),
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      <div style={firstStyle}>{left}</div>
      <div style={dividerStyle} onMouseDown={onMouseDown}>
        <div style={dividerHoverStyle} />
      </div>
      <div style={secondStyle}>{right}</div>
    </div>
  );
}

// Helper to create a split from an existing pane
export function splitPane(
  current: PaneNode,
  newSessionId: string,
  direction: "horizontal" | "vertical"
): PaneNode {
  return {
    type: "split",
    direction,
    splitPercent: 50,
    children: [current, { type: "terminal", sessionId: newSessionId }],
  };
}

// Helper to remove a pane from the tree, returning the remaining subtree
export function removePane(root: PaneNode, sessionId: string): PaneNode | null {
  if (root.type === "terminal") {
    return root.sessionId === sessionId ? null : root;
  }

  if (root.type === "split" && root.children) {
    const [left, right] = root.children;
    const newLeft = removePane(left, sessionId);
    const newRight = removePane(right, sessionId);

    if (!newLeft && !newRight) return null;
    if (!newLeft) return newRight;
    if (!newRight) return newLeft;

    return { ...root, children: [newLeft, newRight] };
  }

  return root;
}

// Collect all session IDs from a pane tree
export function collectSessionIds(node: PaneNode): string[] {
  if (node.type === "terminal" && node.sessionId) {
    return [node.sessionId];
  }
  if (node.type === "split" && node.children) {
    return [
      ...collectSessionIds(node.children[0]),
      ...collectSessionIds(node.children[1]),
    ];
  }
  return [];
}

const styles: Record<string, React.CSSProperties> = {
  terminalPane: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
    position: "relative",
  },
};
