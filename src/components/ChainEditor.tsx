import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionChain, ChainStep } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onLaunchStep?: (agent: string, prompt: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "var(--text-tertiary)",
  running: "var(--accent)",
  done: "var(--success)",
  failed: "var(--danger)",
};

export default function ChainEditor({ visible, onClose, onLaunchStep }: Props) {
  const [chains, setChains] = useState<SessionChain[]>([]);
  const [newName, setNewName] = useState("");
  const [steps, setSteps] = useState<ChainStep[]>([
    { agent: "claude", prompt: "", status: "pending" },
  ]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) loadChains();
  }, [visible]);

  async function loadChains() {
    try {
      const result = await invoke<SessionChain[]>("list_chains");
      setChains(result);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreate() {
    if (!newName.trim() || steps.length === 0) return;
    try {
      await invoke<string>("create_chain", { name: newName, steps });
      setNewName("");
      setSteps([{ agent: "claude", prompt: "", status: "pending" }]);
      setShowCreate(false);
      loadChains();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleAdvance(chainId: string) {
    try {
      const nextStep = await invoke<ChainStep>("advance_chain", { chainId });
      onLaunchStep?.(nextStep.agent, nextStep.prompt);
      loadChains();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(chainId: string) {
    try {
      await invoke("delete_chain", { chainId });
      loadChains();
    } catch (_) {}
  }

  function addStep() {
    setSteps([...steps, { agent: "claude", prompt: "", status: "pending" }]);
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, field: "agent" | "prompt", value: string) {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Session Chains</span>
          <button onClick={onClose} style={styles.closeBtn}>x</button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.content}>
          {chains.map(chain => (
            <div key={chain.id} style={styles.chainCard}>
              <div style={styles.chainHeader}>
                <span style={styles.chainName}>{chain.name}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => handleAdvance(chain.id)} style={styles.advanceBtn} title="Advance to next step">
                    Next
                  </button>
                  <button onClick={() => handleDelete(chain.id)} style={styles.deleteBtn}>
                    x
                  </button>
                </div>
              </div>
              <div style={styles.pipeline}>
                {chain.steps.map((step, i) => (
                  <div key={i} style={styles.pipelineStep}>
                    <div style={{
                      ...styles.stepDot,
                      background: STATUS_COLORS[step.status] || "var(--text-tertiary)",
                      boxShadow: step.status === "running" ? `0 0 6px ${STATUS_COLORS.running}` : "none",
                    }} />
                    <div style={styles.stepInfo}>
                      <span style={{ fontSize: 11, fontWeight: i === chain.current_step ? 600 : 400, color: "var(--text-primary)" }}>
                        {step.agent}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                        {step.prompt.length > 40 ? step.prompt.slice(0, 37) + "..." : step.prompt}
                      </span>
                    </div>
                    {i < chain.steps.length - 1 && (
                      <div style={styles.stepArrow}>-&gt;</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} style={styles.createBtn}>
              + New Chain
            </button>
          ) : (
            <div style={styles.createForm}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Chain name..."
                style={styles.input}
              />
              {steps.map((step, i) => (
                <div key={i} style={styles.stepRow}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", width: 20 }}>#{i + 1}</span>
                  <input
                    value={step.agent}
                    onChange={e => updateStep(i, "agent", e.target.value)}
                    placeholder="Agent"
                    style={{ ...styles.input, width: 80, flex: "none" }}
                  />
                  <input
                    value={step.prompt}
                    onChange={e => updateStep(i, "prompt", e.target.value)}
                    placeholder="Prompt / instruction..."
                    style={styles.input}
                  />
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(i)} style={styles.removeStepBtn}>x</button>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={addStep} style={styles.addStepBtn}>+ Step</button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || steps.some(s => !s.prompt.trim())}
                  style={styles.saveBtn}
                >
                  Create
                </button>
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
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    width: 560,
    maxHeight: "80vh",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-md)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  closeBtn: { fontSize: 14, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" },
  content: { padding: 16, overflowY: "auto" as const },
  error: { fontSize: 11, color: "#f87171", padding: "4px 16px" },
  chainCard: {
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    padding: "10px 12px",
    marginBottom: 10,
  },
  chainHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  chainName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" },
  pipeline: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" as const },
  pipelineStep: { display: "flex", alignItems: "center", gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  stepInfo: { display: "flex", flexDirection: "column" as const, gap: 1 },
  stepArrow: { fontSize: 11, color: "var(--text-tertiary)", margin: "0 4px" },
  advanceBtn: {
    fontSize: 10, padding: "3px 8px", borderRadius: "var(--radius-sm)",
    background: "var(--accent-muted)", color: "var(--accent)", border: "none", cursor: "pointer",
  },
  deleteBtn: {
    fontSize: 10, padding: "3px 6px", borderRadius: "var(--radius-sm)",
    background: "rgba(248,113,113,0.1)", color: "var(--danger)", border: "none", cursor: "pointer",
  },
  createBtn: {
    width: "100%", padding: "10px 0", fontSize: 12, color: "var(--accent)",
    background: "none", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  createForm: {
    border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
    padding: 12, display: "flex", flexDirection: "column" as const, gap: 8,
  },
  input: {
    flex: 1, padding: "5px 8px", fontSize: 12,
    background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)", color: "var(--text-primary)", outline: "none",
  },
  stepRow: { display: "flex", alignItems: "center", gap: 6 },
  removeStepBtn: { fontSize: 10, color: "var(--danger)", background: "none", border: "none", cursor: "pointer" },
  addStepBtn: {
    fontSize: 11, padding: "4px 10px", borderRadius: "var(--radius-sm)",
    background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", cursor: "pointer",
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
