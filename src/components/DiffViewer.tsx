import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  cwd: string;
  filePath: string;
  onClose: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header" | "meta";
  text: string;
  lineNum?: string;
}

function parseDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of raw.split("\n")) {
    if (line.startsWith("@@")) {
      // Parse hunk header for line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      lines.push({ type: "header", text: line });
    } else if (line.startsWith("---") || line.startsWith("+++")) {
      lines.push({ type: "meta", text: line });
    } else if (line.startsWith("diff ") || line.startsWith("index ")) {
      lines.push({ type: "meta", text: line });
    } else if (line.startsWith("+")) {
      lines.push({ type: "add", text: line.slice(1), lineNum: String(newLine) });
      newLine++;
    } else if (line.startsWith("-")) {
      lines.push({ type: "remove", text: line.slice(1), lineNum: String(oldLine) });
      oldLine++;
    } else if (line.startsWith(" ")) {
      lines.push({ type: "context", text: line.slice(1), lineNum: String(newLine) });
      oldLine++;
      newLine++;
    } else if (line.trim() !== "") {
      lines.push({ type: "context", text: line });
    }
  }
  return lines;
}

export default function DiffViewer({ cwd, filePath, onClose }: Props) {
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<string>("get_file_diff", { cwd, filePath })
      .then((result) => {
        setDiff(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [cwd, filePath]);

  const lines = parseDiff(diff);

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.fileName}>{filePath}</span>
          <button onClick={onClose} style={styles.closeBtn}>
            Close
          </button>
        </div>
        <div style={styles.content}>
          {loading && <div style={styles.message}>Loading diff...</div>}
          {error && <div style={styles.error}>{error}</div>}
          {!loading && !error && lines.length === 0 && (
            <div style={styles.message}>No changes</div>
          )}
          {!loading &&
            !error &&
            lines.map((line, i) => (
              <div key={i} style={lineStyle(line.type)}>
                <span style={styles.lineNum}>{line.lineNum || ""}</span>
                <span style={styles.linePrefix}>
                  {line.type === "add"
                    ? "+"
                    : line.type === "remove"
                    ? "-"
                    : line.type === "header" || line.type === "meta"
                    ? ""
                    : " "}
                </span>
                <span
                  dangerouslySetInnerHTML={{
                    __html: escapeHtml(line.text),
                  }}
                />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function lineStyle(type: DiffLine["type"]): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "'SF Mono', 'JetBrains Mono', monospace",
    fontSize: 12,
    lineHeight: "20px",
    padding: "0 12px",
    whiteSpace: "pre",
    display: "flex",
    gap: 8,
  };

  switch (type) {
    case "add":
      return { ...base, background: "rgba(74, 222, 128, 0.1)", color: "#4ade80" };
    case "remove":
      return { ...base, background: "rgba(248, 113, 113, 0.1)", color: "#f87171" };
    case "header":
      return { ...base, background: "rgba(96, 165, 250, 0.1)", color: "#60a5fa" };
    case "meta":
      return { ...base, color: "var(--text-tertiary)" };
    default:
      return { ...base, color: "var(--text-secondary)" };
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  panel: {
    width: "80%",
    maxWidth: 900,
    maxHeight: "80vh",
    background: "var(--bg-primary)",
    borderRadius: "var(--radius-lg, 12px)",
    border: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--bg-secondary)",
  },
  fileName: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'SF Mono', monospace",
    color: "var(--text-primary)",
  },
  closeBtn: {
    fontSize: 12,
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  content: {
    overflowY: "auto",
    flex: 1,
    padding: "8px 0",
  },
  message: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    padding: 24,
    textAlign: "center",
  },
  error: {
    fontSize: 13,
    color: "#f87171",
    padding: 24,
    textAlign: "center",
  },
  lineNum: {
    width: 40,
    textAlign: "right",
    color: "var(--text-tertiary)",
    fontSize: 11,
    flexShrink: 0,
    userSelect: "none",
  },
  linePrefix: {
    width: 12,
    flexShrink: 0,
    fontWeight: 700,
  },
};
