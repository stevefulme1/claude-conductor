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
