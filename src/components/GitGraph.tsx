import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitLogEntry } from "../types";

interface Props {
  cwd: string;
  visible: boolean;
  onClose: () => void;
}

export default function GitGraph({ cwd, visible, onClose }: Props) {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<GitLogEntry[]>("get_git_log", {
        cwd,
        limit: 50,
      });
      setEntries(result);
    } catch (err) {
      setError(String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (visible) {
      loadLog();
    }
  }, [visible, loadLog]);

  const copyHash = useCallback((hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(hash);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  function refStyle(refName: string): React.CSSProperties {
    if (refName.startsWith("HEAD")) {
      return { ...styles.refBadge, background: "rgba(74, 222, 128, 0.15)", color: "rgb(74, 222, 128)" };
    }
    if (refName.startsWith("tag:")) {
      return { ...styles.refBadge, background: "rgba(250, 204, 21, 0.15)", color: "rgb(250, 204, 21)" };
    }
    return { ...styles.refBadge, background: "rgba(96, 165, 250, 0.15)", color: "rgb(96, 165, 250)" };
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Git Graph</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={loadLog} style={styles.refreshBtn} disabled={loading}>
              Refresh
            </button>
            <button onClick={onClose} style={styles.closeBtn}>&times;</button>
          </div>
        </div>
        {copied && (
          <div style={styles.toast}>Copied: {copied}</div>
        )}
        <div style={styles.body}>
          {loading && entries.length === 0 && (
            <div style={styles.empty}>Loading...</div>
          )}
          {error && (
            <div style={styles.error}>{error}</div>
          )}
          {entries.map((entry) => (
            <button
              key={entry.hash}
              onClick={() => copyHash(entry.short_hash)}
              style={styles.row}
              title={`Click to copy ${entry.short_hash}`}
            >
              <span style={styles.graph}>{entry.graph_chars}</span>
              <span style={styles.hash}>{entry.short_hash}</span>
              {entry.refs.map((r, i) => (
                <span key={i} style={refStyle(r)}>{r}</span>
              ))}
              <span style={styles.message}>{entry.message}</span>
              <span style={styles.meta}>
                <span style={styles.author}>{entry.author}</span>
                <span style={styles.time}>{entry.time_ago}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    paddingTop: 60,
  },
  panel: {
    width: 850,
    maxHeight: "80vh",
    background: "var(--bg-primary)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  closeBtn: {
    fontSize: 18,
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "2px 6px",
  },
  refreshBtn: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
  },
  toast: {
    padding: "6px 16px",
    fontSize: 12,
    color: "var(--success)",
    background: "rgba(74, 222, 128, 0.1)",
    textAlign: "center",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 0",
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: "var(--text-tertiary)",
    fontSize: 13,
  },
  error: {
    padding: "12px 16px",
    color: "var(--danger)",
    fontSize: 12,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
    fontSize: 12,
    lineHeight: 1.6,
    minHeight: 28,
  },
  graph: {
    fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', monospace)",
    color: "var(--text-tertiary)",
    whiteSpace: "pre",
    flexShrink: 0,
    fontSize: 11,
  },
  hash: {
    fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', monospace)",
    color: "var(--accent)",
    fontWeight: 500,
    flexShrink: 0,
    fontSize: 11,
  },
  refBadge: {
    fontSize: 10,
    padding: "1px 5px",
    borderRadius: 3,
    fontWeight: 500,
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  message: {
    flex: 1,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
  meta: {
    display: "flex",
    gap: 8,
    flexShrink: 0,
    marginLeft: "auto",
  },
  author: {
    color: "var(--text-tertiary)",
    fontSize: 11,
    whiteSpace: "nowrap",
  },
  time: {
    color: "var(--text-tertiary)",
    fontSize: 11,
    whiteSpace: "nowrap",
  },
};
