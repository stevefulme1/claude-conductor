import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { PluginManifest } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PluginManager({ visible, onClose }: Props) {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());
  const [selectedPlugin, setSelectedPlugin] = useState<PluginManifest | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      invoke<PluginManifest[]>("discover_plugins")
        .then((p) => {
          setPlugins(p);
          // All discovered plugins are enabled by default
          setEnabledPlugins(new Set(p.map((pl) => pl.name)));
        })
        .catch((err) => console.error("Failed to discover plugins:", err))
        .finally(() => setLoading(false));
    }
  }, [visible]);

  function togglePlugin(name: string) {
    setEnabledPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function openPluginsDir() {
    try {
      const home = await invoke<string>("get_digest"); // just need home path detection
      // Open the plugins directory in the OS file manager
      void home;
      await open("~/.claude/conductor-plugins/");
    } catch {
      // Fallback: at least try
      try {
        await open("~/.claude/conductor-plugins/");
      } catch (err) {
        console.error("Failed to open plugins directory:", err);
      }
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={styles.title}>Plugin Manager</h2>
          <div style={styles.headerRight}>
            <button onClick={openPluginsDir} style={styles.dirBtn}>
              Open Plugins Directory
            </button>
            <button onClick={onClose} style={styles.closeBtn}>X</button>
          </div>
        </div>

        <div style={styles.body}>
          {loading && (
            <div style={styles.empty}>Scanning for plugins...</div>
          )}
          {!loading && plugins.length === 0 && (
            <div style={styles.empty}>
              <div style={{ marginBottom: 8 }}>No plugins found.</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Place plugins in <code>~/.claude/conductor-plugins/&lt;name&gt;/manifest.json</code>
              </div>
            </div>
          )}
          {plugins.map((plugin) => (
            <div
              key={plugin.name}
              style={{
                ...styles.pluginCard,
                ...(selectedPlugin?.name === plugin.name ? styles.pluginCardActive : {}),
              }}
              onClick={() => setSelectedPlugin(plugin)}
            >
              <div style={styles.pluginTop}>
                <div style={styles.pluginInfo}>
                  <span style={styles.pluginName}>{plugin.name}</span>
                  <span style={styles.pluginVersion}>v{plugin.version}</span>
                </div>
                <label
                  style={styles.toggle}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={enabledPlugins.has(plugin.name)}
                    onChange={() => togglePlugin(plugin.name)}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 11, marginLeft: 4 }}>
                    {enabledPlugins.has(plugin.name) ? "Enabled" : "Disabled"}
                  </span>
                </label>
              </div>
              <div style={styles.pluginDesc}>{plugin.description}</div>
              {selectedPlugin?.name === plugin.name && (
                <div style={styles.pluginDetails}>
                  <div style={styles.detailLabel}>Entry Point:</div>
                  <div style={styles.detailValue}>{plugin.entry_point}</div>
                  <div style={styles.detailLabel}>Hooks:</div>
                  <div style={styles.hookList}>
                    {plugin.hooks.length === 0 ? (
                      <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>None</span>
                    ) : (
                      plugin.hooks.map((hook) => (
                        <span key={hook} style={styles.hookBadge}>{hook}</span>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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
    alignItems: "center",
  },
  panel: {
    background: "var(--bg-primary)",
    borderRadius: "var(--radius-lg, 12px)",
    border: "1px solid var(--border-subtle)",
    width: "75%",
    maxWidth: 700,
    maxHeight: "75vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  headerRight: { display: "flex", gap: 8, alignItems: "center" },
  title: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  dirBtn: {
    padding: "6px 12px",
    fontSize: 11,
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  body: { padding: "12px 20px", overflow: "auto", flex: 1 },
  empty: { textAlign: "center" as const, padding: 40, color: "var(--text-tertiary)", fontSize: 13 },
  pluginCard: {
    background: "var(--bg-secondary)",
    borderRadius: "var(--radius-md, 8px)",
    padding: "14px 16px",
    marginBottom: 10,
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
    transition: "var(--transition)",
  },
  pluginCardActive: {
    borderColor: "var(--accent)",
  },
  pluginTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  pluginInfo: { display: "flex", alignItems: "center", gap: 8 },
  pluginName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" },
  pluginVersion: { fontSize: 11, color: "var(--text-tertiary)" },
  toggle: { display: "flex", alignItems: "center", color: "var(--text-secondary)", cursor: "pointer" },
  pluginDesc: { fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 },
  pluginDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--border-subtle)",
  },
  detailLabel: { fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500, marginBottom: 2 },
  detailValue: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, wordBreak: "break-all" as const },
  hookList: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  hookBadge: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 4,
    background: "var(--bg-tertiary)",
    color: "var(--accent)",
    fontWeight: 500,
  },
};
