import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { McpServerEntry, ClaudeConfig } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  development: "#60a5fa",
  productivity: "#34d399",
  data: "#a78bfa",
  cloud: "#f97316",
};

export default function McpMarketplace({ visible, onClose }: Props) {
  const [entries, setEntries] = useState<McpServerEntry[]>([]);
  const [config, setConfig] = useState<ClaudeConfig | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      invoke<McpServerEntry[]>("list_marketplace").then(setEntries).catch(e => setError(String(e)));
      invoke<ClaudeConfig>("get_config").then(setConfig).catch(() => {});
    }
  }, [visible]);

  const installedNames = useMemo(() => {
    if (!config) return new Set<string>();
    return new Set(config.mcp_servers.map(s => s.name.toLowerCase()));
  }, [config]);

  const categories = useMemo(() => {
    const cats = new Set(entries.map(e => e.category));
    return Array.from(cats).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    let result = entries;
    if (category) result = result.filter(e => e.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, search, category]);

  async function handleInstall(name: string) {
    setInstalling(name);
    setError(null);
    setSuccess(null);
    try {
      await invoke("install_mcp_from_marketplace", { name });
      setSuccess(`${name} installed successfully`);
      // Reload config to update badges
      const cfg = await invoke<ClaudeConfig>("get_config");
      setConfig(cfg);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(null);
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>MCP Marketplace</span>
          <button onClick={onClose} style={styles.closeBtn}>x</button>
        </div>

        <div style={styles.toolbar}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search servers..."
            style={styles.searchInput}
          />
          <div style={styles.categoryBar}>
            <button
              onClick={() => setCategory(null)}
              style={{ ...styles.catBtn, ...(category === null ? styles.catBtnActive : {}) }}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat === category ? null : cat)}
                style={{ ...styles.catBtn, ...(category === cat ? styles.catBtnActive : {}) }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <div style={styles.content}>
          <div style={styles.grid}>
            {filtered.map(entry => {
              const isInstalled = installedNames.has(entry.name.toLowerCase().replace(/ /g, "-"));
              return (
                <div key={entry.name} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div>
                      <div style={styles.cardName}>{entry.name}</div>
                      <span style={{
                        ...styles.catBadge,
                        color: CATEGORY_COLORS[entry.category] || "var(--text-tertiary)",
                        background: `${CATEGORY_COLORS[entry.category] || "var(--text-tertiary)"}18`,
                      }}>
                        {entry.category}
                      </span>
                    </div>
                    {isInstalled ? (
                      <span style={styles.installedBadge}>Installed</span>
                    ) : (
                      <button
                        onClick={() => handleInstall(entry.name)}
                        disabled={installing === entry.name}
                        style={styles.installBtn}
                      >
                        {installing === entry.name ? "..." : "Install"}
                      </button>
                    )}
                  </div>
                  <div style={styles.cardDesc}>{entry.description}</div>
                  <div style={styles.cardMeta}>
                    <span style={styles.installType}>{entry.install_type}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  panel: { width: 640, maxHeight: "85vh", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  closeBtn: { fontSize: 14, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" },
  toolbar: { padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)" },
  searchInput: {
    width: "100%", padding: "6px 10px", fontSize: 12,
    background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)", color: "var(--text-primary)", outline: "none", marginBottom: 8,
  },
  categoryBar: { display: "flex", gap: 4, flexWrap: "wrap" as const },
  catBtn: {
    fontSize: 10, padding: "3px 8px", borderRadius: 10, background: "var(--bg-hover)",
    color: "var(--text-tertiary)", border: "none", cursor: "pointer", textTransform: "capitalize" as const,
  },
  catBtnActive: { background: "var(--accent-muted)", color: "var(--accent)", fontWeight: 600 },
  content: { padding: 16, overflowY: "auto" as const, flex: 1 },
  error: { fontSize: 11, color: "#f87171", padding: "4px 16px" },
  success: { fontSize: 11, color: "var(--success)", padding: "4px 16px" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  card: {
    border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 12px",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  cardName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" },
  cardDesc: { fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4, marginBottom: 6 },
  cardMeta: { display: "flex", gap: 4 },
  catBadge: { fontSize: 9, padding: "1px 5px", borderRadius: 3, display: "inline-block", marginTop: 2 },
  installType: { fontSize: 9, color: "var(--text-tertiary)", fontFamily: "'SF Mono', monospace", padding: "1px 4px", background: "var(--bg-hover)", borderRadius: 3 },
  installBtn: {
    fontSize: 10, padding: "3px 10px", borderRadius: "var(--radius-sm)",
    background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500, flexShrink: 0,
  },
  installedBadge: {
    fontSize: 9, padding: "2px 6px", borderRadius: "var(--radius-sm)",
    background: "rgba(74,222,128,0.15)", color: "var(--success)", fontWeight: 600, flexShrink: 0,
  },
};
