import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface StatusData {
  active_ptys: number;
  discovered_sessions: number;
  uptime_seconds: number;
  pid: number;
}

interface McpStatus {
  [name: string]: {
    reachable: boolean;
    logs: string[];
  };
}

interface DailyUsage {
  total_sessions: number;
  total_messages: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  openSessionCount: number;
}

export default function StatusPanel({ visible, onClose, openSessionCount }: Props) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [daily, setDaily] = useState<DailyUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [mcpChecking, setMcpChecking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);

    Promise.all([
      invoke<StatusData>("get_status").catch(() => null),
      invoke<DailyUsage>("get_daily_usage").catch(() => null),
    ]).then(([s, d]) => {
      setStatus(s);
      setDaily(d);
      setLoading(false);
    });
  }, [visible]);

  async function checkMcp() {
    setMcpChecking(true);
    try {
      const m = await invoke<McpStatus>("verify_mcp");
      setMcp(m);
    } catch {
      setMcp(null);
    } finally {
      setMcpChecking(false);
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Status</span>
          <button style={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : (
          <div style={styles.content}>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Sessions</div>
              <div style={styles.grid}>
                <Stat label="Active PTYs" value={status?.active_ptys ?? 0} />
                <Stat label="Open Tabs" value={openSessionCount} />
                <Stat label="Discovered" value={status?.discovered_sessions ?? 0} />
                <Stat label="Process ID" value={status?.pid ?? 0} />
              </div>
            </div>

            {daily && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Today's Usage</div>
                <div style={styles.grid}>
                  <Stat label="Sessions" value={daily.total_sessions} />
                  <Stat label="Messages" value={daily.total_messages} />
                  <Stat label="Input Tokens" value={daily.total_input_tokens.toLocaleString()} />
                  <Stat label="Output Tokens" value={daily.total_output_tokens.toLocaleString()} />
                  <Stat label="Total Tokens" value={(daily.total_input_tokens + daily.total_output_tokens).toLocaleString()} />
                  <Stat label="Est. Cost" value={`$${daily.total_cost_usd.toFixed(2)}`} />
                </div>
              </div>
            )}

            <div style={styles.section}>
              <div style={{ ...styles.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>MCP Servers</span>
                <button
                  onClick={checkMcp}
                  disabled={mcpChecking}
                  style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-tertiary)", color: "var(--text-secondary)", cursor: mcpChecking ? "wait" : "pointer" }}
                >
                  {mcpChecking ? "Checking..." : mcp ? "Re-check" : "Check Connectivity"}
                </button>
              </div>
              {mcp && Object.keys(mcp).length > 0 ? (
                <div style={styles.mcpList}>
                  {Object.entries(mcp).map(([name, info]) => (
                    <div key={name} style={styles.mcpItem}>
                      <span
                        style={{
                          ...styles.mcpDot,
                          background:
                            info.reachable
                              ? "var(--success)"
                              : "var(--danger)",
                        }}
                      />
                      <span style={styles.mcpName}>{name}</span>
                      <span style={styles.mcpStatus}>
                        {info.reachable ? "Connected" : (info.logs?.slice(-1)[0] || "Error")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.empty}>
                  {mcp ? "No MCP servers configured" : "Click \"Check Connectivity\" to verify MCP servers"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 36,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    width: 420,
    maxHeight: "80vh",
    overflow: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontSize: 16,
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
  content: {
    padding: "16px 20px",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    color: "var(--text-tertiary)",
    letterSpacing: "0.5px",
    marginBottom: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  stat: {
    background: "var(--bg-tertiary)",
    borderRadius: "var(--radius-sm)",
    padding: "12px 16px",
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--accent)",
    fontFamily: "'SF Mono', monospace",
  },
  statLabel: {
    fontSize: 11,
    color: "var(--text-secondary)",
    marginTop: 4,
  },
  mcpList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  mcpItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    borderRadius: "var(--radius-sm)",
  },
  mcpDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  mcpName: {
    fontSize: 13,
    color: "var(--text-primary)",
    fontFamily: "'SF Mono', monospace",
    flex: 1,
  },
  mcpStatus: {
    fontSize: 11,
    color: "var(--text-tertiary)",
  },
  loading: {
    padding: 40,
    textAlign: "center" as const,
    color: "var(--text-tertiary)",
  },
  empty: {
    padding: 16,
    textAlign: "center" as const,
    color: "var(--text-tertiary)",
    fontSize: 13,
  },
};
