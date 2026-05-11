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
}

export default function Terminal({ session }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "running" | "exited">("idle");

  useEffect(() => {
    if (!termRef.current) return;

    let mounted = true;
    const unlisteners: UnlistenFn[] = [];

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
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(termRef.current);
    fit.fit();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fit.fit();
        if (mounted) {
          invoke("resize_terminal", {
            sessionId: session.session_id,
            cols: term.cols,
            rows: term.rows,
          }).catch(() => {});
        }
      });
    });
    resizeObserver.observe(termRef.current);

    async function start() {
      setStatus("running");

      term.writeln(
        `\x1b[38;2;212;132;90m▸ Resuming session in ${session.cwd}\x1b[0m`
      );
      term.writeln(
        `\x1b[38;2;102;102;102m  ${session.first_message}\x1b[0m`
      );
      term.writeln("");

      const outputUnlisten = await listen<string>(
        `pty-output-${session.session_id}`,
        (event) => {
          if (mounted) term.write(event.payload);
        }
      );
      unlisteners.push(outputUnlisten);

      const exitUnlisten = await listen<number>(
        `pty-exit-${session.session_id}`,
        (event) => {
          if (!mounted) return;
          setStatus("exited");
          term.writeln("");
          term.writeln(
            `\x1b[38;2;102;102;102m▸ Session ended (exit ${event.payload})\x1b[0m`
          );
        }
      );
      unlisteners.push(exitUnlisten);

      const inputDisposable = term.onData((data) => {
        invoke("write_terminal", {
          sessionId: session.session_id,
          data,
        }).catch(() => {});
      });

      try {
        await invoke("spawn_terminal", {
          sessionId: session.session_id,
          claudeSessionId: session.session_id,
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
      resizeObserver.disconnect();
      unlisteners.forEach((fn) => fn());
      invoke("kill_terminal", { sessionId: session.session_id }).catch(
        () => {}
      );
      term.dispose();
    };
  }, [session.session_id]);

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <div style={styles.sessionInfo}>
          <span style={styles.dot(status)} />
          <span style={styles.label}>{session.cwd}</span>
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
    height: 40,
    minHeight: 40,
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    paddingTop: 28,
    paddingBottom: 0,
    boxSizing: "content-box" as const,
  },
  sessionInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dot: (status: string): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background:
      status === "running"
        ? "var(--success)"
        : status === "exited"
        ? "var(--text-tertiary)"
        : "var(--warning)",
    boxShadow:
      status === "running" ? "0 0 6px rgba(74, 222, 128, 0.4)" : "none",
  }),
  label: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontFamily: "'SF Mono', monospace",
  },
  sessionId: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontFamily: "'SF Mono', monospace",
  },
  terminal: {
    flex: 1,
    padding: "8px 0 0 8px",
    overflow: "hidden",
  },
};
