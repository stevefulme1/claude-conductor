import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionUsage } from "../types";

interface Props {
  filePath: string;
  visible: boolean;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export default function UsagePanel({ filePath, visible }: Props) {
  const [usage, setUsage] = useState<SessionUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible || !filePath) return;

    const fetchUsage = async () => {
      try {
        const result = await invoke<SessionUsage>("get_session_usage", { filePath });
        setUsage(result);
        setError(null);
      } catch (err) {
        setError(String(err));
      }
    };

    fetchUsage();
    timerRef.current = setInterval(fetchUsage, 15000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [filePath, visible]);

  if (!visible || !filePath) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Usage</span>
      </div>
      {error && <div style={styles.error}>{error}</div>}
      {usage && (
        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Messages</span>
            <span style={styles.statValue}>{usage.message_count}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Input</span>
            <span style={styles.statValue}>{formatTokens(usage.input_tokens)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Output</span>
            <span style={styles.statValue}>{formatTokens(usage.output_tokens)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Cost</span>
            <span style={{ ...styles.statValue, color: "var(--accent)" }}>
              {formatCost(usage.estimated_cost_usd)}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Duration</span>
            <span style={styles.statValue}>{formatDuration(usage.duration_seconds)}</span>
          </div>
          {usage.model && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Model</span>
              <span style={styles.statValue}>{usage.model}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    borderTop: "1px solid var(--border-subtle)",
    background: "var(--bg-secondary)",
    padding: "6px 12px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  error: {
    fontSize: 11,
    color: "#f87171",
    padding: "4px 0",
  },
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  statLabel: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  statValue: {
    fontSize: 13,
    fontFamily: "'SF Mono', monospace",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
};
