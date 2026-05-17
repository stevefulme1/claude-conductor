import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckpointInfo } from "../types";

interface Props {
  cwd: string;
  visible: boolean;
}

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function CheckpointPanel({ cwd, visible }: Props) {
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchCheckpoints = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const result = await invoke<CheckpointInfo[]>("list_checkpoints", { cwd });
      setCheckpoints(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (visible && cwd) {
      fetchCheckpoints();
    }
  }, [visible, cwd, fetchCheckpoints]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await invoke("create_checkpoint", { cwd, name: newName.trim() });
      setNewName("");
      setShowCreate(false);
      setError(null);
      await fetchCheckpoints();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleRestore = async (checkpoint: CheckpointInfo) => {
    const confirmed = window.confirm(
      `Restore checkpoint "${checkpoint.name}"?\n\nThis will checkout commit ${checkpoint.commit_sha.slice(0, 8)} and put you in detached HEAD state.`
    );
    if (!confirmed) return;
    try {
      await invoke("restore_checkpoint", { cwd, checkpointId: checkpoint.id });
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Checkpoints</span>
        <span style={styles.badge}>{checkpoints.length}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={styles.actionBtn}
          >
            {showCreate ? "Cancel" : "+ New"}
          </button>
          <button onClick={fetchCheckpoints} style={styles.actionBtn} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {showCreate && (
        <div style={styles.createRow}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setShowCreate(false);
                setNewName("");
              }
            }}
            placeholder="Checkpoint name..."
            style={styles.input}
            autoFocus
          />
          <button onClick={handleCreate} style={styles.saveBtn} disabled={!newName.trim()}>
            Save
          </button>
        </div>
      )}

      <div style={styles.list}>
        {checkpoints.length === 0 && !loading && (
          <div style={styles.empty}>No checkpoints yet</div>
        )}
        {checkpoints.map((cp) => (
          <div key={cp.id} style={styles.item}>
            <div style={styles.itemInfo}>
              <span style={styles.cpName}>{cp.name}</span>
              <span style={styles.cpMeta}>
                {cp.commit_sha.slice(0, 7)} - {formatTimestamp(cp.timestamp)}
              </span>
            </div>
            <button
              onClick={() => handleRestore(cp)}
              style={styles.restoreBtn}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    maxHeight: 250,
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
  actionBtn: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  error: {
    fontSize: 11,
    color: "#f87171",
    padding: "4px 12px",
  },
  createRow: {
    display: "flex",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  input: {
    flex: 1,
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "'SF Mono', monospace",
    outline: "none",
  },
  saveBtn: {
    fontSize: 11,
    padding: "4px 12px",
    borderRadius: 4,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
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
    justifyContent: "space-between",
    padding: "6px 12px",
    gap: 8,
  },
  itemInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
    flex: 1,
  },
  cpName: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-primary)",
    fontFamily: "'SF Mono', monospace",
  },
  cpMeta: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    fontFamily: "'SF Mono', monospace",
  },
  restoreBtn: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    flexShrink: 0,
  },
};
