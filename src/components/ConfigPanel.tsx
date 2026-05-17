import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { McpServer, McpStatus, ClaudeConfig, AuthInfo, TokenStatus } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onShowMarketplace?: () => void;
  onShowPlugins?: () => void;
}

export default function ConfigPanel({ visible, onClose, onShowMarketplace, onShowPlugins }: Props) {
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"stdio" | "http">("stdio");
  const [newCommandOrUrl, setNewCommandOrUrl] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newAuthToken, setNewAuthToken] = useState("");
  const [newEnvPairs, setNewEnvPairs] = useState("");
  const [ssoEditing, setSsoEditing] = useState<string | null>(null);
  const [ssoAuthUrl, setSsoAuthUrl] = useState("");
  const [ssoTokenUrl, setSsoTokenUrl] = useState("");
  const [ssoClientId, setSsoClientId] = useState("");
  const [ssoScopes, setSsoScopes] = useState("");
  const [ssoInProgress, setSsoInProgress] = useState<string | null>(null);
  const [authInfoMap, setAuthInfoMap] = useState<Record<string, AuthInfo>>({});
  const [tokenStatusMap, setTokenStatusMap] = useState<Record<string, TokenStatus>>({});
  const [validatingToken, setValidatingToken] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    const unlisten = listen<{
      success: boolean;
      server_name: string;
      error: string | null;
    }>("sso-result", (event) => {
      setSsoInProgress(null);
      if (event.payload.success) {
        setSsoEditing(null);
        reconnectServer(event.payload.server_name);
      } else {
        setError(
          `SSO failed for ${event.payload.server_name}: ${event.payload.error}`
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
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

  async function startSso(serverName: string) {
    console.log("[SSO] startSso called for:", serverName);
    if (
      !ssoAuthUrl.trim() ||
      !ssoTokenUrl.trim() ||
      !ssoClientId.trim()
    ) {
      setError("Auth URL, Token URL, and Client ID are required. Fill all fields above.");
      console.log("[SSO] Missing fields:", { ssoAuthUrl, ssoTokenUrl, ssoClientId });
      return;
    }
    setSsoInProgress(serverName);
    setError(null);
    try {
      console.log("[SSO] Invoking start_sso...");
      const result = await invoke<{ auth_url: string; port: number }>(
        "start_sso",
        {
          config: {
            server_name: serverName,
            auth_url: ssoAuthUrl.trim(),
            token_url: ssoTokenUrl.trim(),
            client_id: ssoClientId.trim(),
            scopes: ssoScopes.trim() || "openid",
          },
        }
      );
      console.log("[SSO] Got auth URL, opening browser:", result.auth_url);
      try {
        await shellOpen(result.auth_url);
        console.log("[SSO] Browser opened successfully");
      } catch (openErr) {
        console.error("[SSO] Failed to open browser:", openErr);
        setSsoInProgress(null);
        await invoke("cancel_sso").catch(() => {});
        setError(`Failed to open browser: ${openErr}`);
        return;
      }
    } catch (e) {
      console.error("[SSO] Backend error:", e);
      setSsoInProgress(null);
      setError(`SSO failed: ${e}`);
    }
  }

  async function cancelSso() {
    try {
      await invoke("cancel_sso");
    } catch (e) {
      console.error("Failed to cancel SSO flow:", e);
    }
    setSsoInProgress(null);
  }

  async function fetchAuthInfo(serverName: string) {
    if (authInfoMap[serverName]) return;
    try {
      const info = await invoke<AuthInfo>("get_auth_info", { serverName });
      setAuthInfoMap((prev) => ({ ...prev, [serverName]: info }));
    } catch (e) {
      console.error(`Failed to get auth info for ${serverName}:`, e);
    }
  }

  async function doValidateToken(serverName: string) {
    setValidatingToken(serverName);
    try {
      const status = await invoke<TokenStatus>("validate_token", { serverName });
      setTokenStatusMap((prev) => ({ ...prev, [serverName]: status }));
    } catch (e) {
      setError(`Token validation failed: ${e}`);
    } finally {
      setValidatingToken(null);
    }
  }

  async function openOAuthUrl(serverName: string, url: string) {
    try {
      await shellOpen(url);
    } catch (e) {
      setError(`Failed to open browser: ${e}`);
    }
  }

  async function addServer() {
    const envVars: Record<string, string> = {};
    if (newEnvPairs.trim()) {
      for (const line of newEnvPairs.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) {
          envVars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
      }
    }
    try {
      await invoke("add_mcp", {
        server: {
          name: newName.trim(),
          server_type: newType,
          command_or_url: newCommandOrUrl.trim(),
          args: newArgs.trim()
            ? newArgs.split(/\s+/).filter(Boolean)
            : [],
          env_vars: envVars,
          auth_token: newAuthToken,
        },
      });
      setShowAddForm(false);
      setNewName("");
      setNewType("stdio");
      setNewCommandOrUrl("");
      setNewArgs("");
      setNewAuthToken("");
      setNewEnvPairs("");
      await loadConfig();
    } catch (e) {
      setError(`Failed to add server: ${e}`);
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

  const panelStyle = { ...styles.panel, display: visible ? "flex" : "none" };

  if (error && !config) {
    return (
      <div style={panelStyle}>
        {renderHeader()}
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={panelStyle}>
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
    <div style={panelStyle}>
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
                  onClick={() => {
                    const next = isExpanded ? null : server.name;
                    setExpandedServer(next);
                    if (next) fetchAuthInfo(server.name);
                  }}
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

                      {(() => {
                        const authInfo = authInfoMap[server.name];
                        if (!authInfo) return null;

                        if (authInfo.auth_type === "token") {
                          return (
                            <>
                              <span style={{
                                fontSize: 11,
                                color: authInfo.has_token ? "var(--success)" : "var(--danger)",
                                padding: "4px 8px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}>
                                {authInfo.has_token ? "✓ Token configured" : "✗ No token"}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  doValidateToken(server.name);
                                }}
                                disabled={validatingToken === server.name}
                                style={styles.actionBtn}
                              >
                                {validatingToken === server.name ? "Checking..." : "Validate"}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAuthEditing(
                                    isEditingAuth ? null : server.name
                                  );
                                  setAuthToken("");
                                  setSsoEditing(null);
                                }}
                                style={styles.actionBtn}
                              >
                                {isEditingAuth ? "Cancel" : "Update Token"}
                              </button>
                            </>
                          );
                        }

                        if (authInfo.auth_type === "oauth") {
                          return (
                            <>
                              {authInfo.oauth_url ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openOAuthUrl(server.name, authInfo.oauth_url!);
                                  }}
                                  style={styles.ssoBtn}
                                >
                                  Login with {authInfo.provider}
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (ssoEditing === server.name) {
                                      setSsoEditing(null);
                                    } else {
                                      setSsoEditing(server.name);
                                      setSsoAuthUrl("");
                                      setSsoTokenUrl("");
                                      setSsoClientId("");
                                      setSsoScopes("");
                                    }
                                    setAuthEditing(null);
                                  }}
                                  style={styles.ssoBtn}
                                >
                                  {ssoEditing === server.name
                                    ? "Cancel"
                                    : `Login with ${authInfo.provider}`}
                                </button>
                              )}
                            </>
                          );
                        }

                        // auth_type === "none"
                        return (
                          <span style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            padding: "4px 8px",
                          }}>
                            No auth required
                          </span>
                        );
                      })()}

                      {/* Fallback auth buttons when auth info not yet loaded */}
                      {!authInfoMap[server.name] && server.server_type === "http" && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAuthEditing(
                                isEditingAuth ? null : server.name
                              );
                              setAuthToken("");
                              setSsoEditing(null);
                            }}
                            style={styles.actionBtn}
                          >
                            {isEditingAuth ? "Cancel" : "Update Auth"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (ssoEditing === server.name) {
                                setSsoEditing(null);
                              } else {
                                setSsoEditing(server.name);
                                setSsoAuthUrl("");
                                setSsoTokenUrl("");
                                setSsoClientId("");
                                setSsoScopes("");
                              }
                              setAuthEditing(null);
                            }}
                            style={styles.ssoBtn}
                          >
                            {ssoEditing === server.name
                              ? "Cancel SSO"
                              : "SSO Login"}
                          </button>
                        </>
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

                    {/* Token validation result */}
                    {tokenStatusMap[server.name] && (
                      <div style={{
                        padding: "6px 8px",
                        marginBottom: 6,
                        borderRadius: "var(--radius-sm)",
                        background: tokenStatusMap[server.name].valid
                          ? "rgba(74, 222, 128, 0.1)"
                          : "rgba(248, 113, 113, 0.1)",
                        border: `1px solid ${tokenStatusMap[server.name].valid
                          ? "rgba(74, 222, 128, 0.2)"
                          : "rgba(248, 113, 113, 0.2)"}`,
                        fontSize: 11,
                        color: tokenStatusMap[server.name].valid
                          ? "var(--success)"
                          : "var(--danger)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}>
                        <span>{tokenStatusMap[server.name].message}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTokenStatusMap((prev) => {
                              const next = { ...prev };
                              delete next[server.name];
                              return next;
                            });
                          }}
                          style={styles.dismissBtn}
                        >
                          dismiss
                        </button>
                      </div>
                    )}

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

                    {ssoEditing === server.name && (
                      <div style={styles.authForm}>
                        {ssoInProgress === server.name ? (
                          <div style={styles.ssoWaiting}>
                            <div style={styles.ssoSpinner} />
                            <span style={styles.ssoWaitText}>
                              Waiting for browser login...
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelSso();
                              }}
                              style={styles.ssoCancelBtn}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={styles.formLabel}>
                              OAuth2 / SSO Configuration
                            </div>
                            <div style={styles.ssoField}>
                              <label style={styles.ssoFieldLabel}>
                                Authorization URL
                              </label>
                              <input
                                value={ssoAuthUrl}
                                onChange={(e) =>
                                  setSsoAuthUrl(e.target.value)
                                }
                                placeholder="https://idp.example.com/authorize"
                                style={styles.formInput}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div style={styles.ssoField}>
                              <label style={styles.ssoFieldLabel}>
                                Token URL
                              </label>
                              <input
                                value={ssoTokenUrl}
                                onChange={(e) =>
                                  setSsoTokenUrl(e.target.value)
                                }
                                placeholder="https://idp.example.com/token"
                                style={styles.formInput}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div style={styles.ssoField}>
                              <label style={styles.ssoFieldLabel}>
                                Client ID
                              </label>
                              <input
                                value={ssoClientId}
                                onChange={(e) =>
                                  setSsoClientId(e.target.value)
                                }
                                placeholder="my-app-client-id"
                                style={styles.formInput}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div style={styles.ssoField}>
                              <label style={styles.ssoFieldLabel}>
                                Scopes
                              </label>
                              <input
                                value={ssoScopes}
                                onChange={(e) =>
                                  setSsoScopes(e.target.value)
                                }
                                placeholder="openid profile (default: openid)"
                                style={styles.formInput}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startSso(server.name);
                              }}
                              disabled={
                                !ssoAuthUrl.trim() ||
                                !ssoTokenUrl.trim() ||
                                !ssoClientId.trim()
                              }
                              style={styles.saveBtn}
                            >
                              Authenticate with SSO
                            </button>
                          </>
                        )}
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

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={styles.addServerBtn}
          >
            {showAddForm ? "Cancel" : "+ Add MCP Server"}
          </button>

          {onShowMarketplace && (
            <button
              onClick={() => { onClose(); onShowMarketplace(); }}
              style={{ ...styles.addServerBtn, borderStyle: "solid", color: "var(--text-secondary)", marginTop: 4 }}
            >
              Browse Marketplace
            </button>
          )}

          {onShowPlugins && (
            <button
              onClick={() => { onClose(); onShowPlugins(); }}
              style={{ ...styles.addServerBtn, borderStyle: "solid", color: "var(--text-secondary)", marginTop: 4 }}
            >
              Manage Plugins
            </button>
          )}

          {showAddForm && (
            <div style={styles.addForm}>
              <div style={styles.addFormRow}>
                <label style={styles.addLabel}>Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="my-server"
                  style={styles.formInput}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div style={styles.addFormRow}>
                <label style={styles.addLabel}>Type</label>
                <div style={styles.typeToggle}>
                  <button
                    onClick={() => setNewType("stdio")}
                    style={{
                      ...styles.typeBtn,
                      ...(newType === "stdio"
                        ? styles.typeBtnActive
                        : {}),
                    }}
                  >
                    stdio
                  </button>
                  <button
                    onClick={() => setNewType("http")}
                    style={{
                      ...styles.typeBtn,
                      ...(newType === "http"
                        ? styles.typeBtnActive
                        : {}),
                    }}
                  >
                    http
                  </button>
                </div>
              </div>
              <div style={styles.addFormRow}>
                <label style={styles.addLabel}>
                  {newType === "http" ? "URL" : "Command"}
                </label>
                <input
                  value={newCommandOrUrl}
                  onChange={(e) => setNewCommandOrUrl(e.target.value)}
                  placeholder={
                    newType === "http"
                      ? "https://api.example.com/mcp"
                      : "/usr/local/bin/my-server"
                  }
                  style={styles.formInput}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {newType === "stdio" && (
                <div style={styles.addFormRow}>
                  <label style={styles.addLabel}>Args</label>
                  <input
                    value={newArgs}
                    onChange={(e) => setNewArgs(e.target.value)}
                    placeholder="--flag value (space-separated)"
                    style={styles.formInput}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              {newType === "http" ? (
                <div style={styles.addFormRow}>
                  <label style={styles.addLabel}>
                    Bearer Token
                  </label>
                  <input
                    type="password"
                    value={newAuthToken}
                    onChange={(e) => setNewAuthToken(e.target.value)}
                    placeholder="Optional auth token"
                    style={styles.formInput}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <div style={styles.addFormRow}>
                  <label style={styles.addLabel}>Env Vars</label>
                  <textarea
                    value={newEnvPairs}
                    onChange={(e) => setNewEnvPairs(e.target.value)}
                    placeholder={"KEY=value\nANOTHER_KEY=value"}
                    style={{
                      ...styles.formInput,
                      minHeight: 48,
                      resize: "vertical" as const,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              <button
                onClick={addServer}
                disabled={
                  !newName.trim() || !newCommandOrUrl.trim()
                }
                style={styles.saveBtn}
              >
                Add Server
              </button>
            </div>
          )}
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
  addServerBtn: {
    width: "100%",
    padding: "8px 0",
    fontSize: 12,
    color: "var(--accent)",
    background: "none",
    border: "1px dashed var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    marginTop: 6,
    transition: "var(--transition)",
  },
  addForm: {
    padding: "10px 0",
    borderTop: "1px solid var(--border-subtle)",
    marginTop: 8,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  addFormRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
  },
  addLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  typeToggle: {
    display: "flex",
    gap: 0,
    borderRadius: "var(--radius-sm)",
    overflow: "hidden",
    border: "1px solid var(--border-subtle)",
  },
  typeBtn: {
    flex: 1,
    padding: "5px 0",
    fontSize: 11,
    fontFamily: "'SF Mono', monospace",
    background: "var(--bg-tertiary)",
    color: "var(--text-tertiary)",
    border: "none",
    cursor: "pointer",
    transition: "var(--transition)",
  },
  typeBtnActive: {
    background: "var(--accent-muted)",
    color: "var(--accent)",
    fontWeight: 600,
  },
  ssoBtn: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(99, 102, 241, 0.1)",
    color: "rgb(129, 140, 248)",
    border: "1px solid rgba(99, 102, 241, 0.25)",
    cursor: "pointer",
    transition: "var(--transition)",
  },
  ssoField: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    marginBottom: 8,
  },
  ssoFieldLabel: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    fontWeight: 500,
  },
  ssoWaiting: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
  },
  ssoSpinner: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "2px solid var(--border-subtle)",
    borderTopColor: "rgb(129, 140, 248)",
    animation: "spin 0.8s linear infinite",
    flexShrink: 0,
  },
  ssoWaitText: {
    fontSize: 12,
    color: "var(--text-secondary)",
    flex: 1,
  },
  ssoCancelBtn: {
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(248, 113, 113, 0.1)",
    color: "var(--danger)",
    border: "1px solid rgba(248, 113, 113, 0.2)",
    cursor: "pointer",
    flexShrink: 0,
  },
};
