import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DevServer } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function BrowserPreview({ visible, onClose }: Props) {
  const [url, setUrl] = useState("http://localhost:3000");
  const [urlInput, setUrlInput] = useState("http://localhost:3000");
  const [servers, setServers] = useState<DevServer[]>([]);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const detectServers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<DevServer[]>("detect_dev_servers");
      setServers(result);
      if (result.length > 0 && url === "http://localhost:3000") {
        setUrl(result[0].url);
        setUrlInput(result[0].url);
      }
    } catch (e) {
      console.error("Failed to detect dev servers:", e);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (visible) detectServers();
  }, [visible, detectServers]);

  function navigate() {
    let target = urlInput.trim();
    if (target && !target.startsWith("http")) {
      target = "http://" + target;
    }
    setUrl(target);
  }

  function refresh() {
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  }

  if (!visible) return null;

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onClose} style={styles.toolBtn} title="Close preview">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <button onClick={refresh} style={styles.toolBtn} title="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
          </svg>
        </button>
        <input
          style={styles.urlInput}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate();
          }}
          placeholder="http://localhost:3000"
        />
        <button onClick={navigate} style={styles.goBtn}>
          Go
        </button>
        {servers.length > 0 && (
          <select
            style={styles.serverSelect}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlInput(e.target.value);
            }}
          >
            {servers.map((s) => (
              <option key={s.port} value={s.url}>
                :{s.port}
              </option>
            ))}
          </select>
        )}
        <button onClick={detectServers} style={styles.toolBtn} title="Detect dev servers" disabled={loading}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      </div>
      <div style={styles.iframeWrap}>
        <iframe
          ref={iframeRef}
          src={url}
          style={styles.iframe}
          title="Browser Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    background: "var(--bg-primary)",
    borderTop: "1px solid var(--border)",
    minHeight: 200,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    background: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  toolBtn: {
    padding: 6,
    borderRadius: 4,
    color: "var(--text-secondary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  urlInput: {
    flex: 1,
    padding: "6px 10px",
    borderRadius: 4,
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: 12,
    fontFamily: "monospace",
    outline: "none",
  },
  goBtn: {
    padding: "5px 12px",
    borderRadius: 4,
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  },
  serverSelect: {
    padding: "4px 6px",
    borderRadius: 4,
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
    fontSize: 11,
    cursor: "pointer",
  },
  iframeWrap: {
    flex: 1,
    overflow: "hidden",
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: "none",
    background: "#fff",
  },
};
