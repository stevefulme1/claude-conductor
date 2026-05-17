import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionUsage, DailyUsage } from "../types";

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

function CostBar({ costs }: { costs: number[] }) {
  if (costs.length === 0) return null;
  const max = Math.max(...costs, 0.01);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32, marginTop: 4 }}>
      {costs.map((c, i) => (
        <div
          key={i}
          title={formatCost(c)}
          style={{
            flex: 1,
            height: `${Math.max((c / max) * 100, 4)}%`,
            background: "var(--accent)",
            borderRadius: 2,
            opacity: 0.7 + 0.3 * (c / max),
            minWidth: 3,
            maxWidth: 16,
          }}
        />
      ))}
    </div>
  );
}

export default function UsagePanel({ filePath, visible }: Props) {
  const [usage, setUsage] = useState<SessionUsage | null>(null);
  const [daily, setDaily] = useState<DailyUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDaily, setShowDaily] = useState(false);
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

    const fetchDaily = async () => {
      try {
        const result = await invoke<DailyUsage>("get_daily_usage");
        setDaily(result);
      } catch (_) { /* non-critical */ }
    };

    fetchUsage();
    fetchDaily();
    timerRef.current = setInterval(() => { fetchUsage(); fetchDaily(); }, 15000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [filePath, visible]);

  if (!visible || !filePath) return null;

  const modelEntries = daily ? Object.values(daily.by_model) : [];

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Usage</span>
        <button
          onClick={() => setShowDaily(!showDaily)}
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: "var(--radius-sm)",
            background: showDaily ? "var(--accent-muted)" : "none",
            color: showDaily ? "var(--accent)" : "var(--text-tertiary)",
            border: "none",
            cursor: "pointer",
          }}
        >
          {showDaily ? "Session" : "Daily Total"}
        </button>
      </div>
      {error && <div style={styles.error}>{error}</div>}

      {!showDaily && usage && (
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

      {showDaily && daily && (
        <div>
          <div style={styles.stats}>
            <div style={styles.stat}>
              <span style={styles.statLabel}>Sessions</span>
              <span style={styles.statValue}>{daily.total_sessions}</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statLabel}>Messages</span>
              <span style={styles.statValue}>{daily.total_messages}</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statLabel}>Input</span>
              <span style={styles.statValue}>{formatTokens(daily.total_input_tokens)}</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statLabel}>Output</span>
              <span style={styles.statValue}>{formatTokens(daily.total_output_tokens)}</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statLabel}>Total Cost</span>
              <span style={{ ...styles.statValue, color: "var(--accent)", fontWeight: 700 }}>
                {formatCost(daily.total_cost_usd)}
              </span>
            </div>
          </div>

          {modelEntries.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 }}>
                Per-Model Breakdown
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                {modelEntries.map(m => (
                  <div key={m.model} style={{ display: "flex", flexDirection: "column" as const, gap: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "capitalize" as const }}>{m.model}</span>
                    <span style={{ fontSize: 11, fontFamily: "'SF Mono', monospace", color: "var(--text-primary)" }}>
                      {formatCost(m.cost_usd)} / {m.message_count} msgs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {daily.session_costs.length > 1 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 2 }}>
                Cost per Session
              </div>
              <CostBar costs={daily.session_costs} />
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
    justifyContent: "space-between",
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
