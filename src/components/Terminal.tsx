import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { SessionMeta } from "../types";

interface Props {
  session: SessionMeta;
  label: string;
  visible: boolean;
  onStatusChange: (status: "running" | "exited") => void;
}

function stripControl(s: string): string {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function buildTermTheme() {
  const cs = getComputedStyle(document.documentElement);
  const termBg = cs.getPropertyValue("--term-bg").trim() || "#0d0d0d";
  const termFg = cs.getPropertyValue("--term-fg").trim() || "#e8e8e8";
  const termCursor = cs.getPropertyValue("--term-cursor").trim() || "#d4845a";
  const termSel = cs.getPropertyValue("--term-selection").trim() || "rgba(212,132,90,0.3)";
  const isDark = termBg.startsWith("#0") || termBg.startsWith("#1");
  return {
    background: termBg,
    foreground: termFg,
    cursor: termCursor,
    cursorAccent: termBg,
    selectionBackground: termSel,
    black: isDark ? "#1e1e1e" : "#2e2e2e",
    red: isDark ? "#f87171" : "#dc2626",
    green: isDark ? "#4ade80" : "#16a34a",
    yellow: isDark ? "#fbbf24" : "#d97706",
    blue: isDark ? "#60a5fa" : "#2563eb",
    magenta: isDark ? "#c084fc" : "#9333ea",
    cyan: isDark ? "#22d3ee" : "#0891b2",
    white: isDark ? "#e8e8e8" : "#1a1a1a",
    brightBlack: isDark ? "#666" : "#888",
    brightRed: isDark ? "#fca5a5" : "#ef4444",
    brightGreen: isDark ? "#86efac" : "#22c55e",
    brightYellow: isDark ? "#fde68a" : "#eab308",
    brightBlue: isDark ? "#93c5fd" : "#3b82f6",
    brightMagenta: isDark ? "#d8b4fe" : "#a855f7",
    brightCyan: isDark ? "#67e8f9" : "#06b6d4",
    brightWhite: isDark ? "#fff" : "#000",
  };
}

export default function Terminal({ session, label, visible, onStatusChange }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;
  const [status, setStatus] = useState<"idle" | "running" | "exited">("idle");
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    if (visible) {
      invoke("resume_terminal", { sessionId: session.session_id }).catch(() => {});
      if (fitRef.current) {
        requestAnimationFrame(() => {
          fitRef.current?.fit();
        });
      }
    } else {
      invoke("pause_terminal", { sessionId: session.session_id }).catch(() => {});
    }
  }, [visible, session.session_id]);

  useEffect(() => {
    if (!termRef.current) return;

    let mounted = true;
    const unlisteners: UnlistenFn[] = [];
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const term = new XTerm({
      theme: buildTermTheme(),
      fontFamily:
        "'SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      allowProposedApi: true,
      convertEol: false,
    });

    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(termRef.current);

    requestAnimationFrame(() => fit.fit());

    let lastCols = term.cols;
    let lastRows = term.rows;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!mounted) return;
        fit.fit();
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols;
          lastRows = term.rows;
          invoke("resize_terminal", {
            sessionId: session.session_id,
            cols: term.cols,
            rows: term.rows,
          }).catch((err) => console.warn("resize_terminal failed:", err));
        }
      }, 100);
    });
    resizeObserver.observe(termRef.current);

    const themeObserver = new MutationObserver(() => {
      term.options.theme = buildTermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const isNew = !session.file_path;

    async function start() {
      setStatus("running");
      onStatusRef.current("running");

      if (isNew) {
        term.writeln(
          `\x1b[38;2;212;132;90m▸ Starting new session in ${session.cwd}\x1b[0m`
        );
      } else {
        term.writeln(
          `\x1b[38;2;212;132;90m▸ Resuming session in ${session.cwd}\x1b[0m`
        );
        term.writeln(
          `\x1b[38;2;102;102;102m  ${stripControl(session.first_message)}\x1b[0m`
        );
      }
      term.writeln("");

      const outputUnlisten = await listen<string>(
        `pty-output-${session.session_id}`,
        (event) => {
          if (mounted) {
            term.write(event.payload);
          }
        }
      );
      if (mounted) unlisteners.push(outputUnlisten);
      else {
        outputUnlisten();
        return;
      }

      const exitUnlisten = await listen<number>(
        `pty-exit-${session.session_id}`,
        (event) => {
          if (!mounted) return;
          setStatus("exited");
          onStatusRef.current("exited");
          term.writeln("");
          term.writeln(
            `\x1b[38;2;102;102;102m▸ Session ended (exit ${event.payload})\x1b[0m`
          );
        }
      );
      if (mounted) unlisteners.push(exitUnlisten);
      else {
        exitUnlisten();
        return;
      }

      const inputDisposable = term.onData((data) => {
        invoke("write_terminal", {
          sessionId: session.session_id,
          data,
        }).catch((err) => console.error("write_terminal failed:", err));
      });

      try {
        await invoke("spawn_terminal", {
          sessionId: session.session_id,
          claudeSessionId: isNew ? "" : session.session_id,
          cwd: session.cwd,
          cols: term.cols,
          rows: term.rows,
        });
      } catch (err) {
        if (!mounted) return;
        setStatus("exited");
        term.writeln(`\x1b[31mFailed to launch claude: ${err}\x1b[0m`);
        term.writeln(
          "\x1b[38;2;102;102;102mMake sure 'claude' is in your PATH.\x1b[0m"
        );
        inputDisposable.dispose();
      }
    }

    start();

    return () => {
      mounted = false;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      unlisteners.forEach((fn) => fn());
      invoke("kill_terminal", { sessionId: session.session_id }).catch(
        (err) => console.warn("kill_terminal cleanup failed:", err)
      );
      onStatusRef.current("exited");
      fitRef.current = null;
      term.dispose();
    };
  }, [session.session_id]);

  const displayName = label || session.cwd;

  return (
    <div style={{ ...styles.wrapper, display: visible ? "flex" : "none" }}>
      <div style={styles.toolbar}>
        <div style={styles.sessionInfo}>
          <span style={styles.dot(status)} />
          <span style={styles.toolbarLabel}>{displayName}</span>
          {label && <span style={styles.toolbarPath}>{session.cwd}</span>}
        </div>
        <div style={styles.sessionId}>{session.session_id.slice(0, 8)}</div>
      </div>
      <div ref={termRef} style={styles.terminal} />
    </div>
  );
}

const styles = {
  wrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  toolbar: {
    height: 36,
    minHeight: 36,
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  sessionInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  dot: (status: string): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
    background:
      status === "running"
        ? "var(--success)"
        : status === "exited"
        ? "var(--text-tertiary)"
        : "var(--warning)",
    boxShadow:
      status === "running" ? "0 0 6px rgba(74, 222, 128, 0.4)" : "none",
  }),
  toolbarLabel: {
    fontSize: 13,
    color: "var(--text-primary)",
    fontFamily: "'SF Mono', monospace",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  toolbarPath: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontFamily: "'SF Mono', monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  sessionId: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontFamily: "'SF Mono', monospace",
    flexShrink: 0,
  },
  terminal: {
    flex: 1,
    padding: "8px 0 0 8px",
    overflow: "hidden",
  },
};
