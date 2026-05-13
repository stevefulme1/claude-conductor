import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SessionCard from "../components/SessionCard";
import { SessionMeta } from "../types";

const mockSession: SessionMeta = {
  session_id: "abc-123-def",
  project_path: "-Users-steve-project",
  project_display: "Users/steve/project",
  last_modified: new Date().toISOString(),
  first_message: "Fix the login bug",
  cwd: "/Users/steve/project",
  message_count: 12,
  file_path: "/home/steve/.claude/projects/test/abc.jsonl",
};

describe("SessionCard", () => {
  it("renders session first message", () => {
    const { container } = render(
      <SessionCard session={mockSession} isActive={false} isOpen={false} timeAgo="2h ago" label="" onRename={() => {}} onDelete={() => {}} onClick={() => {}} />
    );
    expect(container.textContent).toContain("Fix the login bug");
  });

  it("renders message count", () => {
    const { container } = render(
      <SessionCard session={mockSession} isActive={false} isOpen={false} timeAgo="2h ago" label="" onRename={() => {}} onDelete={() => {}} onClick={() => {}} />
    );
    expect(container.textContent).toContain("12");
  });

  it("renders time ago", () => {
    const { container } = render(
      <SessionCard session={mockSession} isActive={false} isOpen={false} timeAgo="5m ago" label="" onRename={() => {}} onDelete={() => {}} onClick={() => {}} />
    );
    expect(container.textContent).toContain("5m ago");
  });

  it("shortens macOS paths with tilde", () => {
    const { container } = render(
      <SessionCard session={mockSession} isActive={false} isOpen={false} timeAgo="1h ago" label="" onRename={() => {}} onDelete={() => {}} onClick={() => {}} />
    );
    expect(container.textContent).toContain("~/project");
  });

  it("shortens Linux paths with tilde", () => {
    const linuxSession = { ...mockSession, cwd: "/home/steve/project" };
    const { container } = render(
      <SessionCard session={linuxSession} isActive={false} isOpen={false} timeAgo="1h ago" label="" onRename={() => {}} onDelete={() => {}} onClick={() => {}} />
    );
    expect(container.textContent).toContain("~/project");
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    const { container } = render(
      <SessionCard session={mockSession} isActive={false} isOpen={false} timeAgo="1h ago" label="" onRename={() => {}} onDelete={() => {}} onClick={onClick} />
    );
    const button = container.querySelector("button")!;
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});
