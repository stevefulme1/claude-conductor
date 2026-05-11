import React from "react";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.wrapper}>
          <div style={styles.content}>
            <h2 style={styles.title}>Something went wrong</h2>
            <pre style={styles.message}>{this.state.error.message}</pre>
            <button
              onClick={() => window.location.reload()}
              style={styles.button}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-primary)",
    padding: 40,
  },
  content: {
    textAlign: "center",
    maxWidth: 480,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 12,
  },
  message: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--bg-tertiary)",
    padding: "12px 16px",
    borderRadius: 8,
    textAlign: "left",
    overflow: "auto",
    maxHeight: 200,
    marginBottom: 20,
  },
  button: {
    padding: "8px 20px",
    borderRadius: 6,
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 500,
    fontSize: 14,
  },
};
