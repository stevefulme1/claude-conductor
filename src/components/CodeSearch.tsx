import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "../types";

interface Props {
  cwd: string;
  visible: boolean;
  onClose: () => void;
}

export default function CodeSearch({ cwd, visible, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [extFilter, setExtFilter] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const fileExtensions = extFilter.trim()
        ? extFilter.split(",").map(e => e.trim().replace(/^\./, ""))
        : null;
      const res = await invoke<SearchResult[]>("search_code", {
        cwd,
        query: query.trim(),
        fileExtensions,
      });
      setResults(res);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [cwd, query, extFilter]);

  const copyLocation = useCallback((result: SearchResult) => {
    const loc = `${result.file_path}:${result.line_number}`;
    navigator.clipboard.writeText(loc);
    setCopied(loc);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ background: "rgba(212, 132, 90, 0.3)", borderRadius: 2, padding: "0 1px" }}>
          {text.slice(idx, idx + q.length)}
        </span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Code Search</span>
          <button onClick={onClose} style={styles.closeBtn}>&times;</button>
        </div>
        <div style={styles.searchRow}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
            placeholder="Search code..."
            style={styles.input}
          />
          <input
            type="text"
            value={extFilter}
            onChange={(e) => setExtFilter(e.target.value)}
            placeholder="rs,ts,py"
            style={{ ...styles.input, width: 100, flexShrink: 0 }}
            title="File extensions filter (comma-separated)"
          />
          <button onClick={doSearch} style={styles.searchBtn} disabled={loading}>
            {loading ? "..." : "Search"}
          </button>
        </div>
        {copied && (
          <div style={styles.toast}>Copied: {copied}</div>
        )}
        <div style={styles.results}>
          {results.length === 0 && !loading && query && (
            <div style={styles.empty}>No results found</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.file_path}:${r.line_number}:${i}`}
              onClick={() => copyLocation(r)}
              style={styles.resultItem}
              title="Click to copy path:line"
            >
              <div style={styles.resultHeader}>
                <span style={styles.filePath}>{r.file_path}</span>
                <span style={styles.lineNum}>:{r.line_number}</span>
                {r.match_type === "symbol" && (
                  <span style={styles.symbolBadge}>symbol</span>
                )}
              </div>
              <div style={styles.lineContent}>
                {highlightMatch(r.line_content, query)}
              </div>
            </button>
          ))}
          {results.length >= 100 && (
            <div style={styles.limitNote}>Results limited to 100 matches</div>
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
    paddingTop: 80,
  },
  panel: {
    width: 700,
    maxHeight: "70vh",
    background: "var(--bg-primary)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  closeBtn: {
    fontSize: 18,
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "2px 6px",
  },
  searchRow: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    color: "var(--text-primary)",
    outline: "none",
  },
  searchBtn: {
    padding: "8px 16px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    flexShrink: 0,
  },
  toast: {
    padding: "6px 16px",
    fontSize: 12,
    color: "var(--success)",
    background: "rgba(74, 222, 128, 0.1)",
    textAlign: "center",
  },
  results: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 8px",
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: "var(--text-tertiary)",
    fontSize: 13,
  },
  resultItem: {
    display: "block",
    width: "100%",
    padding: "8px 12px",
    textAlign: "left",
    background: "none",
    border: "none",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
    transition: "var(--transition)",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  filePath: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--accent)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  lineNum: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    flexShrink: 0,
  },
  symbolBadge: {
    fontSize: 10,
    padding: "1px 5px",
    borderRadius: 3,
    background: "rgba(96, 165, 250, 0.15)",
    color: "rgb(96, 165, 250)",
    fontWeight: 500,
    marginLeft: 4,
  },
  lineContent: {
    fontSize: 12,
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  limitNote: {
    padding: 12,
    textAlign: "center",
    fontSize: 11,
    color: "var(--text-tertiary)",
  },
};
