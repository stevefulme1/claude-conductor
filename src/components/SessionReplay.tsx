import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReplayMessage } from "../types";

interface Props {
  filePath: string;
  visible: boolean;
  onClose: () => void;
}

export default function SessionReplay({ filePath, visible, onClose }: Props) {
  const [messages, setMessages] = useState<ReplayMessage[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !filePath) return;
    setVisibleCount(0);
    setPlaying(false);
    invoke<ReplayMessage[]>("get_session_transcript", { filePath })
      .then(setMessages)
      .catch(e => setError(String(e)));
  }, [filePath, visible]);

  const step = useCallback(() => {
    setVisibleCount(prev => {
      if (prev >= messages.length) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [messages.length]);

  useEffect(() => {
    if (!playing || visibleCount >= messages.length) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (visibleCount >= messages.length) setPlaying(false);
      return;
    }
    const delay = 800 / speed;
    timerRef.current = setTimeout(() => {
      step();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, visibleCount, speed, step, messages.length]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [visibleCount]);

  if (!visible) return null;

  const progress = messages.length > 0 ? (visibleCount / messages.length) * 100 : 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Session Replay</span>
          <span style={styles.counter}>
            {visibleCount} / {messages.length} turns
          </span>
          <button onClick={onClose} style={styles.closeBtn}>x</button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>

        <div ref={listRef} style={styles.messageList}>
          {messages.slice(0, visibleCount).map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.message,
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background: msg.role === "user" ? "var(--accent-muted)" : "var(--bg-hover)",
                borderColor: msg.role === "user" ? "var(--accent)" : "var(--border-subtle)",
                animation: i === visibleCount - 1 ? "fadeIn 0.3s ease-in" : "none",
              }}
            >
              <div style={styles.msgHeader}>
                <span style={{
                  ...styles.roleBadge,
                  color: msg.role === "user" ? "var(--accent)" : "var(--success)",
                }}>
                  {msg.role}
                </span>
                <span style={styles.turnNum}>#{msg.turn_number}</span>
              </div>
              <div style={styles.msgContent}>{msg.content}</div>
              {msg.timestamp && (
                <div style={styles.timestamp}>{new Date(msg.timestamp).toLocaleTimeString()}</div>
              )}
            </div>
          ))}
        </div>

        <div style={styles.controls}>
          <button
            onClick={() => { setVisibleCount(0); setPlaying(false); }}
            style={styles.controlBtn}
            title="Reset"
          >
            |&lt;
          </button>
          <button
            onClick={() => {
              if (visibleCount >= messages.length) {
                setVisibleCount(0);
              }
              setPlaying(!playing);
            }}
            style={{ ...styles.controlBtn, ...styles.playBtn }}
          >
            {playing ? "||" : visibleCount >= messages.length ? "Replay" : "Play"}
          </button>
          <button onClick={step} style={styles.controlBtn} title="Step forward">
            &gt;|
          </button>
          <div style={styles.speedGroup}>
            {[1, 2, 5].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  ...styles.speedBtn,
                  ...(speed === s ? styles.speedBtnActive : {}),
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", top: 36, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  panel: { width: 600, maxHeight: "85vh", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  counter: { fontSize: 11, fontFamily: "'SF Mono', monospace", color: "var(--text-tertiary)" },
  closeBtn: { fontSize: 14, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" },
  error: { fontSize: 11, color: "#f87171", padding: "4px 16px" },
  progressBar: { height: 3, background: "var(--bg-hover)", position: "relative" as const },
  progressFill: { height: "100%", background: "var(--accent)", transition: "width 0.2s", borderRadius: 2 },
  messageList: {
    flex: 1, padding: 16, overflowY: "auto" as const,
    display: "flex", flexDirection: "column" as const, gap: 8, minHeight: 200,
  },
  message: {
    maxWidth: "85%", padding: "8px 12px", borderRadius: "var(--radius-sm)",
    border: "1px solid", transition: "opacity 0.3s",
  },
  msgHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  roleBadge: { fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  turnNum: { fontSize: 9, color: "var(--text-tertiary)", fontFamily: "'SF Mono', monospace" },
  msgContent: { fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  timestamp: { fontSize: 9, color: "var(--text-tertiary)", marginTop: 4, textAlign: "right" as const },
  controls: {
    display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
    borderTop: "1px solid var(--border-subtle)", background: "var(--bg-secondary)",
  },
  controlBtn: {
    fontSize: 12, padding: "5px 12px", borderRadius: "var(--radius-sm)",
    background: "var(--bg-hover)", color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)", cursor: "pointer", fontFamily: "'SF Mono', monospace",
  },
  playBtn: { background: "var(--accent)", color: "#fff", border: "none", fontWeight: 600 },
  speedGroup: { marginLeft: "auto", display: "flex", gap: 2 },
  speedBtn: {
    fontSize: 10, padding: "3px 8px", borderRadius: "var(--radius-sm)",
    background: "var(--bg-hover)", color: "var(--text-tertiary)", border: "none", cursor: "pointer",
  },
  speedBtnActive: { background: "var(--accent-muted)", color: "var(--accent)", fontWeight: 600 },
};
