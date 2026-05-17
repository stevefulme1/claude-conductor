import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import Terminal from "./components/Terminal";
import TabBar from "./components/TabBar";
import EmptyState from "./components/EmptyState";
import StatusPanel from "./components/StatusPanel";
import FileChanges from "./components/FileChanges";
import DiffViewer from "./components/DiffViewer";
import UsagePanel from "./components/UsagePanel";
import CheckpointPanel from "./components/CheckpointPanel";
import SplitPane, { splitPane, removePane, collectSessionIds } from "./components/SplitPane";
import KanbanBoard from "./components/KanbanBoard";
import AgentProfileEditor from "./components/AgentProfileEditor";
import BrowserPreview from "./components/BrowserPreview";
import CodeSearch from "./components/CodeSearch";
import GitGraph from "./components/GitGraph";
import ChainEditor from "./components/ChainEditor";
import TemplateSelector from "./components/TemplateSelector";
import McpMarketplace from "./components/McpMarketplace";
import SessionReplay from "./components/SessionReplay";
import CompliancePanel from "./components/CompliancePanel";
import BenchmarksPanel from "./components/BenchmarksPanel";
import PluginManager from "./components/PluginManager";
import VoiceInput from "./components/VoiceInput";
import SpatialCanvas from "./components/SpatialCanvas";
import CIMonitor from "./components/CIMonitor";
import { useTheme } from "./hooks/useTheme";
import { SessionMeta, SessionTemplate, AgentSuggestion, DEFAULT_AGENT_PRESETS, PaneNode } from "./types";

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
  const [showStatus, setShowStatus] = useState(false);
  const [showFileChanges, setShowFileChanges] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [sessionAgents, setSessionAgents] = useState<Record<string, string>>({});
  const [paneLayout, setPaneLayout] = useState<PaneNode | null>(null);
  const [sessionWorktrees, setSessionWorktrees] = useState<Record<string, string>>({});
  const [showKanban, setShowKanban] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showCodeSearch, setShowCodeSearch] = useState(false);
  const [showGitGraph, setShowGitGraph] = useState(false);
  const [showChains, setShowChains] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [replayFilePath, setReplayFilePath] = useState<string | null>(null);
  const [showCompliance, setShowCompliance] = useState(false);
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [complianceEnabled, setComplianceEnabled] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
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

  const handleNewSession = useCallback(async (initialAgent?: string) => {
    let agentCommand = initialAgent;
    const selected = await open({ directory: true, multiple: false, title: "Choose project directory" });
    if (typeof selected !== "string") return;
    const id = generateId();
    const dirName = selected.split("/").pop() || selected;

    // Smart Session Routing: suggest agent based on project type
    if (!agentCommand) {
      try {
        const suggestion = await invoke<AgentSuggestion>("suggest_agent", { cwd: selected });
        if (suggestion.detected_language !== "Unknown") {
          const accept = window.confirm(
            `Detected: ${suggestion.detected_language} project (${suggestion.detected_framework})\n\nRecommended: ${suggestion.agent_name}\n\nUse recommended agent?`
          );
          if (accept) {
            agentCommand = suggestion.agent_name;
          }
        }
      } catch {
        // Silently fall back to default
      }
    }

    // Determine the working directory (may be overridden by worktree)
    let cwd = selected;

    // If user wants a worktree, prompt for branch name
    const useWorktree = window.confirm("Create a git worktree for this session?");
    if (useWorktree) {
      const branchName = window.prompt("Branch name for worktree:", `session/${id.slice(0, 8)}`);
      if (branchName) {
        try {
          const worktreePath = await invoke<string>("create_worktree", {
            repoPath: selected,
            branchName,
          });
          cwd = worktreePath;
          setSessionWorktrees(prev => ({ ...prev, [id]: worktreePath }));
        } catch (err) {
          console.warn("Failed to create worktree:", err);
          // Fall back to original directory
        }
      }
    }

    const session: SessionMeta = {
      session_id: id,
      project_path: selected,
      project_display: dirName,
      last_modified: new Date().toISOString(),
      first_message: "New session",
      cwd,
      message_count: 0,
      file_path: "",
    };
    if (agentCommand) {
      setSessionAgents(prev => ({ ...prev, [id]: agentCommand }));
    }
    setOpenedSessions(prev => [...prev, session]);
    setActiveSessionId(id);

    // Compliance: log session start
    if (complianceEnabled) {
      invoke("log_compliance_event", {
        event: {
          timestamp: new Date().toISOString(),
          session_id: id,
          action: "session_start",
          details: `New session in ${selected}`,
          approved: true,
        },
      }).catch(() => {});
    }
  }, [complianceEnabled]);

  const closeSession = useCallback((sessionId: string) => {
    invoke("kill_terminal", { sessionId }).catch(() => {});

    // Handle worktree cleanup
    const worktreePath = sessionWorktrees[sessionId];
    if (worktreePath) {
      const keepWorktree = window.confirm(
        `Session has a worktree at:\n${worktreePath}\n\nKeep worktree? (Cancel to remove it)`
      );
      if (!keepWorktree) {
        invoke("remove_worktree", { worktreePath }).catch((err) =>
          console.warn("Failed to remove worktree:", err)
        );
      }
      setSessionWorktrees(prev => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    }

    // Remove from pane layout if present
    setPaneLayout(prev => {
      if (!prev) return null;
      return removePane(prev, sessionId);
    });

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
  }, [sessionWorktrees]);

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
      // P2: Auto-move to "running" in kanban
      invoke("set_session_status", { sessionId, status: "running" }).catch(() => {});
    } else {
      runningSessions.current.delete(sessionId);
      // P2: Auto-move to "done" in kanban
      invoke("set_session_status", { sessionId, status: "done" }).catch(() => {});
      // Desktop notification when a session completes and the app is not focused
      if (!document.hasFocus() && "Notification" in window && Notification.permission === "granted") {
        const session = openedRef.current.find(s => s.session_id === sessionId);
        const agent = sessionAgents[sessionId] || "claude";
        const dir = session?.cwd || "unknown directory";
        new Notification("Session Complete", {
          body: `${agent} finished in ${dir}`,
        });
      }
    }
  }, [sessionAgents]);

  const handleSplit = useCallback((direction: "horizontal" | "vertical") => {
    const currentId = activeRef.current;
    if (!currentId) return;
    const currentSession = openedRef.current.find(s => s.session_id === currentId);
    if (!currentSession) return;

    const newId = generateId();
    const newSession: SessionMeta = {
      session_id: newId,
      project_path: currentSession.project_path,
      project_display: currentSession.project_display,
      last_modified: new Date().toISOString(),
      first_message: "Split session",
      cwd: currentSession.cwd,
      message_count: 0,
      file_path: "",
    };

    // Copy agent setting from the source session
    const sourceAgent = sessionAgents[currentId];
    if (sourceAgent) {
      setSessionAgents(prev => ({ ...prev, [newId]: sourceAgent }));
    }

    setOpenedSessions(prev => [...prev, newSession]);

    setPaneLayout(prev => {
      const currentPane: PaneNode = prev || { type: "terminal", sessionId: currentId };
      return splitPane(currentPane, newId, direction);
    });
  }, [sessionAgents]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key === "v") {
        e.preventDefault();
        setShowVoice(prev => !prev);
        return;
      }
      if (meta && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        setShowCanvas(prev => !prev);
        return;
      }
      if (meta && e.shiftKey && e.key === "c") {
        e.preventDefault();
        setShowChains(prev => !prev);
        return;
      }
      if (meta && e.shiftKey && e.key === "t") {
        e.preventDefault();
        setShowTemplates(prev => !prev);
        return;
      }
      if (meta && e.shiftKey && e.key === "b") {
        e.preventDefault();
        setShowBrowser(prev => !prev);
        return;
      }
      if (meta && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setShowCodeSearch(prev => !prev);
        return;
      }
      if (meta && e.shiftKey && e.key === "g") {
        e.preventDefault();
        setShowGitGraph(prev => !prev);
        return;
      }
      if (meta && e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        handleSplit("horizontal");
        return;
      }
      if (meta && e.key === "d" && e.shiftKey) {
        e.preventDefault();
        handleSplit("vertical");
        return;
      }
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
  }, [handleNewSession, closeSession, handleSplit]);

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

  const handleTemplateSelect = useCallback((template: SessionTemplate) => {
    handleNewSession(template.agent);
  }, [handleNewSession]);

  // Feature 2: Desktop Notifications — request permission on launch
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
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
        onShowStatus={() => setShowStatus(true)}
        onToggleKanban={() => setShowKanban(prev => !prev)}
        showKanban={showKanban}
        onShowProfiles={() => setShowProfiles(true)}
        onShowChains={() => setShowChains(true)}
        onShowTemplates={() => setShowTemplates(true)}
        onShowMarketplace={() => setShowMarketplace(true)}
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
          sessionAgents={sessionAgents}
          sessionWorktrees={sessionWorktrees}
          onSelect={setActiveSessionId}
          onClose={closeSession}
          onReorder={handleReorder}
        />
        {/* Tier 3: Voice Input */}
        <VoiceInput
          sessionId={activeSessionId}
          visible={showVoice}
          onToggle={() => {}}
        />
        {showCanvas ? (
          <SpatialCanvas
            sessions={openedSessions}
            labels={labels}
            sessionAgents={sessionAgents}
            onSelect={(session) => {
              handleSessionSelect(session);
              setShowCanvas(false);
            }}
            onClose={() => setShowCanvas(false)}
          />
        ) : showKanban ? (
          <KanbanBoard
            sessions={openedSessions}
            labels={labels}
            sessionAgents={sessionAgents}
            onSelect={(session) => {
              handleSessionSelect(session);
              setShowKanban(false);
            }}
          />
        ) : paneLayout ? (
          <SplitPane
            node={paneLayout}
            renderTerminal={(sessionId) => {
              const session = openedSessions.find(s => s.session_id === sessionId);
              if (!session) return null;
              return (
                <Terminal
                  key={session.session_id}
                  session={session}
                  label={labels[session.session_id] || ""}
                  visible={true}
                  command={sessionAgents[session.session_id] || ""}
                  onStatusChange={(status) => handleStatusChange(session.session_id, status)}
                />
              );
            }}
            onClosePane={closeSession}
          />
        ) : (
          openedSessions.map(session => (
            <Terminal
              key={session.session_id}
              session={session}
              label={labels[session.session_id] || ""}
              visible={session.session_id === activeSessionId}
              command={sessionAgents[session.session_id] || ""}
              onStatusChange={(status) => handleStatusChange(session.session_id, status)}
            />
          ))
        )}
        {activeSession && (
          <div style={{ flexShrink: 0, position: "relative" }}>
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "2px 8px",
              gap: 4,
              background: "var(--bg-secondary)",
              borderTop: "1px solid var(--border-subtle)",
            }}>
              <button
                onClick={() => setShowFileChanges(prev => !prev)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  color: showFileChanges ? "var(--accent)" : "var(--text-tertiary)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
              >
                {showFileChanges ? "Hide Changes" : "Changes"}
              </button>
              <button
                onClick={() => setShowCheckpoints(prev => !prev)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  color: showCheckpoints ? "var(--accent)" : "var(--text-tertiary)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
              >
                {showCheckpoints ? "Hide Checkpoints" : "Checkpoints"}
              </button>
              {activeSession.file_path && (
                <>
                  <button
                    onClick={() => setShowUsage(prev => !prev)}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: "var(--radius-sm)",
                      color: showUsage ? "var(--accent)" : "var(--text-tertiary)",
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                    }}
                  >
                    {showUsage ? "Hide Usage" : "Usage"}
                  </button>
                  <button
                    onClick={() => setReplayFilePath(activeSession.file_path)}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-tertiary)",
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                    }}
                    title="Replay this session"
                  >
                    Replay
                  </button>
                </>
              )}
              <button
                onClick={() => setShowGitGraph(prev => !prev)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  color: showGitGraph ? "var(--accent)" : "var(--text-tertiary)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
                title="Git Graph (Cmd+Shift+G)"
              >
                Git
              </button>
              <button
                onClick={() => setShowCodeSearch(prev => !prev)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  color: showCodeSearch ? "var(--accent)" : "var(--text-tertiary)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
                title="Code Search (Cmd+Shift+F)"
              >
                Search
              </button>
              <button
                onClick={() => setShowBenchmarks(true)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
                title="Performance Benchmarks"
              >
                Benchmarks
              </button>
              <button
                onClick={() => setShowVoice(prev => !prev)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  color: showVoice ? "#ff3b30" : "var(--text-tertiary)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
                title="Voice Input (Cmd+Shift+V)"
              >
                Voice
              </button>
              <button
                onClick={() => setShowCanvas(prev => !prev)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  color: showCanvas ? "var(--accent)" : "var(--text-tertiary)",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
                title="Spatial Canvas (Cmd+Shift+Space)"
              >
                Canvas
              </button>
              <CIMonitor cwd={activeSession.cwd} />
              {complianceEnabled && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(74, 158, 255, 0.15)",
                    color: "#4a9eff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  onClick={() => setShowCompliance(true)}
                  title="Compliance Mode active - click to view audit log"
                >
                  Compliance Mode
                </span>
              )}
            </div>
            <FileChanges
              cwd={activeSession.cwd}
              visible={showFileChanges}
              onFileClick={(filePath) => setDiffFile(filePath)}
            />
            <CheckpointPanel cwd={activeSession.cwd} visible={showCheckpoints} />
            {activeSession.file_path && (
              <UsagePanel filePath={activeSession.file_path} visible={showUsage} />
            )}
            {diffFile && (
              <DiffViewer
                cwd={activeSession.cwd}
                filePath={diffFile}
                onClose={() => setDiffFile(null)}
              />
            )}
          </div>
        )}
        {!activeSessionId && openedSessions.length === 0 && <EmptyState />}
      </main>
      <StatusPanel
        visible={showStatus}
        onClose={() => setShowStatus(false)}
        openSessionCount={openedSessions.length}
      />
      <AgentProfileEditor
        visible={showProfiles}
        onClose={() => setShowProfiles(false)}
      />
      {activeSession && (
        <>
          <CodeSearch
            cwd={activeSession.cwd}
            visible={showCodeSearch}
            onClose={() => setShowCodeSearch(false)}
          />
          <GitGraph
            cwd={activeSession.cwd}
            visible={showGitGraph}
            onClose={() => setShowGitGraph(false)}
          />
        </>
      )}
      {showBrowser && (
        <div style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          width: "50%",
          height: "50%",
          zIndex: 900,
          boxShadow: "-2px -2px 12px rgba(0,0,0,0.3)",
        }}>
          <BrowserPreview
            visible={showBrowser}
            onClose={() => setShowBrowser(false)}
          />
        </div>
      )}
      <ChainEditor
        visible={showChains}
        onClose={() => setShowChains(false)}
        onLaunchStep={(agent, _prompt) => handleNewSession(agent)}
      />
      <TemplateSelector
        visible={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={handleTemplateSelect}
      />
      <McpMarketplace
        visible={showMarketplace}
        onClose={() => setShowMarketplace(false)}
      />
      {replayFilePath && (
        <SessionReplay
          filePath={replayFilePath}
          visible={true}
          onClose={() => setReplayFilePath(null)}
        />
      )}
      <CompliancePanel
        visible={showCompliance}
        onClose={() => setShowCompliance(false)}
      />
      <BenchmarksPanel
        visible={showBenchmarks}
        onClose={() => setShowBenchmarks(false)}
      />
      <PluginManager
        visible={showPlugins}
        onClose={() => setShowPlugins(false)}
      />
    </div>
  );
}
