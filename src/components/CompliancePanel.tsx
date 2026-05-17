import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { ComplianceEvent } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CompliancePanel({ visible, onClose }: Props) {
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const loadEvents = useCallback(() => {
    invoke<ComplianceEvent[]>("get_compliance_log", { limit: 100 })
      .then(setEvents)
      .catch((err) => console.error("Failed to load compliance log:", err));
  }, []);

  useEffect(() => {
    if (visible) {
      loadEvents();
      // Default date range: last 7 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [visible, loadEvents]);

  async function handleExport() {
    if (!startDate || !endDate) return;
    try {
      const report = await invoke<string>("export_compliance_report", {
        startDate,
        endDate,
      });
      const destPath = await save({
        defaultPath: `compliance-report-${startDate}-${endDate}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (destPath) {
        await invoke("save_export", { destPath, content: report });
        setNotice("Report exported");
        setTimeout(() => setNotice(null), 2000);
      }
    } catch (err) {
      console.error("Export failed:", err);
      setNotice("Export failed");
      setTimeout(() => setNotice(null), 2000);
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={styles.title}>Compliance Audit Log</h2>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>

        <div style={styles.controls}>
          <label style={styles.label}>
            From:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          <label style={styles.label}>
            To:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={styles.dateInput}
            />
          </label>
          <button onClick={handleExport} style={styles.exportBtn}>
            Export Report
          </button>
          <button onClick={loadEvents} style={styles.refreshBtn}>
            Refresh
          </button>
          {notice && <span style={styles.notice}>{notice}</span>}
        </div>

        <div style={styles.logContainer}>
          {events.length === 0 ? (
            <div style={styles.empty}>No compliance events recorded yet.</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Session</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Details</th>
                  <th style={styles.th}>Approved</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                    <td style={styles.td}>
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td style={styles.td}>{ev.session_id.slice(0, 8)}</td>
                    <td style={styles.td}>
                      <span style={styles.actionBadge}>{ev.action}</span>
                    </td>
                    <td style={{ ...styles.td, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.details}
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: ev.approved ? "var(--success)" : "var(--danger)" }}>
                        {ev.approved ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    width: "85%",
    maxWidth: 900,
    maxHeight: "80vh",
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
  controls: {
    display: "flex",
    gap: 12,
    padding: "12px 20px",
    alignItems: "center",
    flexWrap: "wrap" as const,
    borderBottom: "1px solid var(--border-subtle)",
  },
  label: { fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 },
  dateInput: {
    padding: "4px 8px",
    fontSize: 12,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
  },
  exportBtn: {
    padding: "6px 12px",
    fontSize: 12,
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    fontWeight: 500,
  },
  refreshBtn: {
    padding: "6px 12px",
    fontSize: 12,
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  notice: { fontSize: 11, color: "var(--success)", fontWeight: 500 },
  logContainer: { flex: 1, overflow: "auto", padding: "0 20px 16px" },
  empty: { textAlign: "center" as const, padding: 40, color: "var(--text-tertiary)", fontSize: 13 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
  th: {
    textAlign: "left" as const,
    padding: "8px 10px",
    color: "var(--text-tertiary)",
    fontWeight: 500,
    borderBottom: "1px solid var(--border-subtle)",
    position: "sticky" as const,
    top: 0,
    background: "var(--bg-primary)",
  },
  td: { padding: "6px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" as const },
  rowEven: { background: "transparent" },
  rowOdd: { background: "var(--bg-secondary)" },
  actionBadge: {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    background: "var(--bg-tertiary)",
    color: "var(--accent)",
    fontWeight: 500,
  },
};
