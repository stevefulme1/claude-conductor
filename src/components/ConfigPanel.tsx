import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { McpServer, McpStatus, ClaudeConfig } from "../types";

interface Props {
  onClose: () => void;
}

export default function ConfigPanel({ onClose }: Props) {
  const [config, setConfig] = useState<ClaudeConfig | null>(null);
  const [mcpStatus, setMcpStatus] = useState<Record<string, McpStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [authEditing, setAuthEditing] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [envEditing, setEnvEditing] = useState<string | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const cfg = await invoke<ClaudeConfig>("get_config");
      setConfig(cfg);
      setError(null);
    } catch (e) {
      setError(`${e}`);
      return;
    }
    setCheckingAll(true);
    try {
      const status = await invoke<Record<string, McpStatus>>("verify_mcp");
      setMcpStatus(status);
    } catch (e) {
      setError(`MCP verification failed: ${e}`);
    } finally {
      setCheckingAll(false);
    }
  }

  async function reconnectServer(name: string): Promise<McpStatus | null> {
    setReconnecting(name);
    try {
      const status = await invoke<McpStatus>("verify_mcp_single", { name });
      setMcpStatus((prev) => ({ ...prev, [name]: status }));
      setExpandedServer(name);
      return status;
    } catch (e) {
      const status: McpStatus = { reachable: false, logs: [`Error: ${e}`] };
      setMcpStatus((prev) => ({ ...prev, [name]: status }));
      return status;
    } finally {
      setReconnecting(null);
    }
  }

  async function saveAuth(serverName: string) {
    try {
      await invoke("update_mcp_auth", { serverName, token: authToken });
      const status = await reconnectServer(serverName);
      if (status?.reachable) {
        setAuthEditing(null);
        setAuthToken("");
      }
    } catch (e) {
      setError(`Failed to save auth: ${e}`);
    }
  }

  async function saveEnv(serverName: string) {
    try {
      await invoke("update_mcp_env", {
        update: { server_name: serverName, env_vars: envValues },
      });
      const status = await reconnectServer(serverName);
      if (status?.reachable) {
        setEnvEditing(null);
        setEnvValues({});
      }
    } catch (e) {
      setError(`Failed to save env: ${e}`);
    }
  }

  async function toggleServer(serverName: string, enabled: boolean) {
    try {
      await invoke("toggle_mcp", { serverName, enabled });
      await loadConfig();
    } catch (e) {
      setError(`Failed to toggle server: ${e}`);
    }
  }

  function renderHeader() {
    return (
      <div style={styles.header}>
        <span style={styles.title}>Settings</span>
        <button onClick={onClose} style={styles.closeBtn}>
          ✕
        </button>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div style={styles.panel}>
        {renderHeader()}
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={styles.panel}>
        {renderHeader()}
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  const connectedCount = Object.values(mcpStatus).filter(
    (s) => s.reachable
  ).length;
  const totalCount = config.mcp_servers.length;

  return (
    <div style={styles.panel}>
      {renderHeader()}

      <div style={styles.content}>
        {error && (
          <div style={styles.errorBanner}>
            {error}
            <button
              onClick={() => setError(null)}
              style={styles.dismissBtn}
            >
              dismiss
            </button>
          </div>
        )}

        {config.model && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Model</div>
            <div style={styles.modelBadge}>{config.model}</div>
          </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionLabel}>
              MCP Servers ({connectedCount}/{totalCount} connected)
            </div>
            <button
              onClick={loadConfig}
              disabled={checkingAll}
              style={styles.reconnectAllBtn}
              title="Test all connections"
            >
              {checkingAll ? "Checking..." : "Test All"}
            </button>
          </div>

          {config.mcp_servers.map((server) => {
            const status = mcpStatus[server.name];
            const isExpanded = expandedServer === server.name;
            const isReconnecting = reconnecting === server.name;
            const isEditingAuth = authEditing === server.name;
            const isEditingEnv = envEditing === server.name;

            return (
              <div key={server.name} style={styles.mcpCard}>
                <div
                  style={styles.mcpRow}
                  onClick={() =>
                    setExpandedServer(isExpanded ? null : server.name)
                  }
                >
                  <span
                    style={styles.statusDot(status?.reachable ?? false)}
                    title={
                      status?.reachable ? "Connected" : "Disconnected"
                    }
                  />
                  <div style={styles.mcpInfo}>
                    <div style={styles.mcpNameRow}>
                      <span style={styles.mcpName}>{server.name}</span>
                      <div style={styles.mcpBadges}>
                        <span style={styles.mcpType}>
                          {server.server_type}
                        </span>
                        {server.has_auth && (
                          <span style={styles.authBadge}>auth</span>
                        )}
                      </div>
                    </div>
                    <span style={styles.mcpUrl}>
                      {server.command_or_url.length > 45
                        ? "..." +
                          server.command_or_url.slice(-42)
                        : server.command_or_url}
                    </span>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      color: "var(--text-tertiary)",
                      transform: isExpanded
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.15s",
                      flexShrink: 0,
                    }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>

                {isExpanded && (
                  <div style={styles.mcpDetail}>
                    <div style={styles.actionRow}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reconnectServer(server.name);
                        }}
                        disabled={isReconnecting}
                        style={styles.actionBtn}
                      >
                        {isReconnecting ? "Testing..." : "Reconnect"}
                      </button>

                      {server.server_type === "http" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAuthEditing(
                              isEditingAuth ? null : server.name
                            );
                            setAuthToken("");
                          }}
                          style={styles.actionBtn}
                        >
                          {isEditingAuth ? "Cancel" : "Update Auth"}
                        </button>
                      )}

                      {server.has_env && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isEditingEnv) {
                              setEnvEditing(null);
                              setEnvValues({});
                            } else {
                              setEnvEditing(server.name);
                              const initial: Record<string, string> = {};
                              server.env_keys.forEach(
                                (k) => (initial[k] = "")
                              );
                              setEnvValues(initial);
                            }
                          }}
                          style={styles.actionBtn}
                        >
                          {isEditingEnv ? "Cancel" : "Edit Env"}
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleServer(server.name, false);
                        }}
                        style={styles.disableBtn}
                      >
                        Disable
                      </button>
                    </div>

                    {isEditingAuth && (
                      <div style={styles.authForm}>
                        <div style={styles.formLabel}>
                          Bearer Token
                        </div>
                        <div style={styles.formRow}>
                          <input
                            type="password"
                            value={authToken}
                            onChange={(e) =>
                              setAuthToken(e.target.value)
                            }
                            placeholder="Paste token..."
                            style={styles.formInput}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveAuth(server.name);
                            }}
                            disabled={!authToken.trim()}
                            style={styles.saveBtn}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    {isEditingEnv && (
                      <div style={styles.authForm}>
                        <div style={styles.formLabel}>
                          Environment Variables
                        </div>
                        {server.env_keys.map((key) => (
                          <div key={key} style={styles.envRow}>
                            <span style={styles.envKey}>{key}</span>
                            <input
                              type="password"
                              value={envValues[key] || ""}
                              onChange={(e) =>
                                setEnvValues((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              placeholder="Enter value..."
                              style={styles.formInput}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        ))}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEnv(server.name);
                          }}
                          disabled={Object.values(envValues).every(
                            (v) => !v.trim()
                          )}
                          style={styles.saveBtn}
                        >
                          Save & Reconnect
                        </button>
                      </div>
                    )}

                    {status && status.logs.length > 0 && (
                      <div style={styles.logSection}>
                        <div style={styles.logLabel}>
                          Connection Log
                        </div>
                        <div style={styles.logBlock}>
                          {status.logs.map((line, i) => (
                            <div
                              key={i}
                              style={styles.logLine(line)}
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            Plugins ({config.plugins.length})
          </div>
          <div style={styles.pluginList}>
            {config.plugins.map((p) => (
              <span key={p} style={styles.pluginBadge}>
                {p.split("@")[0]}
              </span>
            ))}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionLabel}>Config Files</div>
          {config.config_paths.map((p) => (
            <div key={p} style={styles.configPath}>
              {p.replace(/^\/Users\/[^/]+/, "~")}
            </div>
          ))}
        </div>

        <div style={styles.note}>
          All sessions spawned from Conductor inherit your full shell
          environment, ensuring MCP servers and plugins are available.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  panel: {
    position: "absolute" as const,
    bottom: 50,
    left: 8,
    right: 8,
    maxHeight: "80vh",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-md)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  closeBtn: {
    fontSize: 14,
    color: "var(--text-tertiary)",
    padding: "2px 6px",
    borderRadius: "var(--radius-sm)",
  },
  content: {
    padding: "8px 14px 14px",
    overflowY: "auto" as const,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 6,
  },
  modelBadge: {
    fontSize: 12,
    fontFamily: "'SF Mono', monospace",
    color: "var(--accent)",
    padding: "3px 8px",
    background: "var(--accent-muted)",
    borderRadius: "var(--radius-sm)",
    display: "inline-block",
  },
  mcpCard: {
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    marginBottom: 6,
    overflow: "hidden",
  },
  mcpRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  statusDot: (ok: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: ok ? "var(--success)" : "var(--danger)",
    flexShrink: 0,
    boxShadow: ok
      ? "0 0 4px rgba(74, 222, 128, 0.4)"
      : "0 0 4px rgba(248, 113, 113, 0.4)",
  }),
  mcpInfo: {
    flex: 1,
    minWidth: 0,
  },
  mcpNameRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  mcpName: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-primary)",
  },
  mcpBadges: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  mcpType: {
    fontSize: 9,
    color: "var(--text-tertiary)",
    fontFamily: "'SF Mono', monospace",
    padding: "1px 4px",
    background: "var(--bg-hover)",
    borderRadius: 3,
  },
  authBadge: {
    fontSize: 9,
    color: "var(--accent)",
    padding: "1px 4px",
    background: "var(--accent-muted)",
    borderRadius: 3,
  },
  mcpUrl: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    fontFamily: "'SF Mono', monospace",
    display: "block",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  mcpDetail: {
    borderTop: "1px solid var(--border-subtle)",
    padding: "8px 10px",
    background: "var(--bg-secondary)",
  },
  actionRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
    marginBottom: 8,
  },
  actionBtn: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
    transition: "var(--transition)",
  },
  disableBtn: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(248, 113, 113, 0.1)",
    color: "var(--danger)",
    border: "1px solid rgba(248, 113, 113, 0.2)",
    cursor: "pointer",
    marginLeft: "auto",
  },
  reconnectAllBtn: {
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
  },
  authForm: {
    padding: "8px 0",
    borderTop: "1px solid var(--border-subtle)",
    marginTop: 4,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 6,
  },
  formRow: {
    display: "flex",
    gap: 6,
  },
  formInput: {
    flex: 1,
    padding: "5px 8px",
    fontSize: 12,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "'SF Mono', monospace",
  },
  saveBtn: {
    fontSize: 11,
    padding: "4px 12px",
    borderRadius: "var(--radius-sm)",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
  },
  envRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  envKey: {
    fontSize: 11,
    fontFamily: "'SF Mono', monospace",
    color: "var(--text-secondary)",
    minWidth: 100,
    flexShrink: 0,
  },
  logSection: {
    marginTop: 8,
    borderTop: "1px solid var(--border-subtle)",
    paddingTop: 8,
  },
  logLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 4,
  },
  logBlock: {
    background: "var(--bg-primary, #1a1a2e)",
    borderRadius: "var(--radius-sm)",
    padding: "6px 8px",
    maxHeight: 120,
    overflowY: "auto" as const,
  },
  logLine: (line: string): React.CSSProperties => ({
    fontSize: 11,
    fontFamily: "'SF Mono', monospace",
    lineHeight: 1.6,
    color: line.startsWith("✓")
      ? "var(--success)"
      : line.startsWith("✗")
        ? "var(--danger)"
        : "var(--text-secondary)",
  }),
  pluginList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
  },
  pluginBadge: {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  },
  configPath: {
    fontSize: 11,
    fontFamily: "'SF Mono', monospace",
    color: "var(--text-secondary)",
    padding: "2px 0",
  },
  note: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    lineHeight: 1.5,
    padding: "8px 0 0",
    borderTop: "1px solid var(--border-subtle)",
    marginTop: 4,
  },
  error: {
    padding: 14,
    fontSize: 12,
    color: "var(--danger)",
  },
  errorBanner: {
    padding: "8px 10px",
    marginBottom: 10,
    borderRadius: "var(--radius-sm)",
    background: "rgba(248, 113, 113, 0.1)",
    border: "1px solid rgba(248, 113, 113, 0.2)",
    fontSize: 12,
    color: "var(--danger)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dismissBtn: {
    fontSize: 10,
    color: "var(--danger)",
    padding: "2px 6px",
    borderRadius: "var(--radius-sm)",
    background: "none",
    border: "none",
    cursor: "pointer",
    opacity: 0.7,
  },
  loading: {
    padding: 14,
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
};
