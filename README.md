# Claude Conductor

A desktop session manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and other AI coding agents. Discover, search, resume, and orchestrate CLI sessions from a native app with integrated terminal emulation, git worktree isolation, split panes, cost tracking, and 20+ productivity features.

## Features

### Session Management
- **Session discovery** — automatically finds sessions from `~/.claude/projects/`
- **Search and filter** — full-text search by message content, project path, or working directory
- **Time-grouped sidebar** — organized by Today, Yesterday, This Week, This Month, Older
- **Session labels** — custom names that persist across restarts
- **Session templates** — pre-configured profiles for Code Review, Implement Feature, Research (Cmd+Shift+T)
- **Session chaining** — multi-step agent pipelines: Research → Code → Test (Cmd+Shift+C)
- **Session replay** — playback completed sessions step-by-step with speed controls
- **Session export** — export as Markdown or self-contained HTML for sharing

### Terminal
- **Multi-tab** — switch between sessions with keyboard shortcuts (Cmd+1-9, Cmd+[/])
- **Split panes** — vertical (Cmd+D) and horizontal (Cmd+Shift+D) splits with drag-to-resize
- **Multi-agent** — switch between Claude, Codex, Gemini CLI, Aider, or custom agents
- **Voice input** — dictate to terminal via Web Speech API (Cmd+Shift+V)
- **Pause/resume** — pause terminal output buffering without killing the process (4MB buffer cap)
- **Optimized PTY** — batched output (16ms coalescing), UTF-8 boundary detection

### Git Integration
- **Git worktrees** — isolate sessions in separate worktrees (sibling directory pattern)
- **File change tracking** — see what files changed per session with auto-refresh
- **Inline diff viewer** — click any changed file to see the unified diff
- **Checkpoints** — create and restore named checkpoints via git tags
- **Git graph** — visualize git log with ASCII graph (Cmd+Shift+G)

### Analytics & Monitoring
- **Usage analytics** — token counts and estimated cost per session
- **Daily cost calculator** — aggregate cost across all sessions with per-model breakdown
- **Performance benchmarks** — average duration, tokens, cost, sessions/day, success rate
- **CI monitor** — GitHub Actions status in status bar with logs and re-run
- **Desktop notifications** — alerts when sessions complete (when app is unfocused)

### Agent Management
- **Agent presets** — built-in for Claude, Codex, Gemini, Aider
- **Custom profiles** — save your own agent configurations
- **Smart routing** — auto-detect project type and suggest the best agent
- **MCP dashboard** — manage MCP servers with real-time health checks
- **MCP marketplace** — browse and one-click install from 12 popular servers
- **SSO/OAuth** — PKCE-based authentication for MCP servers

### Collaboration & Governance
- **Compliance mode** — audit log of all agent actions with exportable reports
- **Kanban board** — track session status (Planning → Running → Review → Done)

### Advanced
- **Spatial canvas** — 2D infinite canvas layout for sessions (Cmd+Shift+Space)
- **Browser preview** — embedded iframe with dev server auto-detection (Cmd+Shift+B)
- **Code search** — search code with symbol detection (Cmd+Shift+F)
- **Plugin system** — extensible plugin architecture with manifest discovery
- **Help menu** — searchable feature guide, keyboard shortcuts, update checker (Cmd+?)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+N | New session |
| Cmd+W | Close tab |
| Cmd+[ / ] | Previous / Next tab |
| Cmd+1-9 | Jump to tab |
| Cmd+D | Split vertical |
| Cmd+Shift+D | Split horizontal |
| Cmd+Shift+F | Code search |
| Cmd+Shift+G | Git graph |
| Cmd+Shift+V | Voice input |
| Cmd+Shift+B | Browser preview |
| Cmd+Shift+C | Session chains |
| Cmd+Shift+T | Session templates |
| Cmd+Shift+Space | Spatial canvas |
| Cmd+? | Help menu |

## Install

### macOS
Download the `.dmg` from [Releases](https://github.com/stevefulme1/claude-conductor/releases) or build from source.

### Linux
Download the `.deb` or `.rpm` from [Releases](https://github.com/stevefulme1/claude-conductor/releases).

### Windows
Download the `.exe` installer from [Releases](https://github.com/stevefulme1/claude-conductor/releases).

## Prerequisites (Development)

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://www.rust-lang.org/tools/install) 1.77+
- [Tauri CLI v2](https://tauri.app/start/): `npm install -g @tauri-apps/cli`
- `claude` CLI in your PATH (for Claude sessions)

### Linux additional dependencies

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev
```

## Quick start

```sh
npm ci
npm run tauri dev
```

## Build

```sh
npm run tauri build
```

Production binaries are output to `src-tauri/target/release/bundle/`.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  React 19 + xterm.js 6 (src/)                         │
│  28 components: Sidebar, Terminal, SplitPane,          │
│  FileChanges, DiffViewer, KanbanBoard, HelpMenu, ...   │
├────────────────────────────────────────────────────────┤
│  Tauri 2.11 IPC (commands + events)                    │
│  40+ commands for PTY, git, analytics, config, CI      │
├────────────────────────────────────────────────────────┤
│  Rust backend (src-tauri/src/)                         │
│  14 modules: pty, sessions, config, worktree,          │
│  file_tracker, analytics, checkpoints, code_search,    │
│  git_graph, sharing, chaining, marketplace,            │
│  compliance, ci_monitor, routing, plugins, updater     │
└────────────────────────────────────────────────────────┘
```

## Testing

```sh
# Rust checks
cd src-tauri && cargo check

# TypeScript checks
npx tsc --noEmit

# Frontend tests
npm test
```

## License

[CC BY-NC 4.0](LICENSE) — free for personal and educational use. Commercial use requires permission from the author.
