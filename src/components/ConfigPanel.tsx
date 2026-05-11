import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface McpServer {
  name: string;
  server_type: string;
  command_or_url: string;
}

interface ClaudeConfig {
  mcp_servers: McpServer[];
  plugins: string[];
  model: string;
  config_paths: string[];
}

interface Props {
  onClose: () => void;
}

export default function ConfigPanel({ onClose }: Props) {
  const [config, setConfig] = useState<ClaudeConfig | null>(null);
  const [mcpStatus, setMcpStatus] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const [cfg, status] = await Promise.all([
        invoke<ClaudeConfig>("get_config"),
        invoke<Record<string, boolean>>("verify_mcp"),
      ]);
      setConfig(cfg);
      setMcpStatus(status);
      setError(null);
    } catch (e) {
      setError(`${e}`);
    }
  }

  if (error) {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Settings</span>
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Settings</span>
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Settings</span>
        <button onClick={onClose} style={styles.closeBtn}>
          ✕
        </button>
      </div>

      <div style={styles.content}>
        {config.model && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Model</div>
            <div style={styles.modelBadge}>{config.model}</div>
          </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            MCP Servers ({config.mcp_servers.length})
          </div>
          {config.mcp_servers.map((server) => (
            <div key={server.name} style={styles.mcpRow}>
              <span
                style={styles.statusDot(mcpStatus[server.name] ?? false)}
              />
              <div style={styles.mcpInfo}>
                <span style={styles.mcpName}>{server.name}</span>
                <span style={styles.mcpType}>{server.server_type}</span>
              </div>
            </div>
          ))}
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
    maxHeight: "70vh",
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
  mcpRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
  },
  statusDot: (ok: boolean): React.CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: ok ? "var(--success)" : "var(--danger)",
    flexShrink: 0,
  }),
  mcpInfo: {
    display: "flex",
    justifyContent: "space-between",
    flex: 1,
    alignItems: "center",
  },
  mcpName: {
    fontSize: 12,
    color: "var(--text-primary)",
  },
  mcpType: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    fontFamily: "'SF Mono', monospace",
  },
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
  loading: {
    padding: 14,
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
};
