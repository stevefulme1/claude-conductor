import { useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import Terminal from "./components/Terminal";
import EmptyState from "./components/EmptyState";
import { SessionMeta } from "./types";

export default function App() {
  const [activeSession, setActiveSession] = useState<SessionMeta | null>(null);

  const handleSessionSelect = useCallback((session: SessionMeta) => {
    setActiveSession(session);
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
        {activeSession ? (
          <Terminal key={activeSession.session_id} session={activeSession} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
