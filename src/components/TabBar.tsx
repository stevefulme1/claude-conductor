import { SessionMeta } from "../types";

interface Props {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  labels: Record<string, string>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export default function TabBar({ sessions, activeSessionId, labels, onSelect, onClose }: Props) {
  if (sessions.length === 0) return null;

  return (
    <div style={styles.bar}>
      {sessions.map(s => {
        const isActive = s.session_id === activeSessionId;
        const displayName = labels[s.session_id] || shortenPath(s.cwd);
        return (
          <div
            key={s.session_id}
            onClick={() => onSelect(s.session_id)}
            style={{
              ...styles.tab,
              ...(isActive ? styles.activeTab : {}),
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "stretch",
    background: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    overflowX: "auto",
    overflowY: "hidden",
    flexShrink: 0,
    height: 36,
    gap: 1,
    paddingLeft: 4,
    paddingRight: 4,
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
};
