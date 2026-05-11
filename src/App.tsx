import { useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Sidebar from "./components/Sidebar";
import Terminal from "./components/Terminal";
import EmptyState from "./components/EmptyState";
import { SessionMeta } from "./types";

function startDrag(e: React.MouseEvent) {
  if (e.buttons === 1 && e.detail === 1) {
    getCurrentWindow().startDragging();
  }
}

export default function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [openedSessions, setOpenedSessions] = useState<SessionMeta[]>([]);

  const activeSession = openedSessions.find(s => s.session_id === activeSessionId) ?? null;

  const handleSessionSelect = useCallback((session: SessionMeta) => {
    setActiveSessionId(session.session_id);
    setOpenedSessions(prev => {
      if (prev.some(s => s.session_id === session.session_id)) return prev;
      return [...prev, session];
    });
  }, []);

  const handleSessionClosed = useCallback((sessionId: string) => {
    setOpenedSessions(prev => prev.filter(s => s.session_id !== sessionId));
    setActiveSessionId(prev => prev === sessionId ? null : prev);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar activeSession={activeSession} onSelect={handleSessionSelect} />
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
        {openedSessions.map(session => (
          <Terminal
            key={session.session_id}
            session={session}
            visible={session.session_id === activeSessionId}
            onClosed={() => handleSessionClosed(session.session_id)}
          />
        ))}
        {!activeSessionId && <EmptyState />}
      </main>
    </div>
  );
}
