use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::time::SystemTime;

const MAX_SESSIONS: usize = 500;
const MAX_LINES: usize = 200;
const MAX_CONSECUTIVE_FAILURES: usize = 10;

struct CachedEntry {
    mtime: SystemTime,
    meta: SessionMeta,
}

static SESSION_CACHE: Mutex<Option<HashMap<String, CachedEntry>>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub session_id: String,
    pub project_path: String,
    pub project_display: String,
    pub last_modified: String,
    pub first_message: String,
    pub cwd: String,
    pub message_count: usize,
    pub file_path: String,
}

#[derive(Deserialize)]
struct SessionLine {
    #[serde(rename = "type")]
    msg_type: Option<String>,
    message: Option<MessageContent>,
    cwd: Option<String>,
    #[serde(rename = "isMeta")]
    is_meta: Option<bool>,
}

#[derive(Deserialize)]
struct MessageContent {
    content: Option<serde_json::Value>,
}

fn project_path_to_display(encoded: &str) -> String {
    encoded.replace('-', "/").trim_start_matches('/').to_string()
}

fn extract_text_from_content(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.len() > 5 && !trimmed.starts_with('<') {
                Some(trimmed.chars().take(120).collect())
            } else {
                None
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if obj.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                            let trimmed = text.trim();
                            if trimmed.len() > 5 && !trimmed.starts_with('<') {
                                return Some(trimmed.chars().take(120).collect());
                            }
                        }
                    }
                }
            }
            None
        }
        _ => None,
    }
}

fn extract_session_summary(file_path: &Path) -> (String, String, usize) {
    let mut first_msg = String::new();
    let mut cwd = String::new();
    let mut count: usize = 0;

    let file = match fs::File::open(file_path) {
        Ok(f) => f,
        Err(e) => {
            log::warn!("Cannot open session file {}: {}", file_path.display(), e);
            return ("(unreadable session)".to_string(), String::new(), 0);
        }
    };

    let reader = BufReader::new(file);
    let mut consecutive_failures: usize = 0;

    for line in reader.lines().take(MAX_LINES) {
        let line = match line {
            Ok(l) => l,
            Err(_) => {
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    log::warn!("Too many read failures in {}, stopping early", file_path.display());
                    break;
                }
                continue;
            }
        };
        let parsed = match serde_json::from_str::<SessionLine>(&line) {
            Ok(p) => {
                consecutive_failures = 0;
                p
            }
            Err(_) => {
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    log::warn!("Too many parse failures in {}, stopping early", file_path.display());
                    break;
                }
                continue;
            }
        };

        if parsed.msg_type.as_deref() == Some("user")
            || parsed.msg_type.as_deref() == Some("assistant")
        {
            count += 1;
        }

        if !first_msg.is_empty() {
            continue;
        }

        if parsed.msg_type.as_deref() != Some("user") {
            continue;
        }
        if parsed.is_meta.unwrap_or(false) {
            continue;
        }

        if let Some(ref msg) = parsed.message {
            if let Some(ref content) = msg.content {
                if let Some(text) = extract_text_from_content(content) {
                    first_msg = text;
                    if let Some(ref c) = parsed.cwd {
                        cwd = c.clone();
                    }
                }
            }
        }
    }

    if first_msg.is_empty() {
        first_msg = "(no user messages)".to_string();
    }

    (first_msg, cwd, count)
}

pub fn discover_sessions() -> Result<Vec<SessionMeta>, Box<dyn std::error::Error>> {
    let home = dirs::home_dir().ok_or("no home dir")?;
    let projects_dir = home.join(".claude").join("projects");
    discover_sessions_from(&projects_dir)
}

fn discover_sessions_from(projects_dir: &Path) -> Result<Vec<SessionMeta>, Box<dyn std::error::Error>> {
    if !projects_dir.exists() {
        return Ok(vec![]);
    }

    let mut guard = SESSION_CACHE.lock();
    let cache = guard.get_or_insert_with(HashMap::new);
    let mut seen_keys = Vec::new();
    let mut results = vec![];

    for project_entry in fs::read_dir(projects_dir)? {
        let project_entry = match project_entry {
            Ok(e) => e,
            Err(e) => {
                log::warn!("Skipping unreadable project entry: {}", e);
                continue;
            }
        };

        let ft = match project_entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_symlink() || !ft.is_dir() {
            continue;
        }

        let project_name = project_entry.file_name().to_string_lossy().to_string();
        let display = project_path_to_display(&project_name);

        let entries = match fs::read_dir(project_entry.path()) {
            Ok(e) => e,
            Err(e) => {
                log::warn!("Cannot read project dir {}: {}", project_name, e);
                continue;
            }
        };

        for file in entries {
            let file = match file {
                Ok(f) => f,
                Err(_) => continue,
            };

            if file.file_type().map(|t| t.is_symlink()).unwrap_or(false) {
                continue;
            }

            let fname = file.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".jsonl") {
                continue;
            }

            let file_path_str = file.path().to_string_lossy().to_string();
            let modified = match file.metadata().and_then(|m| m.modified()) {
                Ok(m) => m,
                Err(_) => continue,
            };

            seen_keys.push(file_path_str.clone());

            if let Some(cached) = cache.get(&file_path_str) {
                if cached.mtime == modified {
                    results.push(cached.meta.clone());
                    continue;
                }
            }

            let session_id = fname.trim_end_matches(".jsonl").to_string();
            let dt: DateTime<Utc> = modified.into();
            let (first_message, cwd, message_count) = extract_session_summary(&file.path());

            let meta = SessionMeta {
                session_id,
                project_path: project_name.clone(),
                project_display: display.clone(),
                last_modified: dt.to_rfc3339(),
                first_message,
                cwd: if cwd.is_empty() {
                    format!("/{}", display)
                } else {
                    cwd
                },
                message_count,
                file_path: file_path_str.clone(),
            };

            cache.insert(file_path_str, CachedEntry { mtime: modified, meta: meta.clone() });
            results.push(meta);
        }
    }

    cache.retain(|k, _| seen_keys.contains(k));

    results.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    results.truncate(MAX_SESSIONS);
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_project_path_to_display_basic() {
        assert_eq!(project_path_to_display("Users-steve-projects-foo"), "Users/steve/projects/foo");
    }

    #[test]
    fn test_project_path_to_display_leading_hyphens() {
        assert_eq!(project_path_to_display("-Users-steve"), "Users/steve");
    }

    #[test]
    fn test_project_path_to_display_single_segment() {
        assert_eq!(project_path_to_display("myproject"), "myproject");
    }

    #[test]
    fn test_project_path_to_display_empty() {
        assert_eq!(project_path_to_display(""), "");
    }

    fn write_jsonl(dir: &std::path::Path, name: &str, lines: &[&str]) -> std::path::PathBuf {
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        for line in lines {
            writeln!(f, "{}", line).unwrap();
        }
        path
    }

    #[test]
    fn test_extract_session_summary_valid() {
        let dir = TempDir::new().unwrap();
        let path = write_jsonl(dir.path(), "test.jsonl", &[
            r#"{"type":"user","message":{"content":"Hello world, this is a test message"},"cwd":"/home/user/proj"}"#,
            r#"{"type":"assistant","message":{"content":"I can help with that"}}"#,
            r#"{"type":"user","message":{"content":"Another user message here too"}}"#,
        ]);

        let (msg, cwd, count) = extract_session_summary(&path);
        assert_eq!(msg, "Hello world, this is a test message");
        assert_eq!(cwd, "/home/user/proj");
        assert_eq!(count, 3);
    }

    #[test]
    fn test_extract_session_summary_content_array() {
        let dir = TempDir::new().unwrap();
        let path = write_jsonl(dir.path(), "test.jsonl", &[
            r#"{"type":"user","message":{"content":[{"type":"text","text":"Array content message here"}]},"cwd":"/tmp"}"#,
        ]);

        let (msg, cwd, count) = extract_session_summary(&path);
        assert_eq!(msg, "Array content message here");
        assert_eq!(cwd, "/tmp");
        assert_eq!(count, 1);
    }

    #[test]
    fn test_extract_session_summary_malformed() {
        let dir = TempDir::new().unwrap();
        let path = write_jsonl(dir.path(), "test.jsonl", &[
            "not json at all",
            "still not json",
            "{bad json}",
        ]);

        let (msg, _cwd, count) = extract_session_summary(&path);
        assert_eq!(msg, "(no user messages)");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_extract_session_summary_mixed_valid_invalid() {
        let dir = TempDir::new().unwrap();
        let path = write_jsonl(dir.path(), "test.jsonl", &[
            "garbage line",
            r#"{"type":"user","message":{"content":"Valid message after garbage"},"cwd":"/x"}"#,
            "more garbage",
            r#"{"type":"assistant","message":{"content":"response"}}"#,
        ]);

        let (msg, cwd, count) = extract_session_summary(&path);
        assert_eq!(msg, "Valid message after garbage");
        assert_eq!(cwd, "/x");
        assert_eq!(count, 2);
    }

    #[test]
    fn test_extract_session_summary_skips_short_messages() {
        let dir = TempDir::new().unwrap();
        let path = write_jsonl(dir.path(), "test.jsonl", &[
            r#"{"type":"user","message":{"content":"hi"}}"#,
            r#"{"type":"user","message":{"content":"This is a longer message that should be picked up"}}"#,
        ]);

        let (msg, _cwd, count) = extract_session_summary(&path);
        assert_eq!(msg, "This is a longer message that should be picked up");
        assert_eq!(count, 2);
    }

    #[test]
    fn test_extract_session_summary_skips_meta_messages() {
        let dir = TempDir::new().unwrap();
        let path = write_jsonl(dir.path(), "test.jsonl", &[
            r#"{"type":"user","isMeta":true,"message":{"content":"This is a meta message, should be skipped"}}"#,
            r#"{"type":"user","message":{"content":"This is the real first message here"}}"#,
        ]);

        let (msg, _cwd, count) = extract_session_summary(&path);
        assert_eq!(msg, "This is the real first message here");
        assert_eq!(count, 2);
    }

    #[test]
    fn test_extract_session_summary_nonexistent_file() {
        let path = std::path::PathBuf::from("/nonexistent/path/to/file.jsonl");
        let (msg, cwd, count) = extract_session_summary(&path);
        assert_eq!(msg, "(unreadable session)");
        assert_eq!(cwd, "");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_discover_sessions_empty_dir() {
        let dir = TempDir::new().unwrap();
        let result = discover_sessions_from(dir.path()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_discover_sessions_nonexistent_dir() {
        let result = discover_sessions_from(Path::new("/nonexistent/path")).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_discover_sessions_with_project() {
        let dir = TempDir::new().unwrap();
        let project_dir = dir.path().join("-Users-steve-myproject");
        fs::create_dir(&project_dir).unwrap();

        write_jsonl(&project_dir, "abc123.jsonl", &[
            r#"{"type":"user","message":{"content":"Hello from the test session here"},"cwd":"/tmp"}"#,
        ]);

        let result = discover_sessions_from(dir.path()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].session_id, "abc123");
        assert_eq!(result[0].project_display, "Users/steve/myproject");
        assert_eq!(result[0].first_message, "Hello from the test session here");
    }

    #[test]
    fn test_discover_sessions_skips_non_jsonl() {
        let dir = TempDir::new().unwrap();
        let project_dir = dir.path().join("myproject");
        fs::create_dir(&project_dir).unwrap();

        write_jsonl(&project_dir, "session.jsonl", &[
            r#"{"type":"user","message":{"content":"A valid session message content"}}"#,
        ]);
        write_jsonl(&project_dir, "notes.txt", &["not a session"]);

        let result = discover_sessions_from(dir.path()).unwrap();
        assert_eq!(result.len(), 1);
    }
}
