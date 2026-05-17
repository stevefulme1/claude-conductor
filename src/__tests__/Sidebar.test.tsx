import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "../components/Sidebar";
import { SessionMeta } from "../types";

const mockSessions: SessionMeta[] = [
  {
    session_id: "sess-1",
    project_path: "-Users-steve-proj",
    project_display: "Users/steve/proj",
    last_modified: new Date().toISOString(),
    first_message: "First session message",
    cwd: "/Users/steve/proj",
    message_count: 5,
    file_path: "/tmp/sess1.jsonl",
  },
  {
    session_id: "sess-2",
    project_path: "-Users-steve-other",
    project_display: "Users/steve/other",
    last_modified: new Date(Date.now() - 86400000 * 3).toISOString(),
    first_message: "Older session message",
    cwd: "/Users/steve/other",
    message_count: 3,
    file_path: "/tmp/sess2.jsonl",
  },
];

describe("Sidebar", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_sessions_fast") return Promise.resolve(mockSessions);
      if (cmd === "list_sessions") return Promise.resolve(mockSessions);
      if (cmd === "get_session_labels") return Promise.resolve({});
      if (cmd === "get_session_statuses") return Promise.resolve({});
      if (cmd === "get_config") return Promise.resolve({ model: "test", mcp_servers: [], plugins: [], config_paths: [] });
      if (cmd === "verify_mcp") return Promise.resolve({});
      return Promise.resolve(null);
    });
  });

  it("renders the title", () => {
    const { container } = render(<Sidebar activeSession={null} openSessionIds={new Set()} onSelect={() => {}} onNewSession={() => {}} theme="system" onThemeChange={() => {}} />);
    expect(container.textContent).toContain("Conductor");
  });

  it("loads and displays sessions", async () => {
    const { container } = render(<Sidebar activeSession={null} openSessionIds={new Set()} onSelect={() => {}} onNewSession={() => {}} theme="system" onThemeChange={() => {}} />);
    await waitFor(() => {
      expect(container.textContent).toContain("First session message");
    });
  });

  it("shows session count after loading", async () => {
    const { container } = render(<Sidebar activeSession={null} openSessionIds={new Set()} onSelect={() => {}} onNewSession={() => {}} theme="system" onThemeChange={() => {}} />);
    await waitFor(() => {
      expect(container.textContent).toContain("2 sessions");
    });
  });

  it("groups sessions by time period", async () => {
    const { container } = render(<Sidebar activeSession={null} openSessionIds={new Set()} onSelect={() => {}} onNewSession={() => {}} theme="system" onThemeChange={() => {}} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Today");
      expect(container.textContent).toContain("This Week");
    });
  });

  it("shows search input", () => {
    const { container } = render(<Sidebar activeSession={null} openSessionIds={new Set()} onSelect={() => {}} onNewSession={() => {}} theme="system" onThemeChange={() => {}} />);
    const input = container.querySelector('input[placeholder="Search sessions..."]');
    expect(input).toBeTruthy();
  });
});
