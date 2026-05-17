import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgentProfile } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const emptyProfile: AgentProfile = {
  name: "",
  command: "",
  args: [],
  env: {},
  description: "",
};

export default function AgentProfileEditor({ visible, onClose }: Props) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [argsText, setArgsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await invoke<AgentProfile[]>("get_agent_profiles");
      setProfiles(result);
    } catch (e) {
      console.error("Failed to load profiles:", e);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  async function handleSave() {
    if (!editing) return;
    const profile: AgentProfile = {
      ...editing,
      args: argsText
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      await invoke("save_agent_profile", { profile });
      setEditing(null);
      setArgsText("");
      setError(null);
      load();
    } catch (e) {
      setError(`${e}`);
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(`Delete profile "${name}"?`)) return;
    try {
      await invoke("delete_agent_profile", { name });
      load();
    } catch (e) {
      console.error("Failed to delete profile:", e);
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Agent Profiles</span>
          <button onClick={onClose} style={styles.closeBtn}>
            &times;
          </button>
        </div>

        {editing ? (
          <div style={styles.form}>
            <label style={styles.label}>Name</label>
            <input
              style={styles.input}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="My Custom Agent"
            />
            <label style={styles.label}>Command</label>
            <input
              style={styles.input}
              value={editing.command}
              onChange={(e) => setEditing({ ...editing, command: e.target.value })}
              placeholder="claude"
            />
            <label style={styles.label}>Args (space separated)</label>
            <input
              style={styles.input}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="--model sonnet --verbose"
            />
            <label style={styles.label}>Description</label>
            <input
              style={styles.input}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Fast iteration agent"
            />
            <label style={styles.label}>Model Hint (optional)</label>
            <input
              style={styles.input}
              value={editing.model_hint || ""}
              onChange={(e) => setEditing({ ...editing, model_hint: e.target.value || undefined })}
              placeholder="claude-sonnet-4-20250514"
            />
            {error && <div style={styles.error}>{error}</div>}
            <div style={styles.formActions}>
              <button
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button onClick={handleSave} style={styles.saveBtn}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.list}>
              {profiles.length === 0 && (
                <div style={styles.empty}>
                  No custom profiles yet. Click "New Profile" to create one.
                </div>
              )}
              {profiles.map((p) => (
                <div key={p.name} style={styles.profileRow}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.profileName}>{p.name}</div>
                    <div style={styles.profileMeta}>
                      {p.command} {p.args.join(" ")}
                    </div>
                    {p.description && (
                      <div style={styles.profileDesc}>{p.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditing(p);
                      setArgsText(p.args.join(" "));
                    }}
                    style={styles.editBtn}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.name)}
                    style={styles.deleteBtn}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setEditing({ ...emptyProfile });
                setArgsText("");
              }}
              style={styles.newBtn}
            >
              + New Profile
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 36, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    width: 480,
    maxHeight: "80vh",
    background: "var(--bg-secondary)",
    borderRadius: "var(--radius-md, 8px)",
    border: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  closeBtn: {
    fontSize: 20,
    color: "var(--text-tertiary)",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: "0 4px",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: 12,
  },
  profileRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: "var(--radius-sm, 6px)",
    border: "1px solid var(--border-subtle)",
    marginBottom: 8,
  },
  profileName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  profileMeta: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontFamily: "monospace",
  },
  profileDesc: {
    fontSize: 11,
    color: "var(--text-secondary)",
    marginTop: 2,
  },
  editBtn: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 4,
    color: "var(--accent)",
    background: "none",
    border: "1px solid var(--accent)",
    cursor: "pointer",
  },
  deleteBtn: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 4,
    color: "var(--danger, #f87171)",
    background: "none",
    border: "1px solid var(--danger, #f87171)",
    cursor: "pointer",
  },
  newBtn: {
    margin: "8px 12px 12px",
    padding: "8px 14px",
    borderRadius: "var(--radius-sm, 6px)",
    background: "var(--accent)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
  },
  form: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  input: {
    padding: "8px 10px",
    borderRadius: 4,
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    padding: "6px 14px",
    borderRadius: 4,
    color: "var(--text-secondary)",
    background: "none",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
    fontSize: 12,
  },
  saveBtn: {
    padding: "6px 14px",
    borderRadius: 4,
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  error: {
    fontSize: 12,
    color: "var(--danger, #f87171)",
    padding: "4px 0",
  },
  empty: {
    textAlign: "center",
    color: "var(--text-tertiary)",
    fontSize: 13,
    padding: 24,
  },
};
