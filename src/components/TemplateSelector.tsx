import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionTemplate } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (template: SessionTemplate) => void;
}

export default function TemplateSelector({ visible, onClose, onSelect }: Props) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAgent, setNewAgent] = useState("claude");
  const [newDesc, setNewDesc] = useState("");
  const [newCwd, setNewCwd] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) loadTemplates();
  }, [visible]);

  async function loadTemplates() {
    try {
      const result = await invoke<SessionTemplate[]>("get_session_templates");
      setTemplates(result);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await invoke("save_session_template", {
        template: {
          name: newName.trim(),
          agent: newAgent,
          cwd_pattern: newCwd.trim() || null,
          mcp_servers: [],
          description: newDesc.trim(),
        },
      });
      setShowCreate(false);
      setNewName(""); setNewAgent("claude"); setNewDesc(""); setNewCwd("");
      loadTemplates();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(name: string) {
    try {
      await invoke("delete_session_template", { name });
      loadTemplates();
    } catch (e) {
      setError(String(e));
    }
  }

  if (!visible) return null;

  const agentIcons: Record<string, string> = { claude: "C", codex: "X", gemini: "G", aider: "A" };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Session Templates</span>
          <button onClick={onClose} style={styles.closeBtn}>x</button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.content}>
          <div style={styles.grid}>
            {templates.map(t => (
              <div key={t.name} style={styles.card} onClick={() => { onSelect(t); onClose(); }}>
                <div style={styles.cardHeader}>
                  <div style={styles.agentIcon}>{agentIcons[t.agent] || t.agent[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.cardName}>{t.name}</div>
                    <div style={styles.cardAgent}>{t.agent}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(t.name); }}
                    style={styles.deleteBtn}
                    title="Delete template"
                  >
                    x
                  </button>
                </div>
                <div style={styles.cardDesc}>{t.description}</div>
                {t.mcp_servers.length > 0 && (
                  <div style={styles.mcpList}>
                    {t.mcp_servers.map(s => (
                      <span key={s} style={styles.mcpBadge}>{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} style={styles.createBtn}>
              + New Template
            </button>
          ) : (
            <div style={styles.createForm}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Template name" style={styles.input} />
              <input value={newAgent} onChange={e => setNewAgent(e.target.value)} placeholder="Agent (claude)" style={styles.input} />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description" style={styles.input} />
              <input value={newCwd} onChange={e => setNewCwd(e.target.value)} placeholder="Working dir pattern (optional)" style={styles.input} />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleCreate} disabled={!newName.trim()} style={styles.saveBtn}>Save</button>
                <button onClick={() => setShowCreate(false)} style={styles.cancelBtn}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  panel: { width: 520, maxHeight: "80vh", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  closeBtn: { fontSize: 14, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" },
  content: { padding: 16, overflowY: "auto" as const },
  error: { fontSize: 11, color: "#f87171", padding: "4px 16px" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 },
  card: {
    border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 12px",
    cursor: "pointer", transition: "border-color 0.15s",
  },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  agentIcon: {
    width: 24, height: 24, borderRadius: "var(--radius-sm)",
    background: "linear-gradient(135deg, var(--accent), #c47a50)", display: "flex",
    alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0,
  },
  cardName: { fontSize: 12, fontWeight: 600, color: "var(--text-primary)" },
  cardAgent: { fontSize: 10, color: "var(--text-tertiary)" },
  cardDesc: { fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 },
  mcpList: { display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" as const },
  mcpBadge: { fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg-hover)", color: "var(--text-tertiary)" },
  deleteBtn: { fontSize: 10, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" },
  createBtn: {
    width: "100%", padding: "10px 0", fontSize: 12, color: "var(--accent)",
    background: "none", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)", cursor: "pointer",
  },
  createForm: {
    border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
    padding: 12, display: "flex", flexDirection: "column" as const, gap: 8,
  },
  input: {
    padding: "5px 8px", fontSize: 12, background: "var(--bg-secondary)",
    border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)", outline: "none",
  },
  saveBtn: {
    fontSize: 11, padding: "4px 12px", borderRadius: "var(--radius-sm)",
    background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500,
  },
  cancelBtn: {
    fontSize: 11, padding: "4px 10px", borderRadius: "var(--radius-sm)",
    background: "none", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)", cursor: "pointer",
  },
};
