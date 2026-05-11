# Claude Conductor

A desktop session manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Discover, search, and resume your CLI sessions from a native app with integrated terminal emulation.

## Features

- **Session discovery** — automatically finds sessions from `~/.claude/projects/`
- **Search and filter** — search by message content, project path, or working directory
- **Time-grouped sidebar** — sessions organized by Today, Yesterday, This Week, This Month, Older
- **Native terminal** — PTY-based terminal emulation via xterm.js with full color and input support
- **One-click resume** — select a session and pick up where you left off

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
┌─────────────────────────────────────────────┐
│  React + xterm.js (src/)                    │
│  Sidebar, SessionCard, Terminal, EmptyState  │
├─────────────────────────────────────────────┤
│  Tauri IPC (commands + events)              │
├─────────────────────────────────────────────┤
│  Rust backend (src-tauri/src/)              │
│  pty.rs — PTY lifecycle management          │
│  sessions.rs — session file discovery       │
│  lib.rs — command dispatch + validation     │
└─────────────────────────────────────────────┘
```

**Rust backend** manages PTY sessions (spawn, write, resize, kill) and discovers Claude Code session files by parsing JSONL from `~/.claude/projects/`.

**React frontend** renders a searchable sidebar of sessions and an xterm.js terminal that connects to the Rust PTY via Tauri events.

## Project structure

```
claude-conductor/
├── src/                    # React frontend
│   ├── components/
│   │   ├── EmptyState.tsx  # Placeholder when no session selected
│   │   ├── ErrorBoundary.tsx # Crash recovery
│   │   ├── SessionCard.tsx # Individual session in sidebar
│   │   ├── Sidebar.tsx     # Session list with search
│   │   └── Terminal.tsx    # xterm.js terminal emulation
│   ├── __tests__/          # Vitest component tests
│   ├── styles/global.css   # CSS custom properties
│   ├── types.ts            # TypeScript interfaces
│   ├── App.tsx             # Layout container
│   └── main.tsx            # Entry point
├── src-tauri/
│   └── src/
│       ├── pty.rs          # Native PTY management
│       ├── sessions.rs     # Session discovery + parsing
│       ├── lib.rs          # Tauri command handlers
│       └── main.rs         # Entry point
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
