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

pub fn generate_share_html(file_path: &str) -> Result<String, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read session file: {e}"))?;

    let mut messages: Vec<(String, String, String)> = Vec::new(); // (role, text, timestamp)
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

        let timestamp = parsed.get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let role = parsed.get("role").and_then(|v| v.as_str()).unwrap_or("");
        if role == "user" || role == "assistant" {
            if let Some(text) = extract_message_text(&parsed) {
                let heading = if role == "user" { "User" } else { "Assistant" };
                messages.push((heading.to_string(), text, timestamp));
            }
            continue;
        }

        let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if msg_type == "human" || msg_type == "user" {
            if let Some(text) = extract_message_text(&parsed) {
                messages.push(("User".to_string(), text, timestamp));
            }
        } else if msg_type == "assistant" {
            if let Some(text) = extract_message_text(&parsed) {
                messages.push(("Assistant".to_string(), text, timestamp));
            }
        }
    }

    // Build self-contained HTML
    let mut html = String::new();
    html.push_str("<!-- Generated by Claude Conductor -->\n");
    html.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    html.push_str("<meta charset=\"UTF-8\">\n");
    html.push_str("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    html.push_str("<title>Session Transcript</title>\n");
    html.push_str("<style>\n");
    html.push_str("* { margin: 0; padding: 0; box-sizing: border-box; }\n");
    html.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; line-height: 1.6; padding: 24px; max-width: 900px; margin: 0 auto; }\n");
    html.push_str(".header { background: #16213e; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #2a2a4a; }\n");
    html.push_str(".header h1 { font-size: 22px; color: #d4845a; margin-bottom: 12px; }\n");
    html.push_str(".meta { font-size: 13px; color: #888; }\n");
    html.push_str(".meta span { display: inline-block; margin-right: 16px; }\n");
    html.push_str(".message { background: #16213e; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; border-left: 3px solid #333; }\n");
    html.push_str(".message.user { border-left-color: #4a9eff; }\n");
    html.push_str(".message.assistant { border-left-color: #d4845a; }\n");
    html.push_str(".role-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }\n");
    html.push_str(".user .role-badge { background: #1a3a5c; color: #4a9eff; }\n");
    html.push_str(".assistant .role-badge { background: #3a2a1e; color: #d4845a; }\n");
    html.push_str(".timestamp { font-size: 11px; color: #666; float: right; margin-top: 2px; }\n");
    html.push_str(".content { white-space: pre-wrap; word-wrap: break-word; font-size: 14px; }\n");
    html.push_str("pre { background: #0d1117; border-radius: 8px; padding: 12px; margin: 8px 0; overflow-x: auto; font-size: 13px; border: 1px solid #2a2a4a; }\n");
    html.push_str("code { font-family: 'SF Mono', 'Fira Code', Menlo, monospace; }\n");
    html.push_str(".footer { text-align: center; padding: 20px; color: #555; font-size: 12px; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    // Header
    html.push_str("<div class=\"header\">\n");
    html.push_str("<h1>Session Transcript</h1>\n");
    html.push_str("<div class=\"meta\">\n");
    if !session_id.is_empty() {
        html.push_str(&format!("<span>Session: {}</span>\n", html_escape(&session_id)));
    }
    if !project.is_empty() {
        html.push_str(&format!("<span>Project: {}</span>\n", html_escape(&project)));
    }
    if !first_timestamp.is_empty() {
        html.push_str(&format!("<span>Date: {}</span>\n", html_escape(&first_timestamp)));
    }
    if !model.is_empty() {
        html.push_str(&format!("<span>Model: {}</span>\n", html_escape(&model)));
    }
    html.push_str(&format!("<span>Messages: {}</span>\n", messages.len()));
    html.push_str("</div>\n</div>\n");

    // Messages
    for (role, text, timestamp) in &messages {
        let role_class = if role == "User" { "user" } else { "assistant" };
        html.push_str(&format!("<div class=\"message {}\">\n", role_class));
        if !timestamp.is_empty() {
            html.push_str(&format!("<span class=\"timestamp\">{}</span>\n", html_escape(timestamp)));
        }
        html.push_str(&format!("<span class=\"role-badge\">{}</span>\n", html_escape(role)));

        // Convert code blocks in the text
        let formatted = format_code_blocks(&html_escape(text));
        html.push_str(&format!("<div class=\"content\">{}</div>\n", formatted));
        html.push_str("</div>\n");
    }

    html.push_str("<div class=\"footer\">Generated by Claude Conductor</div>\n");
    html.push_str("</body>\n</html>\n");

    Ok(html)
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn format_code_blocks(text: &str) -> String {
    let mut result = String::new();
    let mut in_code_block = false;
    for line in text.split('\n') {
        if line.starts_with("```") {
            if in_code_block {
                result.push_str("</code></pre>");
                in_code_block = false;
            } else {
                result.push_str("<pre><code>");
                in_code_block = true;
            }
        } else if in_code_block {
            result.push_str(line);
            result.push('\n');
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }
    if in_code_block {
        result.push_str("</code></pre>");
    }
    result
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
