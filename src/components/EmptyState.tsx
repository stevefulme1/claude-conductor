export default function EmptyState() {
  return (
    <div style={styles.wrapper}>
      <div style={styles.content}>
        <div style={styles.logo}>C</div>
        <h1 style={styles.title}>Claude Conductor</h1>
        <p style={styles.subtitle}>
          Select a session from the sidebar to resume it, or start a new Claude
          Code session in your terminal.
        </p>
        <div style={styles.hints}>
          <div style={styles.hint}>
            <kbd style={styles.kbd}>claude</kbd>
            <span>Start a new session</span>
          </div>
          <div style={styles.hint}>
            <kbd style={styles.kbd}>claude --resume</kbd>
            <span>Resume from CLI</span>
          </div>
          <div style={styles.hint}>
            <kbd style={styles.kbd}>claude --continue</kbd>
            <span>Continue last session</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  content: {
    textAlign: "center",
    maxWidth: 420,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: "linear-gradient(135deg, var(--accent), #c47a50)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 28,
    color: "#fff",
    marginBottom: 20,
    boxShadow: "0 8px 32px rgba(212, 132, 90, 0.2)",
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
    marginBottom: 32,
  },
  hints: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    textAlign: "left",
  },
  hint: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  kbd: {
    fontFamily: "'SF Mono', monospace",
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    minWidth: 160,
  },
};
