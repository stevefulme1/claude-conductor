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

export default function Terminal({ session, label, visible, onStatusChange }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;
  const [status, setStatus] = useState<"idle" | "running" | "exited">("idle");

  useEffect(() => {
    if (visible && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [visible]);

  useEffect(() => {
    if (!termRef.current) return;

    let mounted = true;
    const unlisteners: UnlistenFn[] = [];
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const term = new XTerm({
      theme: {
        background: "#0d0d0d",
        foreground: "#e8e8e8",
        cursor: "#d4845a",
        cursorAccent: "#0d0d0d",
        selectionBackground: "rgba(212, 132, 90, 0.3)",
        black: "#1e1e1e",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e8e8e8",
        brightBlack: "#666",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde68a",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#fff",
      },
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
