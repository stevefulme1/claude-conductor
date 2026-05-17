import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CIStatus } from "../types";

interface Props {
  cwd: string;
}

export default function CIMonitor({ cwd }: Props) {
  const [status, setStatus] = useState<CIStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await invoke<CIStatus>("get_ci_status", { cwd });
      setStatus(result);
      setError(null);
    } catch (err) {
      setError(String(err));
      setStatus(null);
    }
  }, [cwd]);

  // Initial fetch + 30s polling
  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const handleViewLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const result = await invoke<string>("get_ci_logs", { cwd });
      setLogs(result);
    } catch (err) {
      setLogs(`Failed to fetch logs: ${err}`);
    } finally {
      setLoadingLogs(false);
    }
  }, [cwd]);

  const handleRerun = useCallback(async () => {
    setRerunning(true);
    try {
      await invoke("rerun_ci", { cwd });
      // Re-fetch status after a brief delay
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      console.error("Rerun failed:", err);
    } finally {
      setRerunning(false);
    }
  }, [cwd, fetchStatus]);

  const getIndicator = (): { color: string; icon: string; label: string } => {
    if (!status) {
      return { color: "#8e8e93", icon: "—", label: error ? "CI unavailable" : "Loading..." };
    }

    if (status.status === "in_progress" || status.status === "queued") {
      return { color: "#ff9f0a", icon: "●", label: status.status === "queued" ? "Queued" : "Running" };
    }

    if (status.status === "completed") {
      if (status.conclusion === "success") {
        return { color: "#30d158", icon: "✓", label: "Passed" };
      }
      if (status.conclusion === "failure") {
        return { color: "#ff3b30", icon: "✗", label: "Failed" };
      }
      return { color: "#8e8e93", icon: "—", label: status.conclusion || "Unknown" };
    }

    return { color: "#8e8e93", icon: "—", label: status.status };
  };

  const indicator = getIndicator();

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Status bar indicator */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        title={`CI: ${indicator.label}`}
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: "var(--radius-sm)",
          color: indicator.color,
          cursor: "pointer",
          background: "none",
          border: "none",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontWeight: 600,
        }}
      >
        <span style={{
          animation: status?.status === "in_progress" ? "ci-spin 1.5s linear infinite" : "none",
          display: "inline-block",
        }}>
          {indicator.icon}
        </span>
        CI
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          right: 0,
          marginBottom: 4,
          width: 340,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md, 8px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          zIndex: 1000,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}>
              CI Status
            </span>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: 12 }}>
            {error && !status ? (
              <div style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                padding: "8px 0",
              }}>
                {error}
              </div>
            ) : status ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Status row */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: indicator.color,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: indicator.color,
                  }}>
                    {indicator.label}
                  </span>
                </div>

                {/* Details */}
                <div style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}>
                  <div><strong>Workflow:</strong> {status.workflow_name}</div>
                  <div><strong>Branch:</strong> {status.branch}</div>
                  <div><strong>Repo:</strong> {status.repo}</div>
                </div>

                {/* Actions */}
                <div style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 4,
                }}>
                  {status.url && (
                    <a
                      href={status.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-tertiary, rgba(255,255,255,0.06))",
                        color: "var(--accent, #4a9eff)",
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      View on GitHub
                    </a>
                  )}

                  {status.conclusion === "failure" && (
                    <>
                      <button
                        onClick={handleViewLogs}
                        disabled={loadingLogs}
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          borderRadius: "var(--radius-sm)",
                          background: "rgba(255, 59, 48, 0.12)",
                          color: "#ff3b30",
                          border: "none",
                          cursor: loadingLogs ? "wait" : "pointer",
                        }}
                      >
                        {loadingLogs ? "Loading..." : "View Logs"}
                      </button>
                      <button
                        onClick={handleRerun}
                        disabled={rerunning}
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          borderRadius: "var(--radius-sm)",
                          background: "rgba(255, 159, 10, 0.12)",
                          color: "#ff9f0a",
                          border: "none",
                          cursor: rerunning ? "wait" : "pointer",
                        }}
                      >
                        {rerunning ? "Re-running..." : "Re-run"}
                      </button>
                    </>
                  )}
                </div>

                {/* Logs display */}
                {logs !== null && (
                  <div style={{
                    marginTop: 8,
                    maxHeight: 200,
                    overflow: "auto",
                    background: "var(--bg-primary)",
                    borderRadius: "var(--radius-sm)",
                    padding: 8,
                  }}>
                    <pre style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono, monospace)",
                      color: "var(--text-secondary)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      margin: 0,
                    }}>
                      {logs}
                    </pre>
                    <button
                      onClick={() => setLogs(null)}
                      style={{
                        fontSize: 10,
                        marginTop: 4,
                        color: "var(--text-tertiary)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Hide logs
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                padding: "8px 0",
              }}>
                Loading CI status...
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ci-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
