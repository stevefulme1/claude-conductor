import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionMeta, SessionStatus } from "../types";

const COLUMNS: { status: SessionStatus; label: string; color: string }[] = [
  { status: "planning", label: "Planning", color: "#6366f1" },
  { status: "running", label: "Running", color: "#f59e0b" },
  { status: "review", label: "Review", color: "#3b82f6" },
  { status: "done", label: "Done", color: "#22c55e" },
];

interface Props {
  sessions: SessionMeta[];
  labels: Record<string, string>;
  sessionAgents: Record<string, string>;
  onSelect: (session: SessionMeta) => void;
}

function timeAgo(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function KanbanBoard({ sessions, labels, sessionAgents, onSelect }: Props) {
  const [statuses, setStatuses] = useState<Record<string, SessionStatus>>({});
  const [dragOver, setDragOver] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke<Record<string, string>>("get_session_statuses")
      .then((s) => setStatuses(s as Record<string, SessionStatus>))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setStatus = useCallback(async (sessionId: string, status: SessionStatus) => {
    try {
      await invoke("set_session_status", { sessionId, status });
      setStatuses((prev) => ({ ...prev, [sessionId]: status }));
    } catch (e) {
      console.error("Failed to set status:", e);
    }
  }, []);

  const sessionsForColumn = (status: SessionStatus) =>
    sessions.filter((s) => (statuses[s.session_id] || "planning") === status);

  if (loading) {
    return (
      <div style={{ ...styles.board, alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading board...</span>
      </div>
    );
  }

  return (
    <div style={styles.board}>
      {COLUMNS.map((col) => {
        const items = sessionsForColumn(col.status);
        return (
          <div
            key={col.status}
            style={{
              ...styles.column,
              borderTop: `3px solid ${col.color}`,
              background: dragOver === col.status ? "var(--bg-tertiary)" : "var(--bg-secondary)",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.status);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const sessionId = e.dataTransfer.getData("text/plain");
              if (sessionId) setStatus(sessionId, col.status);
            }}
          >
            <div style={styles.columnHeader}>
              <span style={{ color: col.color, fontWeight: 600 }}>{col.label}</span>
              <span style={styles.count}>{items.length}</span>
            </div>
            <div style={styles.cardList}>
              {items.map((session) => (
                <div
                  key={session.session_id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", session.session_id)}
                  onClick={() => onSelect(session)}
                  style={styles.card}
                >
                  <div style={styles.cardTitle}>
                    {labels[session.session_id] || session.project_display}
                  </div>
                  <div style={styles.cardMeta}>
                    <span>{sessionAgents[session.session_id] || "claude"}</span>
                    <span>{timeAgo(session.last_modified)}</span>
                  </div>
                  <div style={styles.cardCwd} title={session.cwd}>
                    {session.cwd.split("/").slice(-2).join("/")}
                  </div>
                  <select
                    value={statuses[session.session_id] || "planning"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setStatus(session.session_id, e.target.value as SessionStatus)}
                    style={styles.statusSelect}
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.status} value={c.status}>{c.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              {items.length === 0 && (
                <div style={styles.emptyCol}>No sessions</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  board: {
    display: "flex",
    gap: 12,
    padding: 16,
    flex: 1,
    overflow: "auto",
    background: "var(--bg-primary)",
  },
  column: {
    flex: 1,
    minWidth: 200,
    borderRadius: "var(--radius-md, 8px)",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    transition: "background 0.15s",
  },
  columnHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 4px 10px",
    fontSize: 13,
  },
  count: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    background: "var(--bg-tertiary)",
    borderRadius: 10,
    padding: "1px 7px",
  },
  cardList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: 1,
    minHeight: 60,
  },
  card: {
    padding: "10px 12px",
    background: "var(--bg-primary)",
    borderRadius: "var(--radius-sm, 6px)",
    border: "1px solid var(--border-subtle)",
    cursor: "grab",
    transition: "box-shadow 0.15s",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardMeta: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "var(--text-tertiary)",
    marginBottom: 4,
  },
  cardCwd: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginBottom: 6,
  },
  statusSelect: {
    fontSize: 11,
    padding: "2px 4px",
    borderRadius: 4,
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
  },
  emptyCol: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    textAlign: "center",
    padding: 16,
    opacity: 0.6,
  },
};
