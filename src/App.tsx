import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import Terminal from "./components/Terminal";
import TabBar from "./components/TabBar";
import EmptyState from "./components/EmptyState";
import { useTheme } from "./hooks/useTheme";
import { SessionMeta } from "./types";

function startDrag(e: React.MouseEvent) {
  if (e.buttons === 1 && e.detail === 1) {
    getCurrentWindow().startDragging();
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [openedSessions, setOpenedSessions] = useState<SessionMeta[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const runningSessions = useRef(new Set<string>());
  const openedRef = useRef(openedSessions);
  const activeRef = useRef(activeSessionId);
  openedRef.current = openedSessions;
  activeRef.current = activeSessionId;

  const activeSession = openedSessions.find(s => s.session_id === activeSessionId) ?? null;
  const openSessionIds = useMemo(() => new Set(openedSessions.map(s => s.session_id)), [openedSessions]);

  useEffect(() => {
    invoke<Record<string, string>>("get_session_labels")
      .then(setLabels)
      .catch(() => {});
  }, []);

  const handleSessionSelect = useCallback((session: SessionMeta) => {
    setActiveSessionId(session.session_id);
    setOpenedSessions(prev => {
      if (prev.some(s => s.session_id === session.session_id)) return prev;
      return [...prev, session];
    });
  }, []);

  const handleNewSession = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false, title: "Choose project directory" });
    if (typeof selected !== "string") return;
    const id = generateId();
    const dirName = selected.split("/").pop() || selected;
    const session: SessionMeta = {
      session_id: id,
      project_path: selected,
      project_display: dirName,
      last_modified: new Date().toISOString(),
      first_message: "New session",
      cwd: selected,
      message_count: 0,
      file_path: "",
    };
    setOpenedSessions(prev => [...prev, session]);
    setActiveSessionId(id);
  }, []);

  const closeSession = useCallback((sessionId: string) => {
    invoke("kill_terminal", { sessionId }).catch(() => {});
    setOpenedSessions(prev => {
      const next = prev.filter(s => s.session_id !== sessionId);
      setActiveSessionId(curr => {
        if (curr !== sessionId) return curr;
        const idx = prev.findIndex(s => s.session_id === sessionId);
        if (next.length === 0) return null;
        return next[Math.min(idx, next.length - 1)].session_id;
      });
      return next;
    });
  }, []);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setOpenedSessions(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleStatusChange = useCallback((sessionId: string, status: "running" | "exited") => {
    if (status === "running") {
      runningSessions.current.add(sessionId);
    } else {
      runningSessions.current.delete(sessionId);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "n") {
        e.preventDefault();
        handleNewSession();
      } else if (meta && e.key === "w") {
        e.preventDefault();
        if (activeRef.current) closeSession(activeRef.current);
      } else if (meta && e.key === "[") {
        e.preventDefault();
        switchTab(-1);
      } else if (meta && e.key === "]") {
        e.preventDefault();
        switchTab(1);
      } else if (meta && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        const sessions = openedRef.current;
        if (idx < sessions.length) {
          setActiveSessionId(sessions[idx].session_id);
        }
      }
    }

    function switchTab(dir: number) {
      const sessions = openedRef.current;
      const current = activeRef.current;
      if (sessions.length === 0) return;
      const idx = sessions.findIndex(s => s.session_id === current);
      const next = (idx + dir + sessions.length) % sessions.length;
      setActiveSessionId(sessions[next].session_id);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewSession, closeSession]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onCloseRequested(async (e) => {
      const running = runningSessions.current.size;
      if (running > 0) {
        const confirmed = window.confirm(
          `You have ${running} running session(s). Close anyway?`
        );
        if (!confirmed) {
          e.preventDefault();
          return;
        }
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        activeSession={activeSession}
        openSessionIds={openSessionIds}
        onSelect={handleSessionSelect}
        onNewSession={handleNewSession}
        theme={theme}
        onThemeChange={setTheme}
      />
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-primary)",
          overflow: "hidden",
        }}
      >
        <div onMouseDown={startDrag} style={{ height: 52, flexShrink: 0, cursor: "default" }} />
        <TabBar
          sessions={openedSessions}
          activeSessionId={activeSessionId}
          labels={labels}
          onSelect={setActiveSessionId}
          onClose={closeSession}
          onReorder={handleReorder}
        />
        {openedSessions.map(session => (
          <Terminal
            key={session.session_id}
            session={session}
            label={labels[session.session_id] || ""}
            visible={session.session_id === activeSessionId}
            onStatusChange={(status) => handleStatusChange(session.session_id, status)}
          />
        ))}
        {!activeSessionId && openedSessions.length === 0 && <EmptyState />}
      </main>
    </div>
  );
}
