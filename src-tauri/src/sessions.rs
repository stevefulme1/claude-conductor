use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

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

fn extract_session_summary(file_path: &PathBuf) -> (String, String, usize) {
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
    for line in reader.lines().take(200) {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        let parsed = match serde_json::from_str::<SessionLine>(&line) {
            Ok(p) => p,
            Err(_) => continue,
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
            if let Some(serde_json::Value::String(ref text)) = msg.content {
                let trimmed = text.trim();
                if trimmed.len() > 5 && !trimmed.starts_with('<') {
                    first_msg = trimmed.chars().take(120).collect();
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
    let mut results = vec![];

    if !projects_dir.exists() {
        return Ok(results);
    }

    for project_entry in fs::read_dir(&projects_dir)? {
        let project_entry = match project_entry {
            Ok(e) => e,
            Err(e) => {
                log::warn!("Skipping unreadable project entry: {}", e);
                continue;
            }
        };
        if !project_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
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
            let fname = file.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".jsonl") {
                continue;
            }

            let session_id = fname.trim_end_matches(".jsonl").to_string();
            let modified = match file.metadata().and_then(|m| m.modified()) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let dt: DateTime<Utc> = modified.into();
            let file_path = file.path().to_string_lossy().to_string();

            let (first_message, cwd, message_count) = extract_session_summary(&file.path());

            results.push(SessionMeta {
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
                file_path,
            });
        }
    }

    results.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(results)
}
