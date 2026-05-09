import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Command, type Child } from "@tauri-apps/plugin-shell";
import "@xterm/xterm/css/xterm.css";
import { SessionMeta } from "../types";

interface Props {
  session: SessionMeta;
}

export default function Terminal({ session }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<Child | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<"idle" | "running" | "exited">("idle");

  useEffect(() => {
    mountedRef.current = true;
    if (!termRef.current) return;

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
      requestAnimationFrame(() => fit.fit());
    });
    resizeObserver.observe(termRef.current);

    launchClaude(term, session);

    return () => {
      mountedRef.current = false;
      resizeObserver.disconnect();
      if (childRef.current) {
        childRef.current.kill().catch(() => {});
        childRef.current = null;
      }
      term.dispose();
    };
  }, [session.session_id]);

  async function launchClaude(term: XTerm, sess: SessionMeta) {
    setStatus("running");

    term.writeln(
      `\x1b[38;2;212;132;90m▸ Resuming session in ${sess.cwd}\x1b[0m`
    );
    term.writeln(
      `\x1b[38;2;102;102;102m  ${sess.first_message}\x1b[0m`
    );
    term.writeln("");

    try {
      const cmd = Command.create("claude", ["--resume", sess.session_id], {
        cwd: sess.cwd,
        env: { TERM: "xterm-256color" },
      });

      cmd.on("close", (data) => {
        if (!mountedRef.current) return;
        setStatus("exited");
        term.writeln("");
        term.writeln(
          `\x1b[38;2;102;102;102m▸ Session ended (exit ${data.code})\x1b[0m`
        );
      });

      cmd.on("error", (err) => {
        if (!mountedRef.current) return;
        setStatus("exited");
        term.writeln(`\x1b[31mError: ${err}\x1b[0m`);
      });

      cmd.stdout.on("data", (data) => {
        if (!mountedRef.current) return;
        term.write(data);
      });

      cmd.stderr.on("data", (data) => {
        if (!mountedRef.current) return;
        term.write(data);
      });

      const child = await cmd.spawn();

      if (!mountedRef.current) {
        child.kill().catch(() => {});
        return;
      }

      childRef.current = child;

      const inputDisposable = term.onData((data) => {
        child.write(data).catch(() => {});
      });

      const originalCleanup = term.dispose.bind(term);
      term.dispose = () => {
        inputDisposable.dispose();
        originalCleanup();
      };
    } catch (err) {
      if (!mountedRef.current) return;
      setStatus("exited");
      term.writeln(`\x1b[31mFailed to launch claude: ${err}\x1b[0m`);
      term.writeln(
        "\x1b[38;2;102;102;102mMake sure 'claude' is in your PATH.\x1b[0m"
      );
    }
  }

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
