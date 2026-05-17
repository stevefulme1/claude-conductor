import { useState, useRef, useCallback, useEffect } from "react";
import { SessionMeta, CanvasCardPosition } from "../types";

interface Props {
  sessions: SessionMeta[];
  labels: Record<string, string>;
  sessionAgents: Record<string, string>;
  onSelect: (session: SessionMeta) => void;
  onClose: () => void;
}

const CARD_W = 220;
const CARD_H = 120;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export default function SpatialCanvas({
  sessions,
  labels,
  sessionAgents,
  onSelect,
  onClose,
}: Props) {
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(1);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize positions for sessions that don't have one
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;
      sessions.forEach((session, idx) => {
        if (!next[session.session_id]) {
          const col = idx % 4;
          const row = Math.floor(idx / 4);
          next[session.session_id] = {
            x: col * (CARD_W + 40),
            y: row * (CARD_H + 40),
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sessions]);

  // Keyboard handlers for space key panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceHeld(false);
        setPanning(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, sessionId?: string) => {
    // Middle-click or space+click: pan
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      setPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    // Left-click on a card: start dragging it
    if (sessionId && e.button === 0) {
      setDragging(sessionId);
      const pos = positions[sessionId] || { x: 0, y: 0 };
      dragStart.current = {
        x: e.clientX / zoom - pos.x,
        y: e.clientY / zoom - pos.y,
      };
    }
  }, [spaceHeld, pan, positions, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panning) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
      return;
    }

    if (dragging) {
      setPositions(prev => ({
        ...prev,
        [dragging]: {
          x: e.clientX / zoom - dragStart.current.x,
          y: e.clientY / zoom - dragStart.current.y,
        },
      }));
    }
  }, [panning, dragging, zoom]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setPanning(false);
  }, []);

  const handleDoubleClick = useCallback((session: SessionMeta) => {
    onSelect(session);
  }, [onSelect]);

  const getStatusColor = (session: SessionMeta): string => {
    // Simple heuristic: new sessions are blue, sessions with messages are green
    if (session.message_count === 0) return "#4a9eff";
    if (session.message_count > 20) return "#30d158";
    return "#ff9f0a";
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={(e) => handleMouseDown(e)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        flex: 1,
        overflow: "hidden",
        background: "var(--bg-primary)",
        cursor: panning ? "grabbing" : spaceHeld ? "grab" : "default",
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* Grid pattern background */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          `radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)`,
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan.x % (20 * zoom)}px ${pan.y % (20 * zoom)}px`,
        pointerEvents: "none",
      }} />

      {/* Canvas header */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 16px",
        zIndex: 10,
        background: "linear-gradient(to bottom, var(--bg-primary), transparent)",
      }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-secondary)",
        }}>
          Spatial Canvas ({sessions.length} sessions) -- Zoom: {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onClose}
          style={{
            fontSize: 12,
            padding: "4px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-secondary)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Back to Tabs
        </button>
      </div>

      {/* Transformed canvas layer */}
      <div style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: "0 0",
        position: "absolute",
        top: 0,
        left: 0,
      }}>
        {sessions.map(session => {
          const pos = positions[session.session_id] || { x: 0, y: 0 };
          const agent = sessionAgents[session.session_id] || "claude";
          const label = labels[session.session_id] || "";
          const statusColor = getStatusColor(session);

          return (
            <div
              key={session.session_id}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, session.session_id);
              }}
              onDoubleClick={() => handleDoubleClick(session)}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: CARD_W,
                height: CARD_H,
                background: "var(--bg-secondary)",
                border: `1px solid var(--border-subtle)`,
                borderRadius: "var(--radius-md, 8px)",
                padding: 12,
                cursor: dragging === session.session_id ? "grabbing" : "pointer",
                boxShadow: dragging === session.session_id
                  ? "0 8px 24px rgba(0,0,0,0.3)"
                  : "0 2px 8px rgba(0,0,0,0.15)",
                transition: dragging === session.session_id ? "none" : "box-shadow 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                zIndex: dragging === session.session_id ? 100 : 1,
              }}
            >
              {/* Status dot + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusColor,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {label || session.project_display}
                </span>
              </div>

              {/* Agent badge */}
              <span style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--bg-tertiary, rgba(255,255,255,0.06))",
                color: "var(--text-tertiary)",
                width: "fit-content",
                textTransform: "capitalize",
              }}>
                {agent}
              </span>

              {/* Info row */}
              <div style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: "auto",
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span>{session.message_count} msgs</span>
                <span>Double-click to open</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
