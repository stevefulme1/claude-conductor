import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import EmptyState from "../components/EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    const { container } = render(<EmptyState />);
    expect(container.textContent).toContain("Claude Conductor");
  });

  it("renders command hints", () => {
    const { container } = render(<EmptyState />);
    expect(container.textContent).toContain("claude --resume");
    expect(container.textContent).toContain("claude --continue");
    expect(container.textContent).toContain("Start a new session");
  });

  it("renders instruction text", () => {
    const { container } = render(<EmptyState />);
    expect(container.textContent).toContain("Select a session from the sidebar");
  });
});
