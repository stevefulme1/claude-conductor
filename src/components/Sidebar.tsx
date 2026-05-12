import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SessionMeta } from "../types";
import SessionCard from "./SessionCard";
import ConfigPanel from "./ConfigPanel";

function startDrag(e: React.MouseEvent) {
  if (e.buttons === 1 && e.detail === 1) {
    getCurrentWindow().startDragging();
  }
}

interface Props {
  activeSession: SessionMeta | null;
  onSelect: (session: SessionMeta) => void;
  onNewSession: () => void;
}

function timeAgo(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "unknown";
  const now = Date.now();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function groupSessions(
  sessions: SessionMeta[]
): Record<string, SessionMeta[]> {
  const groups: Record<string, SessionMeta[]> = {};
  const now = Date.now();

  for (const s of sessions) {
    const then = new Date(s.last_modified).getTime();
    const hours = isNaN(then) ? Infinity : (now - then) / 3600000;
    let label: string;
    if (hours < 24) label = "Today";
    else if (hours < 48) label = "Yesterday";
    else if (hours < 168) label = "This Week";
    else if (hours < 720) label = "This Month";
    else label = "Older";

    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  }
  return groups;
}

export default function Sidebar({ activeSession, onSelect, onNewSession }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSessions();
    loadLabels();
    const interval = setInterval(loadSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadSessions() {
    try {
      const result = await invoke<SessionMeta[]>("list_sessions");
      setSessions(result);
      setError(null);
    } catch (e) {
      console.error("Failed to load sessions:", e);
      setError(`Failed to load sessions: ${e}`);
    }
  }

  async function loadLabels() {
    try {
      const result = await invoke<Record<string, string>>(
        "get_session_labels"
      );
      setLabels(result);
    } catch (e) {
      console.error("Failed to load labels:", e);
    }
  }

  async function renameSession(sessionId: string, label: string) {
    try {
      await invoke("set_session_label", { sessionId, label });
      setLabels((prev) => {
        const next = { ...prev };
        if (label.trim()) {
          next[sessionId] = label.trim();
        } else {
          delete next[sessionId];
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to rename session:", e);
    }
  }

  async function deleteSession(sessionId: string, filePath: string) {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    try {
      await invoke("delete_session", { filePath });
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        s.first_message.toLowerCase().includes(q) ||
        s.project_display.toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q) ||
        (labels[s.session_id] || "").toLowerCase().includes(q)
    );
  }, [sessions, search, labels]);

  const grouped = useMemo(() => groupSessions(filtered), [filtered]);
  const groupOrder = [
    "Today",
    "Yesterday",
    "This Week",
    "This Month",
    "Older",
  ];

  if (collapsed) {
    return (
      <div style={styles.collapsedBar}>
        <button
          onClick={() => setCollapsed(false)}
          style={styles.expandBtn}
          title="Expand sidebar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div style={styles.collapsedCount}>{sessions.length}</div>
      </div>
    );
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.header} onMouseDown={startDrag}>
        <div style={styles.titleRow}>
          <div style={styles.logoArea}>
            <div style={styles.logo}>C</div>
            <div>
              <div style={styles.title}>Conductor</div>
              <div style={styles.subtitle}>{sessions.length} sessions</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={onNewSession}
              style={styles.newBtn}
              title="New session (Cmd+N)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              onClick={() => setCollapsed(true)}
              style={styles.collapseBtn}
              title="Collapse sidebar"
            >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          </div>
        </div>
        <div style={styles.searchWrap}>
          <svg
            style={styles.searchIcon}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      <div style={styles.list}>
        {error && (
          <div style={styles.errorBanner}>
            <span style={styles.errorText}>{error}</span>
            <button onClick={loadSessions} style={styles.retryBtn}>
              Retry
            </button>
          </div>
        )}
        {groupOrder.map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          return (
            <div key={group}>
              <div style={styles.groupLabel}>{group}</div>
              {items.map((session) => (
                <SessionCard
                  key={session.session_id}
                  session={session}
                  isActive={
                    activeSession?.session_id === session.session_id
                  }
                  timeAgo={timeAgo(session.last_modified)}
                  label={labels[session.session_id] || ""}
                  onRename={(label) =>
                    renameSession(session.session_id, label)
                  }
                  onDelete={() =>
                    deleteSession(session.session_id, session.file_path)
                  }
                  onClick={() => onSelect(session)}
                />
              ))}
            </div>
          );
        })}
        {!error && filtered.length === 0 && (
          <div style={styles.empty}>
            {search ? "No matching sessions" : "No sessions found"}
          </div>
        )}
      </div>

      {showConfig && <ConfigPanel onClose={() => setShowConfig(false)} />}

      <div style={styles.footer}>
        <div style={styles.footerRow}>
          <button onClick={loadSessions} style={styles.refreshBtn}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            style={styles.settingsBtn}
            title="Settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 300,
    minWidth: 300,
    height: "100vh",
    background: "var(--bg-secondary)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    userSelect: "none",
  },
  collapsedBar: {
    width: 48,
    minWidth: 48,
    height: "100vh",
    background: "var(--bg-secondary)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 52,
    gap: 12,
  },
  expandBtn: {
    padding: 8,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    transition: "var(--transition)",
  },
  collapsedCount: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontWeight: 600,
  },
  header: {
    padding: "52px 16px 12px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: "var(--radius-sm)",
    background: "linear-gradient(135deg, var(--accent), #c47a50)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 16,
    color: "#fff",
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 11,
    color: "var(--text-tertiary)",
  },
  newBtn: {
    padding: 6,
    borderRadius: "var(--radius-sm)",
    color: "var(--accent)",
    transition: "var(--transition)",
  },
  collapseBtn: {
    padding: 6,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
  },
  searchWrap: {
    position: "relative" as const,
  },
  searchIcon: {
    position: "absolute" as const,
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-tertiary)",
    pointerEvents: "none" as const,
  },
  searchInput: {
    width: "100%",
    padding: "8px 12px 8px 32px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    outline: "none",
    color: "var(--text-primary)",
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 8px",
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    padding: "12px 8px 4px",
  },
  empty: {
    padding: 24,
    textAlign: "center" as const,
    color: "var(--text-tertiary)",
    fontSize: 13,
  },
  errorBanner: {
    margin: "8px 4px",
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(248, 113, 113, 0.1)",
    border: "1px solid rgba(248, 113, 113, 0.2)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: "var(--danger)",
    lineHeight: 1.4,
    wordBreak: "break-word" as const,
  },
  retryBtn: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(248, 113, 113, 0.15)",
    color: "var(--danger)",
    alignSelf: "flex-start" as const,
  },
  footer: {
    padding: "10px 16px",
    borderTop: "1px solid var(--border-subtle)",
    position: "relative" as const,
  },
  footerRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    fontSize: 12,
    color: "var(--text-secondary)",
    borderRadius: "var(--radius-sm)",
    flex: 1,
    justifyContent: "center",
    transition: "var(--transition)",
  },
  settingsBtn: {
    padding: 6,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    transition: "var(--transition)",
    flexShrink: 0,
  },
};
