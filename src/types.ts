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
    typeof o.first_message === "string" &&
    typeof o.cwd === "string" &&
    typeof o.message_count === "number" &&
    typeof o.file_path === "string"
  );
}
