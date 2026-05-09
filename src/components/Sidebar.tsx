import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionMeta } from "../types";
import SessionCard from "./SessionCard";

interface Props {
  activeSession: SessionMeta | null;
  onSelect: (session: SessionMeta) => void;
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

export default function Sidebar({ activeSession, onSelect }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
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

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        s.first_message.toLowerCase().includes(q) ||
        s.project_display.toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q)
    );
  }, [sessions, search]);

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
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <div style={styles.logoArea}>
            <div style={styles.logo}>C</div>
            <div>
              <div style={styles.title}>Conductor</div>
              <div style={styles.subtitle}>{sessions.length} sessions</div>
            </div>
          </div>
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

      <div style={styles.footer}>
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
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    fontSize: 12,
    color: "var(--text-secondary)",
    borderRadius: "var(--radius-sm)",
    width: "100%",
    justifyContent: "center",
    transition: "var(--transition)",
  },
};
