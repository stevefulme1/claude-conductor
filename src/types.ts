export interface SessionMeta {
  session_id: string;
  project_path: string;
  project_display: string;
  last_modified: string;
  first_message: string;
  cwd: string;
  message_count: number;
  file_path: string;
}

export function isSessionMeta(obj: unknown): obj is SessionMeta {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.session_id === "string" &&
    typeof o.project_path === "string" &&
    typeof o.project_display === "string" &&
    typeof o.last_modified === "string" &&
    typeof o.first_message === "string" &&
    typeof o.cwd === "string" &&
    typeof o.message_count === "number" &&
    typeof o.file_path === "string"
  );
}

export interface McpServer {
  name: string;
  server_type: "stdio" | "http";
  command_or_url: string;
  args: string[];
  has_env: boolean;
  has_auth: boolean;
  env_keys: string[];
}

export interface McpStatus {
  reachable: boolean;
  logs: string[];
}

export interface ClaudeConfig {
  mcp_servers: McpServer[];
  plugins: string[];
  model: string;
  config_paths: string[];
}

export interface AgentPreset {
  name: string;
  command: string;
  args: string[];
  icon?: string;
}

export const DEFAULT_AGENT_PRESETS: AgentPreset[] = [
  { name: "Claude", command: "claude", args: [], icon: "C" },
  { name: "Codex", command: "codex", args: [], icon: "X" },
  { name: "Gemini CLI", command: "gemini", args: [], icon: "G" },
  { name: "Aider", command: "aider", args: [], icon: "A" },
];

export interface WorktreeInfo {
  path: string;
  branch: string;
  head_commit: string;
  is_prunable: boolean;
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied";
  staged: boolean;
}

export interface SessionUsage {
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  duration_seconds: number;
  model: string;
}

export interface CheckpointInfo {
  id: string;
  name: string;
  timestamp: string;
  commit_sha: string;
}

export interface PaneNode {
  type: "split" | "terminal";
  direction?: "horizontal" | "vertical";
  children?: [PaneNode, PaneNode];
  sessionId?: string;
  splitPercent?: number;
}

// P2: Session Status Kanban
export type SessionStatus = 'planning' | 'running' | 'review' | 'done';

// P2: Custom Agent Profiles
export interface AgentProfile {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  description: string;
  model_hint?: string;
}

// P2: Embedded Browser Preview
export interface DevServer {
  port: number;
  url: string;
}

// P3: Code Search
export interface SearchResult {
  file_path: string;
  line_number: number;
  line_content: string;
  match_type: "text" | "symbol";
}

// P3: Git Visualization
export interface GitLogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  time_ago: string;
  refs: string[];
  graph_chars: string;
}
