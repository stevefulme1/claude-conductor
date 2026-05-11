# Changelog

All notable changes to Claude Conductor are documented in this file.

## [0.2.0] - 2026-05-11

### Added
- **Shell Environment Propagation** — Captures the user's full login shell environment (`$SHELL -l -c env`) and passes it to all spawned Claude processes. MCP servers, plugins, and tools available in the user's shell are now consistently available across all Conductor sessions.
- **Settings Panel** — New settings popup (gear icon in sidebar footer) showing MCP server health with green/red status dots, enabled plugins, active model, and config file paths.
- **MCP Server Verification** — Backend checks whether stdio MCP commands are on PATH and HTTP MCP URLs are configured, surfacing status in the Settings panel.
- **Config Reader** — Reads `~/.claude.json` (MCP servers) and `~/.claude/settings.json` (plugins, model) to display environment configuration.

### Fixed
- **MCP Servers Unavailable in Some Sessions** — Sessions spawned from Conductor now inherit the full shell environment, resolving issues where MCP servers and tools worked in the parent shell but not in Conductor-launched sessions.

## [0.1.0] - 2026-05-11

### Added
- **Session Discovery** — Auto-discovers all Claude Code CLI sessions from `~/.claude/projects/` across all projects.
- **Searchable Sidebar** — Sessions displayed in a collapsible sidebar, grouped by recency (Today, Yesterday, This Week, This Month, Older). Full-text search across session content, project names, and working directories.
- **Session Resume** — Click any session to resume it in an embedded xterm.js terminal via `claude --resume <session-id>`.
- **Native PTY Backend** — Uses `portable-pty` in Rust for real TTY emulation. Claude Code sees a proper terminal environment with correct `TERM`, `LANG`, and `LC_ALL` settings.
- **30-Day Session Context Digest** — Generates `~/.claude/conductor-context.md` with summaries of all sessions from the last 30 days. Auto-refreshes every 5 minutes. Enables cross-session awareness when referenced from project `CLAUDE.md` files.
- **macOS Installer** — `.dmg` bundle (~4.5 MB) with drag-to-Applications install. Minimum macOS 10.15 Catalina.
- **Fedora/RPM Build** — GitHub Actions workflow for automated RPM builds on Fedora 41. Local build script at `scripts/build-fedora.sh`.
- **Dark Theme UI** — Modern dark interface with warm accent colors, SF Mono / JetBrains Mono font stack, smooth transitions, and custom scrollbars.
- **Error Boundary** — React error boundary prevents full app crashes from component-level failures.
- **Session Card Metadata** — Each session card shows working directory, time ago, first user message preview, and message count.

### Security
- **Path Traversal Protection** — `delete_session` validates that file paths are canonicalized children of `~/.claude/projects/` and end with `.jsonl` before deletion.
- **Restricted Shell Arguments** — Shell spawn scoped to `claude --resume <uuid>` pattern only via Tauri capability config. Arbitrary arguments cannot be passed.
- **Content Security Policy** — CSP enabled: `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`.
- **Child Process Lifecycle** — PTY child processes are killed on component unmount with a 5-second join timeout on the reader thread. Race condition between async spawn and cleanup handled via mounted guard.
- **Input Validation** — Terminal size validated (cols 1–500, rows 1–200). Working directory existence checked before spawn.

### Fixed
- **UTF-8 Rendering** — PTY reader detects incomplete multi-byte UTF-8 sequences at buffer boundaries and carries them to the next read instead of emitting replacement characters.
- **Terminal Overwrite Artifacts** — Resize events debounced to 100ms and only sent to PTY when dimensions actually change, preventing rapid redraw cycles that caused lines through text and overwritten characters.
- **Pipe vs PTY** — Replaced Tauri shell plugin (stdin/stdout pipes) with native PTY via `portable-pty`. Fixes "no stdin data received" and "no deferred tool marker" errors from Claude Code CLI expecting an interactive terminal.
- **Session File Parsing** — Handles both string and array content formats in session JSONL files. Consecutive parse failures capped at 10 before stopping to avoid hanging on corrupt files.
- **Symlink Safety** — Symlinked project directories and session files are skipped during discovery.
- **Logging in Release Builds** — Log plugin initialized at `Warn` level in release builds (was debug-only).
