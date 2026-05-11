use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

const DIGEST_RETENTION_DAYS: i64 = 30;
const MAX_SUMMARY_LINES: usize = 300;
const MAX_USER_MESSAGES_TO_SCAN: usize = 50;

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

struct SessionDigest {
    cwd: String,
    time_ago: String,
    topics: Vec<String>,
    message_count: usize,
}

fn digest_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".claude").join("conductor-context.md")
}

fn extract_user_topics(file_path: &Path) -> Vec<String> {
    let file = match fs::File::open(file_path) {
        Ok(f) => f,
        Err(_) => return vec![],
    };

    let reader = BufReader::new(file);
    let mut topics = Vec::new();
    let mut count = 0;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        let parsed = match serde_json::from_str::<SessionLine>(&line) {
            Ok(p) => p,
            Err(_) => continue,
        };

        if parsed.msg_type.as_deref() != Some("user") {
            continue;
        }
        if parsed.is_meta.unwrap_or(false) {
            continue;
        }

        if let Some(ref msg) = parsed.message {
            if let Some(ref content) = msg.content {
                if let Some(text) = extract_text(content) {
                    let trimmed: String = text.chars().take(150).collect();
                    if !trimmed.is_empty() {
                        topics.push(trimmed);
                        count += 1;
                        if count >= 5 {
                            break;
                        }
                    }
                }
            }
        }
    }

    topics
}

fn extract_text(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => {
            let t = text.trim();
            if t.len() > 5 && !t.starts_with('<') {
                Some(t.to_string())
            } else {
                None
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if obj.get("type").and_then(|v| v.as_str()) == Some("text") {
                        if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                            let t = text.trim();
                            if t.len() > 5 && !t.starts_with('<') {
                                return Some(t.to_string());
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

fn count_messages(file_path: &Path) -> usize {
    let file = match fs::File::open(file_path) {
        Ok(f) => f,
        Err(_) => return 0,
    };
    let reader = BufReader::new(file);
    let mut count = 0;
    for line in reader.lines().take(MAX_USER_MESSAGES_TO_SCAN * 10) {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if let Ok(parsed) = serde_json::from_str::<SessionLine>(&line) {
            if parsed.msg_type.as_deref() == Some("user")
                || parsed.msg_type.as_deref() == Some("assistant")
            {
                count += 1;
            }
        }
    }
    count
}

fn project_path_to_display(encoded: &str) -> String {
    let raw = encoded.replace('-', "/");
    let path = raw.trim_start_matches('/');
    if let Some(idx) = path.find('/') {
        let after = &path[idx..];
        format!("~{}", after)
    } else {
        format!("~/{}", path)
    }
}

fn time_ago_str(dt: &DateTime<Utc>, now: &DateTime<Utc>) -> String {
    let diff = *now - *dt;
    let hours = diff.num_hours();
    if hours < 1 {
        format!("{}m ago", diff.num_minutes().max(1))
    } else if hours < 24 {
        format!("{}h ago", hours)
    } else {
        format!("{}d ago", diff.num_days())
    }
}

pub fn generate_digest() -> Result<String, Box<dyn std::error::Error>> {
    let home = dirs::home_dir().ok_or("no home dir")?;
    let projects_dir = home.join(".claude").join("projects");

    if !projects_dir.exists() {
        return Ok("No Claude Code sessions found.".to_string());
    }

    let now = Utc::now();
    let cutoff = now - Duration::days(DIGEST_RETENTION_DAYS);
    let mut by_date: BTreeMap<String, Vec<SessionDigest>> = BTreeMap::new();

    for project_entry in fs::read_dir(&projects_dir)? {
        let project_entry = match project_entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !project_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }

        let project_name = project_entry.file_name().to_string_lossy().to_string();
        let display = project_path_to_display(&project_name);

        let entries = match fs::read_dir(project_entry.path()) {
            Ok(e) => e,
            Err(_) => continue,
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

            let modified = match file.metadata().and_then(|m| m.modified()) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let dt: DateTime<Utc> = modified.into();

            if dt < cutoff {
                continue;
            }

            let date_str = dt.format("%Y-%m-%d").to_string();
            let time_ago = time_ago_str(&dt, &now);
            let topics = extract_user_topics(&file.path());
            let message_count = count_messages(&file.path());

            let cwd_display = {
                let file_path = file.path();
                let topics_cwd = extract_cwd_from_session(&file_path);
                if topics_cwd.is_empty() {
                    display.clone()
                } else {
                    let home_prefix = home.to_string_lossy();
                    if topics_cwd.starts_with(home_prefix.as_ref()) {
                        format!("~{}", &topics_cwd[home_prefix.len()..])
                    } else {
                        topics_cwd
                    }
                }
            };

            if message_count == 0 {
                continue;
            }

            by_date
                .entry(date_str.clone())
                .or_default()
                .push(SessionDigest {
                    cwd: cwd_display,
                    time_ago,
                    topics,
                    message_count,
                });
        }
    }

    let mut output = String::new();
    output.push_str("# Claude Code Session Context (Last 30 Days)\n\n");
    output.push_str(&format!(
        "Auto-generated by Claude Conductor. Updated: {}\n\n",
        now.format("%Y-%m-%d %H:%M UTC")
    ));

    let mut line_count = 0;
    for (date, mut sessions) in by_date.into_iter().rev() {
        if line_count >= MAX_SUMMARY_LINES {
            break;
        }

        sessions.sort_by(|a, b| b.time_ago.cmp(&a.time_ago));

        output.push_str(&format!("## {}\n", date));
        line_count += 1;

        for s in &sessions {
            if line_count >= MAX_SUMMARY_LINES {
                break;
            }

            let topic_summary = if s.topics.is_empty() {
                "(no messages captured)".to_string()
            } else {
                s.topics[0].clone()
            };

            output.push_str(&format!(
                "- **{}** ({}, {} msgs) — {}\n",
                s.cwd, s.time_ago, s.message_count, topic_summary
            ));
            line_count += 1;
        }
        output.push('\n');
        line_count += 1;
    }

    if line_count == 0 {
        output.push_str("No sessions in the last 30 days.\n");
    }

    Ok(output)
}

fn extract_cwd_from_session(file_path: &Path) -> String {
    let file = match fs::File::open(file_path) {
        Ok(f) => f,
        Err(_) => return String::new(),
    };
    let reader = BufReader::new(file);
    for line in reader.lines().take(20) {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if let Ok(parsed) = serde_json::from_str::<SessionLine>(&line) {
            if let Some(cwd) = parsed.cwd {
                if !cwd.is_empty() {
                    return cwd;
                }
            }
        }
    }
    String::new()
}

pub fn write_digest() -> Result<String, Box<dyn std::error::Error>> {
    let content = generate_digest()?;
    let path = digest_path();
    fs::write(&path, &content)?;
    log::info!("Wrote session digest to {}", path.display());
    Ok(path.to_string_lossy().to_string())
}
