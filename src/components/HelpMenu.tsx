import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url: string;
  changelog: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Tab = "features" | "shortcuts" | "updates" | "about";

interface Feature {
  name: string;
  description: string;
  access: string;
}

interface FeatureCategory {
  name: string;
  features: Feature[];
}

const FEATURE_DATA: FeatureCategory[] = [
  {
    name: "Session Management",
    features: [
      { name: "Multi-Tab Sessions", description: "Open multiple sessions in tabs. Drag to reorder.", access: "Tab bar" },
      { name: "Session Discovery", description: "Auto-discovers sessions from ~/.claude/projects/", access: "Sidebar" },
      { name: "Session Search", description: "Full-text search across all sessions", access: "Cmd+F in sidebar" },
      { name: "Session Labels", description: "Right-click a session to rename it", access: "Context menu" },
      { name: "Session Resume", description: "Click any discovered session to resume it", access: "Sidebar click" },
      { name: "Session Templates", description: "Pre-configured session profiles", access: "Cmd+Shift+T" },
      { name: "Session Chaining", description: "Create multi-step agent pipelines", access: "Cmd+Shift+C" },
      { name: "Session Replay", description: "Playback completed sessions step-by-step", access: "Status bar > Replay" },
      { name: "Session Export", description: "Export sessions as Markdown or HTML", access: "Status bar > Export" },
    ],
  },
  {
    name: "Terminal",
    features: [
      { name: "Split Panes", description: "Vertical or horizontal split panes", access: "Cmd+D / Cmd+Shift+D" },
      { name: "Terminal Pause/Resume", description: "Pause output buffering without killing the process", access: "Status bar" },
      { name: "Voice Input", description: "Dictate to terminal via microphone", access: "Cmd+Shift+V" },
      { name: "Multi-Agent", description: "Switch between Claude, Codex, Gemini, Aider, or custom agents", access: "New session dialog" },
    ],
  },
  {
    name: "Git Integration",
    features: [
      { name: "Git Worktrees", description: "Isolate sessions in separate worktrees (offered on new session)", access: "New session dialog" },
      { name: "File Change Tracking", description: "See what files changed in each session", access: "Status bar > Changes" },
      { name: "Inline Diff Viewer", description: "Click any changed file to see the diff", access: "Changes panel" },
      { name: "Checkpoints", description: "Create/restore named checkpoints via git tags", access: "Status bar > Checkpoints" },
      { name: "Git Graph", description: "Visualize git log with ASCII graph", access: "Cmd+Shift+G" },
    ],
  },
  {
    name: "Analytics & Monitoring",
    features: [
      { name: "Usage Analytics", description: "Token counts and cost per session", access: "Status bar > Usage" },
      { name: "Daily Cost Calculator", description: "Aggregate cost across all sessions today", access: "Status panel" },
      { name: "Performance Benchmarks", description: "Average duration, tokens, cost, success rate", access: "Status bar > Benchmarks" },
      { name: "CI Monitor", description: "GitHub Actions status with logs and re-run", access: "Status bar icon" },
    ],
  },
  {
    name: "Agent Management",
    features: [
      { name: "Agent Presets", description: "Built-in presets for Claude, Codex, Gemini, Aider", access: "Agent Profiles panel" },
      { name: "Custom Agent Profiles", description: "Save your own agent configurations", access: "Sidebar > Profiles" },
      { name: "Smart Routing", description: "Auto-detect project type and suggest best agent", access: "New session dialog" },
      { name: "MCP Dashboard", description: "Manage MCP servers with health checks", access: "Settings > MCP" },
      { name: "MCP Marketplace", description: "Browse and one-click install MCP servers", access: "Sidebar > Marketplace" },
    ],
  },
  {
    name: "Collaboration",
    features: [
      { name: "Session Sharing", description: "Export as self-contained HTML for teammates", access: "Export menu" },
      { name: "Compliance Mode", description: "Audit log of all agent actions (toggle in status bar)", access: "Status bar" },
      { name: "Kanban Board", description: "Track session status (Planning > Running > Review > Done)", access: "Sidebar > Kanban" },
    ],
  },
  {
    name: "Advanced",
    features: [
      { name: "Spatial Canvas", description: "2D canvas layout for sessions", access: "Cmd+Shift+Space" },
      { name: "Browser Preview", description: "Embedded preview with dev server detection", access: "Cmd+Shift+B" },
      { name: "Code Search", description: "Search code with symbol detection", access: "Cmd+Shift+F" },
      { name: "Plugin System", description: "Extensible plugin architecture", access: "Settings > Plugins" },
      { name: "SSO/OAuth", description: "PKCE-based authentication for MCP servers", access: "MCP Dashboard" },
    ],
  },
];

const SHORTCUTS: { shortcut: string; action: string }[] = [
  { shortcut: "Cmd+N", action: "New session" },
  { shortcut: "Cmd+W", action: "Close tab" },
  { shortcut: "Cmd+[", action: "Previous tab" },
  { shortcut: "Cmd+]", action: "Next tab" },
  { shortcut: "Cmd+1-9", action: "Jump to tab" },
  { shortcut: "Cmd+D", action: "Split vertical" },
  { shortcut: "Cmd+Shift+D", action: "Split horizontal" },
  { shortcut: "Cmd+Shift+F", action: "Code search" },
  { shortcut: "Cmd+Shift+G", action: "Git graph" },
  { shortcut: "Cmd+Shift+V", action: "Voice input" },
  { shortcut: "Cmd+Shift+B", action: "Browser preview" },
  { shortcut: "Cmd+Shift+C", action: "Session chains" },
  { shortcut: "Cmd+Shift+T", action: "Session templates" },
  { shortcut: "Cmd+Shift+Space", action: "Spatial canvas" },
  { shortcut: "Cmd+?", action: "Open help" },
];

export default function HelpMenu({ visible, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("features");
  const [featureSearch, setFeatureSearch] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (visible) {
      invoke<string>("get_current_version").then(setVersion).catch(() => {});
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, onClose]);

  const filteredFeatures = useMemo(() => {
    if (!featureSearch.trim()) return FEATURE_DATA;
    const q = featureSearch.toLowerCase();
    return FEATURE_DATA.map((cat) => ({
      ...cat,
      features: cat.features.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.access.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.features.length > 0);
  }, [featureSearch]);

  async function handleCheckUpdates() {
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Update check timed out. Check your internet connection.")), 15000)
      );
      const info = await Promise.race([
        invoke<UpdateInfo>("check_for_updates"),
        timeout,
      ]);
      setUpdateInfo(info);
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setUpdateLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>Help</h2>
          <button onClick={onClose} style={styles.closeBtn} title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabBar}>
          {(
            [
              { key: "features", label: "Feature Guide" },
              { key: "shortcuts", label: "Keyboard Shortcuts" },
              { key: "updates", label: "Updates" },
              { key: "about", label: "About" },
            ] as { key: Tab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                ...styles.tab,
                ...(activeTab === tab.key ? styles.tabActive : {}),
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {activeTab === "features" && (
            <div>
              <div style={styles.searchWrap}>
                <svg
                  style={styles.searchIcon}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search features..."
                  value={featureSearch}
                  onChange={(e) => setFeatureSearch(e.target.value)}
                  style={styles.searchInput}
                  autoFocus
                />
              </div>
              {filteredFeatures.map((cat) => (
                <div key={cat.name} style={styles.featureCategory}>
                  <h3 style={styles.categoryTitle}>{cat.name}</h3>
                  {cat.features.map((f) => (
                    <div key={f.name} style={styles.featureRow}>
                      <div style={styles.featureName}>{f.name}</div>
                      <div style={styles.featureDesc}>{f.description}</div>
                      <div style={styles.featureAccess}>{f.access}</div>
                    </div>
                  ))}
                </div>
              ))}
              {filteredFeatures.length === 0 && (
                <div style={styles.emptySearch}>No features match your search.</div>
              )}
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div style={styles.shortcutsTable}>
              <div style={styles.shortcutHeader}>
                <div style={styles.shortcutColKey}>Shortcut</div>
                <div style={styles.shortcutColAction}>Action</div>
              </div>
              {SHORTCUTS.map((s) => (
                <div key={s.shortcut} style={styles.shortcutRow}>
                  <div style={styles.shortcutColKey}>
                    <kbd style={styles.kbd}>{s.shortcut}</kbd>
                  </div>
                  <div style={styles.shortcutColAction}>{s.action}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "updates" && (
            <div style={styles.updatesContent}>
              <div style={styles.versionRow}>
                <span style={styles.versionLabel}>Current Version</span>
                <span style={styles.versionValue}>{version || "..."}</span>
              </div>

              <button
                onClick={handleCheckUpdates}
                disabled={updateLoading}
                style={styles.checkUpdateBtn}
              >
                {updateLoading ? (
                  <span style={styles.spinner} />
                ) : (
                  "Check for Updates"
                )}
              </button>

              {updateError && (
                <div style={styles.updateError}>{updateError}</div>
              )}

              {updateInfo && !updateError && (
                <div style={styles.updateResult}>
                  {updateInfo.update_available ? (
                    <>
                      <div style={styles.updateAvailable}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4M12 16h.01" />
                        </svg>
                        <span>
                          Update available: <strong>v{updateInfo.latest_version}</strong>
                        </span>
                      </div>
                      {updateInfo.changelog && (
                        <div style={styles.changelog}>
                          <h4 style={styles.changelogTitle}>Changelog</h4>
                          <pre style={styles.changelogText}>{updateInfo.changelog}</pre>
                        </div>
                      )}
                      <a
                        href={updateInfo.release_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.downloadLink}
                      >
                        Download from GitHub
                      </a>
                    </>
                  ) : (
                    <div style={styles.upToDate}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span>You're on the latest version (v{updateInfo.current_version})</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "about" && (
            <div style={styles.aboutContent}>
              <div style={styles.aboutLogo}>C</div>
              <h2 style={styles.aboutName}>Claude Conductor</h2>
              <div style={styles.aboutVersion}>Version {version || "..."}</div>
              <p style={styles.aboutDesc}>
                Desktop session manager for Claude Code CLI and other AI coding agents.
              </p>

              <div style={styles.aboutSection}>
                <div style={styles.aboutRow}>
                  <span style={styles.aboutLabel}>Author</span>
                  <span style={styles.aboutValue}>Steve Fulmer</span>
                </div>
                <div style={styles.aboutRow}>
                  <span style={styles.aboutLabel}>License</span>
                  <span style={styles.aboutValue}>CC BY-NC 4.0</span>
                </div>
              </div>

              <div style={styles.aboutSection}>
                <h4 style={styles.aboutSectionTitle}>Links</h4>
                <div style={styles.aboutLinks}>
                  <a href="https://github.com/stevefulme1/claude-conductor" target="_blank" rel="noopener noreferrer" style={styles.aboutLink}>
                    GitHub Repository
                  </a>
                  <a href="https://github.com/stevefulme1/claude-conductor/issues" target="_blank" rel="noopener noreferrer" style={styles.aboutLink}>
                    Report Issues
                  </a>
                  <a href="https://github.com/stevefulme1/claude-conductor/releases" target="_blank" rel="noopener noreferrer" style={styles.aboutLink}>
                    Releases
                  </a>
                </div>
              </div>

              <div style={styles.aboutTech}>
                Built with Tauri, React, Rust, and xterm.js
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
    top: 36, left: 0, right: 0, bottom: 0,
    background: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    backdropFilter: "blur(4px)",
  },
  modal: {
    width: "90vw",
    maxWidth: 720,
    height: "85vh",
    maxHeight: 700,
    background: "var(--bg-primary)",
    borderRadius: "var(--radius-lg, 12px)",
    border: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 24px 48px rgba(0, 0, 0, 0.3)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  closeBtn: {
    padding: 6,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  tabBar: {
    display: "flex",
    gap: 0,
    padding: "0 20px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  tab: {
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    transition: "color 0.15s, border-color 0.15s",
  },
  tabActive: {
    color: "var(--accent)",
    borderBottomColor: "var(--accent)",
  },
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 20px",
  },
  // Feature Guide
  searchWrap: {
    position: "relative" as const,
    marginBottom: 16,
  },
  searchIcon: {
    position: "absolute" as const,
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-tertiary)",
    pointerEvents: "none" as const,
  },
  searchInput: {
    width: "100%",
    padding: "8px 12px 8px 32px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    outline: "none",
    color: "var(--text-primary)",
    boxSizing: "border-box" as const,
  },
  featureCategory: {
    marginBottom: 20,
  },
  categoryTitle: {
    margin: "0 0 8px 0",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  featureRow: {
    display: "grid",
    gridTemplateColumns: "160px 1fr 140px",
    gap: 8,
    padding: "8px 0",
    borderBottom: "1px solid var(--border-subtle)",
    alignItems: "baseline",
  },
  featureName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  featureDesc: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  featureAccess: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    fontFamily: "var(--font-mono, monospace)",
    textAlign: "right" as const,
  },
  emptySearch: {
    padding: 32,
    textAlign: "center" as const,
    color: "var(--text-tertiary)",
    fontSize: 13,
  },
  // Shortcuts
  shortcutsTable: {
    borderRadius: "var(--radius-sm)",
    overflow: "hidden",
  },
  shortcutHeader: {
    display: "grid",
    gridTemplateColumns: "200px 1fr",
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border-subtle)",
    fontWeight: 600,
    fontSize: 12,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  shortcutRow: {
    display: "grid",
    gridTemplateColumns: "200px 1fr",
    padding: "10px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    alignItems: "center",
  },
  shortcutColKey: {
    fontSize: 13,
  },
  shortcutColAction: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  kbd: {
    display: "inline-block",
    padding: "2px 8px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-primary)",
    boxShadow: "0 1px 0 var(--border)",
  },
  // Updates
  updatesContent: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 16,
    paddingTop: 24,
  },
  versionRow: {
    display: "flex",
    gap: 12,
    alignItems: "baseline",
  },
  versionLabel: {
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  versionValue: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono, monospace)",
  },
  checkUpdateBtn: {
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 500,
    borderRadius: "var(--radius-sm)",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 180,
    justifyContent: "center",
  },
  spinner: {
    display: "inline-block",
    width: 16,
    height: 16,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
  updateError: {
    padding: "10px 16px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(248, 113, 113, 0.1)",
    border: "1px solid rgba(248, 113, 113, 0.2)",
    color: "var(--danger, #f87171)",
    fontSize: 13,
    maxWidth: 500,
    textAlign: "center" as const,
  },
  updateResult: {
    width: "100%",
    maxWidth: 500,
  },
  updateAvailable: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.2)",
    fontSize: 14,
    color: "var(--text-primary)",
    marginBottom: 12,
  },
  changelog: {
    marginBottom: 12,
  },
  changelogTitle: {
    margin: "0 0 6px 0",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  changelogText: {
    margin: 0,
    padding: 12,
    background: "var(--bg-tertiary)",
    borderRadius: "var(--radius-sm)",
    fontSize: 12,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap" as const,
    maxHeight: 200,
    overflowY: "auto" as const,
    fontFamily: "var(--font-mono, monospace)",
    lineHeight: 1.5,
  },
  downloadLink: {
    display: "inline-block",
    padding: "10px 20px",
    borderRadius: "var(--radius-sm)",
    background: "var(--accent)",
    color: "#fff",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
  },
  upToDate: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(34, 197, 94, 0.1)",
    border: "1px solid rgba(34, 197, 94, 0.2)",
    fontSize: 14,
    color: "var(--text-primary)",
  },
  // About
  aboutContent: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    paddingTop: 24,
    gap: 8,
  },
  aboutLogo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: "linear-gradient(135deg, var(--accent), #c47a50)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 28,
    color: "#fff",
    marginBottom: 8,
  },
  aboutName: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  aboutVersion: {
    fontSize: 14,
    color: "var(--text-tertiary)",
    fontFamily: "var(--font-mono, monospace)",
  },
  aboutDesc: {
    fontSize: 14,
    color: "var(--text-secondary)",
    textAlign: "center" as const,
    maxWidth: 400,
    lineHeight: 1.5,
    margin: "8px 0 16px",
  },
  aboutSection: {
    width: "100%",
    maxWidth: 400,
    padding: "12px 0",
    borderTop: "1px solid var(--border-subtle)",
  },
  aboutRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    fontSize: 13,
  },
  aboutLabel: {
    color: "var(--text-tertiary)",
  },
  aboutValue: {
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  aboutSectionTitle: {
    margin: "0 0 8px 0",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  aboutLinks: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  aboutLink: {
    fontSize: 13,
    color: "var(--accent)",
    textDecoration: "none",
  },
  aboutTech: {
    marginTop: 16,
    padding: "8px 16px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-tertiary)",
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
};
