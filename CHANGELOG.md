# Changelog

All notable changes to Claude Conductor are documented in this file.

## [0.5.0] - 2026-05-17

### Added
- **Status Panel** — new dashboard (pulse icon in sidebar) showing active PTYs, open tabs, discovered sessions, process ID, and MCP server connection health with green/red indicators.
- **`get_status` command** — Tauri backend command returning session stats and system info for the status panel.

### Fixed
- **PTY unbounded memory** — paused terminal output buffer capped at 4MB with front-drain to prevent OOM on verbose sessions.
- **Stale data on tab switch** — buffered output now flushes immediately when a paused terminal becomes visible, instead of waiting for the next PTY read.
- **Delayed last characters** — added timer-based flush after every read iteration so partial output doesn't wait for the next byte.
- **Terminal error sanitization** — error messages passed through `stripControl()` before writing to xterm, preventing terminal escape injection.
- **Input handler leak** — `inputDisposable` from `term.onData()` now properly disposed on cleanup via promise chain.
- **Digest timer shutdown** — timer thread uses `AtomicBool` shutdown signal with 5s polling instead of infinite loop, enabling clean app exit.
- **Session cache lock contention** — filesystem scan split into 4 phases (scan → lock → parse → lock) to minimize time holding the global mutex.
- **SSO callback truncation** — OAuth callback buffer increased from 4KB to 16KB to handle large IdP responses.
- **Non-atomic config writes** — config files now written to temp file with 0600 permissions then atomically renamed, preventing credential exposure on crash.

### Security
- **Supply chain** — Fedora CI build tries `dnf install rustup` before falling back to curl pipe, with `--profile minimal` flag.
- **cargo-audit** — uses `--locked` flag for reproducible installs.

## [0.4.0] - 2026-05-12

### Added
- **PTY output batching** — reader thread coalesces output with 16ms interval and 32KB threshold, reducing IPC event flooding from hundreds/sec to ~60/sec.
- **Pause/resume for hidden terminals** — background tabs stop emitting IPC events. Output buffers while paused and flushes on tab switch.
- **`pause_terminal` / `resume_terminal` commands** — new Tauri commands for PTY pause/resume lifecycle.
- **Dark mode for terminal** — xterm.js theme updates live via MutationObserver on `data-theme` attribute changes. Extracted `buildTermTheme()` helper.
- **`useTheme` hook** — React hook managing dark/light/system theme preference with localStorage persistence and system media query listener.
- **Tab bar** — multi-session tab switching with keyboard shortcuts (Cmd+1-9, Cmd+[/]).
- **Session delete** — delete sessions from the tab bar context menu.
- **Close confirmation** — warns before closing with running sessions.

### Fixed
- **Stale closure** — `onStatusChange` callback uses ref pattern to prevent stale closure captures.
- **ANSI injection** — `first_message` stripped of control characters before display.
- **O(n^2) session cache** — `seen_keys` changed from Vec to HashSet for O(1) lookups.
- **Exited session retention** — exited sessions stay in tab bar to preserve scrollback history.

### Changed
- **CI** — skip codesign in GitHub Actions (local dev cert not available), add `contents: write` permission to release workflow.

## [0.3.0] - 2026-05-11

### Added
- **OAuth2 SSO Authentication** — HTTP MCP servers can now authenticate via OAuth2 Authorization Code flow with PKCE. Opens a browser to the identity provider, receives the callback on a local port, exchanges the auth code for a token, and saves it to the config automatically.
- **SSO Configuration UI** — New "SSO Login" button on HTTP MCP servers with fields for Authorization URL, Token URL, Client ID, and Scopes. Shows a waiting spinner with cancel support while the browser login completes.
- **MCP Server Creation** — Add new MCP servers (stdio or HTTP) directly from the Settings panel with support for command/URL, arguments, environment variables, and auth tokens.
- **Session Naming** — Rename sessions with a custom label via the pencil icon on hover. Labels are stored in `~/.claude/conductor-labels.json` and persist across restarts.
- **Label-Aware Search** — Session search now matches against custom labels in addition to project paths and first messages.

### Security
- **Cryptographic PKCE** — Code verifier generated with `getrandom` (OS entropy) instead of timestamp-seeded PRNG. Code challenge computed with `sha2` crate instead of shelling out to openssl, eliminating command injection risk.
- **OAuth State Validation** — Random per-flow `state` parameter generated and validated on callback to prevent CSRF attacks.
- **Token Response Sanitization** — Raw IdP responses no longer leak into UI error messages; generic error shown to user while details are logged server-side.
- **Popup Blocker Detection** — SSO flow detects when the browser blocks the authentication popup and shows an actionable error instead of spinning indefinitely.
- **URL Percent-Decoding** — Query string parser now properly decodes percent-encoded values from IdP callbacks.
- **Curl Error Propagation** — Token exchange uses `-sS` flag and checks exit status, surfacing DNS/TLS/connection errors instead of showing "invalid response".
- **Listener Failure Recovery** — SSO callback listener emits error events and cleans up state on all failure paths, preventing UI from hanging on spinner.

### Fixed
- **SSO Form State Bleed** — SSO configuration fields are now cleared when switching between servers, preventing values from one server leaking into another's form.
- **Config File Race Conditions** — All config writes protected by a mutex with 0600 file permissions.
- **MCP Health Check False Positives** — Stdio servers verified via actual MCP initialize handshake; HTTP servers checked with real requests through curl stdin.

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
