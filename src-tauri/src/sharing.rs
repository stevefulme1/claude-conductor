use serde_json::Value;
use std::fs;
use std::path::Path;

pub fn export_session(file_path: &str) -> Result<String, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut messages: Vec<(String, String)> = Vec::new();
    let mut session_id = String::new();
    let mut project = String::new();
    let mut model = String::new();
    let mut first_timestamp = String::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parsed: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Extract metadata from first message
        if session_id.is_empty() {
            if let Some(sid) = parsed.get("sessionId").and_then(|v| v.as_str()) {
                session_id = sid.to_string();
            }
        }
        if project.is_empty() {
            if let Some(p) = parsed.get("cwd").and_then(|v| v.as_str()) {
                project = p.to_string();
            }
        }
        if model.is_empty() {
            if let Some(m) = parsed.get("model").and_then(|v| v.as_str()) {
                model = m.to_string();
            }
        }
        if first_timestamp.is_empty() {
            if let Some(ts) = parsed.get("timestamp").and_then(|v| v.as_str()) {
                first_timestamp = ts.to_string();
            }
        }

        // Extract user/assistant messages
        let role = parsed.get("role").and_then(|v| v.as_str()).unwrap_or("");
        if role != "user" && role != "assistant" {
            // Also check for type-based message format
            let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if msg_type == "human" || msg_type == "user" {
                if let Some(text) = extract_message_text(&parsed) {
                    messages.push(("User".to_string(), text));
                }
            } else if msg_type == "assistant" {
                if let Some(text) = extract_message_text(&parsed) {
                    messages.push(("Assistant".to_string(), text));
                }
            }
            continue;
        }

        if let Some(text) = extract_message_text(&parsed) {
            let heading = if role == "user" { "User" } else { "Assistant" };
            messages.push((heading.to_string(), text));
        }
    }

    // Build the markdown
    let mut md = String::new();
    md.push_str("# Session Transcript\n\n");

    // Metadata header
    if !session_id.is_empty() {
        md.push_str(&format!("- **Session ID:** {}\n", session_id));
    }
    if !project.is_empty() {
        md.push_str(&format!("- **Project:** {}\n", project));
    }
    if !first_timestamp.is_empty() {
        md.push_str(&format!("- **Timestamp:** {}\n", first_timestamp));
    }
    if !model.is_empty() {
        md.push_str(&format!("- **Model:** {}\n", model));
    }
    md.push_str(&format!("- **Messages:** {}\n", messages.len()));
    md.push_str("\n---\n\n");

    for (heading, text) in &messages {
        md.push_str(&format!("## {}\n\n{}\n\n---\n\n", heading, text));
    }

    Ok(md)
}

pub fn save_export(dest_path: &str, content: &str) -> Result<(), String> {
    let path = Path::new(dest_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    fs::write(path, content).map_err(|e| format!("Failed to write file: {e}"))
}

fn extract_message_text(parsed: &Value) -> Option<String> {
    // Try "message" field (string)
    if let Some(msg) = parsed.get("message").and_then(|v| v.as_str()) {
        if !msg.trim().is_empty() {
            return Some(msg.to_string());
        }
    }

    // Try "content" field - could be a string or array of content blocks
    if let Some(content) = parsed.get("content") {
        if let Some(s) = content.as_str() {
            if !s.trim().is_empty() {
                return Some(s.to_string());
            }
        }
        if let Some(arr) = content.as_array() {
            let mut parts = Vec::new();
            for item in arr {
                if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                    parts.push(text.to_string());
                } else if let Some(s) = item.as_str() {
                    parts.push(s.to_string());
                }
            }
            let joined = parts.join("\n");
            if !joined.trim().is_empty() {
                return Some(joined);
            }
        }
    }

    // Try "text" field directly
    if let Some(text) = parsed.get("text").and_then(|v| v.as_str()) {
        if !text.trim().is_empty() {
            return Some(text.to_string());
        }
    }

    None
}
