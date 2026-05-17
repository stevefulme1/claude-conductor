import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PerformanceBenchmarks } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${Math.round(tokens)}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export default function BenchmarksPanel({ visible, onClose }: Props) {
  const [benchmarks, setBenchmarks] = useState<PerformanceBenchmarks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      invoke<PerformanceBenchmarks>("get_performance_benchmarks")
        .then(setBenchmarks)
        .catch((err) => setError(String(err)))
        .finally(() => setLoading(false));
    }
  }, [visible]);

  if (!visible) return null;

  const cards: { label: string; value: string; sub?: string }[] = benchmarks
    ? [
        {
          label: "Avg Session Duration",
          value: formatDuration(benchmarks.avg_session_duration_secs),
          sub: "across all sessions",
        },
        {
          label: "Avg Tokens / Session",
          value: formatTokens(benchmarks.avg_tokens_per_session),
          sub: "input + output",
        },
        {
          label: "Avg Cost / Session",
          value: formatCost(benchmarks.avg_cost_per_session),
          sub: "estimated USD",
        },
        {
          label: "Sessions / Day",
          value: benchmarks.sessions_per_day.toFixed(1),
          sub: "last 30 days",
        },
        {
          label: "Most Used Agent",
          value: benchmarks.most_used_agent,
          sub: "by session count",
        },
        {
          label: "Success Rate",
          value: `${benchmarks.success_rate.toFixed(1)}%`,
          sub: `${benchmarks.total_sessions_analyzed} sessions analyzed`,
        },
      ]
    : [];

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={styles.title}>Performance Benchmarks</h2>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>

        <div style={styles.body}>
          {loading && <div style={styles.loading}>Analyzing sessions...</div>}
          {error && <div style={styles.error}>{error}</div>}
          {benchmarks && (
            <div style={styles.grid}>
              {cards.map((card) => (
                <div key={card.label} style={styles.card}>
                  <div style={styles.cardLabel}>{card.label}</div>
                  <div style={styles.cardValue}>{card.value}</div>
                  {card.sub && <div style={styles.cardSub}>{card.sub}</div>}
                </div>
              ))}
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
    width: "80%",
    maxWidth: 750,
    maxHeight: "70vh",
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
  title: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  body: { padding: 20, overflow: "auto", flex: 1 },
  loading: { textAlign: "center" as const, padding: 40, color: "var(--text-tertiary)", fontSize: 13 },
  error: { textAlign: "center" as const, padding: 20, color: "var(--danger)", fontSize: 13 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
  },
  card: {
    background: "var(--bg-secondary)",
    borderRadius: "var(--radius-md, 8px)",
    padding: "20px 16px",
    border: "1px solid var(--border-subtle)",
    textAlign: "center" as const,
  },
  cardLabel: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--accent)",
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 11,
    color: "var(--text-tertiary)",
  },
};
