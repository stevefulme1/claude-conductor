# Claude Conductor

A desktop session manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Discover, search, and resume your CLI sessions from a native app with integrated terminal emulation.

## Features

- **Session discovery** — automatically finds sessions from `~/.claude/projects/`
- **Search and filter** — search by message content, project path, or working directory
- **Time-grouped sidebar** — sessions organized by Today, Yesterday, This Week, This Month, Older
- **Native terminal** — PTY-based terminal emulation via xterm.js with full color and input support
- **One-click resume** — select a session and pick up where you left off
- **Tab bar** — switch between multiple open sessions with keyboard shortcuts (Cmd+1-9, Cmd+[/])
- **Dark/light mode** — theme toggle with system preference detection, applies to terminal and UI
- **Status panel** — live view of active PTYs, open tabs, discovered sessions, and MCP server health
- **Session naming** — custom labels that persist across restarts
- **MCP server management** — add, configure, and monitor MCP servers with OAuth2 SSO support
- **Optimized PTY** — batched output (16ms coalescing), paused background terminals, 4MB buffer cap

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://www.rust-lang.org/tools/install) 1.77+
- [Tauri CLI v2](https://tauri.app/start/): `npm install -g @tauri-apps/cli`
- `claude` CLI in your PATH

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
┌──────────────────────────────────────────────────┐
│  React + xterm.js (src/)                         │
│  Sidebar, TabBar, Terminal, StatusPanel,          │
│  ConfigPanel, SessionCard, EmptyState             │
├──────────────────────────────────────────────────┤
│  Tauri IPC (commands + events)                   │
│  spawn/write/resize/kill/pause/resume terminal   │
│  get_status, verify_mcp, list_sessions           │
├──────────────────────────────────────────────────┤
│  Rust backend (src-tauri/src/)                   │
│  pty.rs — PTY lifecycle + output batching        │
│  sessions.rs — session discovery + caching       │
│  config.rs — MCP/settings with atomic writes     │
│  sso.rs — OAuth2 SSO authentication              │
│  lib.rs — command dispatch + status reporting    │
└──────────────────────────────────────────────────┘
```

**Rust backend** manages PTY sessions (spawn, write, resize, kill, pause, resume) with 16ms output batching, discovers Claude Code session files from `~/.claude/projects/`, and provides status reporting and MCP server health checks.

**React frontend** renders a searchable sidebar, tab bar for multi-session switching, xterm.js terminal with theme support, status panel with live metrics, and MCP configuration panel.

## Project structure

```
claude-conductor/
├── src/                    # React frontend
│   ├── components/
│   │   ├── ConfigPanel.tsx # MCP server settings
│   │   ├── EmptyState.tsx  # Placeholder when no session selected
│   │   ├── ErrorBoundary.tsx # Crash recovery
│   │   ├── SessionCard.tsx # Individual session in sidebar
│   │   ├── Sidebar.tsx     # Session list with search
│   │   ├── StatusPanel.tsx # Live status dashboard
│   │   ├── TabBar.tsx      # Multi-session tab switching
│   │   └── Terminal.tsx    # xterm.js terminal with theme support
│   ├── hooks/
│   │   └── useTheme.ts    # Dark/light/system theme management
│   ├── __tests__/          # Vitest component tests
│   ├── styles/global.css   # CSS custom properties (dark + light)
│   ├── types.ts            # TypeScript interfaces
│   ├── App.tsx             # Layout container
│   └── main.tsx            # Entry point
├── src-tauri/
│   └── src/
│       ├── config.rs       # MCP/settings with atomic writes
│       ├── digest.rs       # 30-day session digest generator
│       ├── lib.rs          # Tauri command handlers + status
│       ├── main.rs         # Entry point
│       ├── pty.rs          # PTY management with output batching
│       ├── sessions.rs     # Session discovery + mtime cache
│       ├── shell_env.rs    # Shell environment propagation
│       └── sso.rs          # OAuth2 SSO authentication
├── vitest.config.ts
├── vite.config.ts
└── package.json
```

## Testing

```sh
# Rust tests
cd src-tauri && cargo test

# Frontend tests
npm test

# Watch mode
npm run test:watch
```

## License

[MIT](LICENSE)
