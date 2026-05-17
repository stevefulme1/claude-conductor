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

// Tier 1: Daily Usage / Cost Calculator
export interface ModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  message_count: number;
}

export interface DailyUsage {
  total_sessions: number;
  total_messages: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  by_model: Record<string, ModelUsage>;
  session_costs: number[];
}

// Tier 1: Session Chaining
export interface ChainStep {
  agent: string;
  prompt: string;
  status: string;
}

export interface SessionChain {
  id: string;
  name: string;
  steps: ChainStep[];
  current_step: number;
}

// Tier 1: Session Templates
export interface SessionTemplate {
  name: string;
  agent: string;
  cwd_pattern?: string;
  mcp_servers: string[];
  description: string;
}

// Tier 1: MCP Marketplace
export interface McpServerEntry {
  name: string;
  description: string;
  install_type: string;
  install_command: string;
  config_template: unknown;
  category: string;
}

// Tier 1: Session Replay
export interface ReplayMessage {
  role: string;
  content: string;
  timestamp: string;
  turn_number: number;
}

// Tier 2: Compliance Mode
export interface ComplianceEvent {
  timestamp: string;
  session_id: string;
  action: string;
  details: string;
  approved: boolean;
}

// Tier 2: Smart Session Routing
export interface AgentSuggestion {
  agent_name: string;
  reason: string;
  detected_language: string;
  detected_framework: string;
}

// Tier 2: Performance Benchmarks
export interface PerformanceBenchmarks {
  avg_session_duration_secs: number;
  avg_tokens_per_session: number;
  avg_cost_per_session: number;
  sessions_per_day: number;
  most_used_agent: string;
  success_rate: number;
  total_sessions_analyzed: number;
}

// Tier 2: Plugin System
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  entry_point: string;
  hooks: string[];
}

// Tier 3: CI Monitor
export interface CIStatus {
  repo: string;
  branch: string;
  status: string;
  conclusion: string | null;
  url: string;
  workflow_name: string;
}

// Tier 3: Spatial Canvas card position
export interface CanvasCardPosition {
  sessionId: string;
  x: number;
  y: number;
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
