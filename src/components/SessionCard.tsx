import { useState, useRef, useEffect } from "react";
import { SessionMeta } from "../types";

interface Props {
  session: SessionMeta;
  isActive: boolean;
  isOpen: boolean;
  timeAgo: string;
  label: string;
  onRename: (label: string) => void;
  onDelete: () => void;
  onClick: () => void;
}

function shortenPath(path: string): string {
  const homePatterns = ["/Users/", "/home/"];
  for (const prefix of homePatterns) {
    if (path.startsWith(prefix)) {
      const after = path.slice(prefix.length);
      const slash = after.indexOf("/");
      return slash >= 0 ? "~" + after.slice(slash) : "~";
    }
  }
  return path;
}

export default function SessionCard({
  session,
  isActive,
  isOpen,
  timeAgo,
  label,
  onRename,
  onDelete,
  onClick,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setEditValue(label);
    setEditing(true);
  }

  function commitRename() {
    setEditing(false);
    if (editValue.trim() !== label) {
      onRename(editValue.trim());
    }
  }

  const background = isActive
    ? styles.active.background
    : hovered
      ? "var(--bg-hover)"
      : "transparent";

  return (
    <button
      onClick={onClick}
      style={{
        ...styles.card,
        ...(isActive ? styles.active : {}),
        background,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Name this session..."
          style={styles.labelInput}
        />
      ) : (
        <div style={styles.top}>
          <div style={styles.topLeft}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isOpen && <span style={styles.openDot} title="Session open in tab" />}
              {label && <span style={styles.label}>{label}</span>}
            </div>
            <span style={styles.project}>{shortenPath(session.cwd)}</span>
          </div>
          <div style={styles.topRight}>
            {hovered && (
              <>
                <button
                  onClick={startRename}
                  style={styles.actionBtn}
                  title="Rename session"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  style={{ ...styles.actionBtn, color: "var(--danger)" }}
                  title="Delete session"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </>
            )}
            <span style={styles.time}>{timeAgo}</span>
          </div>
        </div>
      )}
      <div style={styles.message}>{session.first_message}</div>
      <div style={styles.meta}>
        <span style={styles.badge}>{session.message_count} msgs</span>
      </div>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    borderRadius: "var(--radius-md)",
    textAlign: "left",
    transition: "var(--transition)",
    marginBottom: 2,
    border: "1px solid transparent",
  },
  active: {
    background: "var(--accent-muted)",
    border: "1px solid rgba(212, 132, 90, 0.25)",
  },
  top: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
    gap: 6,
  },
  topLeft: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  openDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--success)",
    flexShrink: 0,
    boxShadow: "0 0 4px rgba(74, 222, 128, 0.4)",
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  project: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--accent)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  time: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    flexShrink: 0,
  },
  actionBtn: {
    padding: 2,
    borderRadius: 3,
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  labelInput: {
    width: "100%",
    padding: "3px 6px",
    fontSize: 12,
    fontWeight: 600,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--accent)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    outline: "none",
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  meta: {
    display: "flex",
    gap: 6,
    marginTop: 6,
  },
  badge: {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    background: "var(--bg-tertiary)",
    color: "var(--text-tertiary)",
    fontWeight: 500,
  },
};
