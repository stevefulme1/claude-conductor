import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileChange } from "../types";

interface Props {
  cwd: string;
  visible: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  added: "#4ade80",
  modified: "#fbbf24",
  deleted: "#f87171",
  renamed: "#60a5fa",
  copied: "#c084fc",
};

const STATUS_ICONS: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
};

export default function FileChanges({ cwd, visible }: Props) {
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible || !cwd) return;

    const fetchChanges = async () => {
      setLoading(true);
      try {
        const result = await invoke<FileChange[]>("get_file_changes", { cwd });
        setChanges(result);
      } catch {
        setChanges([]);
      } finally {
        setLoading(false);
      }
    };

    fetchChanges();
    timerRef.current = setInterval(fetchChanges, 5000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cwd, visible]);

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>File Changes</span>
        <span style={styles.badge}>{changes.length}</span>
        {loading && <span style={styles.loading}>...</span>}
      </div>
      <div style={styles.list}>
        {changes.length === 0 && (
          <div style={styles.empty}>No changes detected</div>
        )}
        {changes.map((change, i) => (
          <div key={`${change.path}-${i}`} style={styles.item}>
            <span
              style={{
                ...styles.statusBadge,
                color: STATUS_COLORS[change.status] || "#999",
                borderColor: STATUS_COLORS[change.status] || "#999",
              }}
            >
              {STATUS_ICONS[change.status] || "?"}
            </span>
            <span style={styles.filePath}>{change.path}</span>
            {change.staged && <span style={styles.stagedBadge}>staged</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FileChangeBadge({ cwd }: { cwd: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const result = await invoke<FileChange[]>("get_file_changes", { cwd });
        if (!cancelled) setCount(result.length);
      } catch {
        if (!cancelled) setCount(0);
      }
    };

    fetchCount();
    const timer = setInterval(fetchCount, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cwd]);

  if (count === 0) return null;

  return <span style={styles.countBadge}>{count}</span>;
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    maxHeight: 200,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  badge: {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 8,
    background: "var(--bg-tertiary)",
    color: "var(--text-tertiary)",
  },
  loading: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    marginLeft: "auto",
  },
  list: {
    overflowY: "auto",
    flex: 1,
    padding: "4px 0",
  },
  empty: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    padding: "12px",
    textAlign: "center",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 12px",
    fontSize: 12,
    fontFamily: "'SF Mono', monospace",
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 700,
    width: 16,
    height: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid",
    borderRadius: 3,
    flexShrink: 0,
  },
  filePath: {
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  stagedBadge: {
    fontSize: 9,
    padding: "1px 4px",
    borderRadius: 3,
    background: "rgba(74, 222, 128, 0.15)",
    color: "#4ade80",
    flexShrink: 0,
  },
  countBadge: {
    fontSize: 9,
    padding: "0 5px",
    borderRadius: 8,
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 600,
    lineHeight: "16px",
    minWidth: 16,
    textAlign: "center",
    flexShrink: 0,
  },
};
