import { useState, useRef, useMemo } from "react";
import { SessionMeta } from "../types";

interface Props {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  labels: Record<string, string>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export default function TabBar({ sessions, activeSessionId, labels, onSelect, onClose, onReorder }: Props) {
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartX = useRef(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s => {
      const name = labels[s.session_id] || shortenPath(s.cwd);
      return name.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q);
    });
  }, [sessions, search, labels]);

  if (sessions.length === 0) return null;

  const displaySessions = showSearch ? filtered : sessions;

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    dragStartX.current = e.clientX;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    setDragIndex(null);
    setDragOverIndex(null);
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div style={styles.bar}>
      <div style={styles.tabs}>
        {displaySessions.map((s, i) => {
          const realIndex = sessions.indexOf(s);
          const isActive = s.session_id === activeSessionId;
          const displayName = labels[s.session_id] || shortenPath(s.cwd);
          const isDragging = dragIndex === realIndex;
          const isDragOver = dragOverIndex === realIndex && dragIndex !== realIndex;
          return (
            <div
              key={s.session_id}
              draggable={!showSearch}
              onDragStart={(e) => handleDragStart(e, realIndex)}
              onDragOver={(e) => handleDragOver(e, realIndex)}
              onDrop={(e) => handleDrop(e, realIndex)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelect(s.session_id)}
              style={{
                ...styles.tab,
                ...(isActive ? styles.activeTab : {}),
                ...(isDragging ? { opacity: 0.4 } : {}),
                ...(isDragOver ? { borderLeftColor: "var(--accent)" } : {}),
              }}
            >
              <span style={styles.tabLabel}>{displayName}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(s.session_id); }}
                style={styles.closeBtn}
                title="Close session"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      {sessions.length > 3 && (
        <div style={styles.searchArea}>
          {showSearch ? (
            <input
              autoFocus
              type="text"
              placeholder="Filter tabs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); setSearch(""); } }}
              onBlur={() => { if (!search) setShowSearch(false); }}
              style={styles.searchInput}
            />
          ) : (
            <button onClick={() => setShowSearch(true)} style={styles.searchBtn} title="Search tabs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "stretch",
    background: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    height: 36,
  },
  tabs: {
    display: "flex",
    alignItems: "stretch",
    overflowX: "auto",
    overflowY: "hidden",
    flex: 1,
    gap: 1,
    paddingLeft: 4,
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 10px",
    fontSize: 12,
    color: "var(--text-tertiary)",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    borderLeft: "2px solid transparent",
    whiteSpace: "nowrap",
    maxWidth: 200,
    minWidth: 0,
    transition: "var(--transition)",
    userSelect: "none",
  },
  activeTab: {
    color: "var(--text-primary)",
    borderBottomColor: "var(--accent)",
    background: "var(--bg-tertiary)",
  },
  tabLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  closeBtn: {
    padding: 2,
    borderRadius: 3,
    color: "inherit",
    opacity: 0.6,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  searchArea: {
    display: "flex",
    alignItems: "center",
    paddingRight: 8,
    flexShrink: 0,
  },
  searchBtn: {
    padding: 6,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    display: "flex",
    alignItems: "center",
  },
  searchInput: {
    width: 120,
    padding: "4px 8px",
    fontSize: 11,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    outline: "none",
  },
};
