use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct SessionUsage {
    pub message_count: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub estimated_cost_usd: f64,
    pub duration_seconds: f64,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelUsage {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyUsage {
    pub total_sessions: usize,
    pub total_messages: usize,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cost_usd: f64,
    pub by_model: HashMap<String, ModelUsage>,
    pub session_costs: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReplayMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub turn_number: usize,
}

#[derive(serde::Deserialize)]
struct SessionLine {
    #[serde(rename = "type")]
    msg_type: Option<String>,
    message: Option<MessageContent>,
    #[serde(rename = "costUSD")]
    cost_usd: Option<f64>,
    #[serde(rename = "durationMs")]
    duration_ms: Option<f64>,
    model: Option<String>,
    usage: Option<UsageBlock>,
    timestamp: Option<String>,
}

#[derive(serde::Deserialize)]
struct MessageContent {
    usage: Option<UsageBlock>,
    model: Option<String>,
}

#[derive(serde::Deserialize)]
struct UsageBlock {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    #[serde(rename = "cache_read_input_tokens")]
    _cache_read: Option<u64>,
    #[serde(rename = "cache_creation_input_tokens")]
    _cache_creation: Option<u64>,
}

/// Parse a Claude Code JSONL session file and compute usage statistics.
pub fn get_session_usage(file_path: &str) -> Result<SessionUsage, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("Session file not found: {}", file_path));
    }

    let file = fs::File::open(path)
        .map_err(|e| format!("Failed to open session file: {e}"))?;
    let reader = BufReader::new(file);

    let mut message_count: usize = 0;
    let mut input_tokens: u64 = 0;
    let mut output_tokens: u64 = 0;
    let mut total_cost: f64 = 0.0;
    let mut model = String::new();
    let mut first_ts: Option<String> = None;
    let mut last_ts: Option<String> = None;
    let mut total_duration_ms: f64 = 0.0;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        let parsed: SessionLine = match serde_json::from_str(&line) {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Track timestamps for duration
        if let Some(ref ts) = parsed.timestamp {
            if first_ts.is_none() {
                first_ts = Some(ts.clone());
            }
            last_ts = Some(ts.clone());
        }

        // Count messages
        match parsed.msg_type.as_deref() {
            Some("user") | Some("assistant") => {
                message_count += 1;
            }
            _ => {}
        }

        // Accumulate cost from costUSD field
        if let Some(cost) = parsed.cost_usd {
            total_cost += cost;
        }

        // Accumulate duration
        if let Some(dur) = parsed.duration_ms {
            total_duration_ms += dur;
        }

        // Track model
        if model.is_empty() {
            if let Some(ref m) = parsed.model {
                model = m.clone();
            }
            if let Some(ref msg) = parsed.message {
                if let Some(ref m) = msg.model {
                    model = m.clone();
                }
            }
        }

        // Extract token usage from top-level usage or message.usage
        let usage = parsed.usage.as_ref().or_else(|| {
            parsed.message.as_ref().and_then(|m| m.usage.as_ref())
        });
        if let Some(u) = usage {
            if let Some(inp) = u.input_tokens {
                input_tokens += inp;
            }
            if let Some(out) = u.output_tokens {
                output_tokens += out;
            }
        }
    }

    // Compute duration from timestamps if available
    let duration_seconds = if total_duration_ms > 0.0 {
        total_duration_ms / 1000.0
    } else if let (Some(first), Some(last)) = (first_ts, last_ts) {
        parse_duration_from_timestamps(&first, &last)
    } else {
        0.0
    };

    // If no explicit cost, estimate from tokens and model
    if total_cost == 0.0 && (input_tokens > 0 || output_tokens > 0) {
        total_cost = estimate_cost(&model, input_tokens, output_tokens);
    }

    Ok(SessionUsage {
        message_count,
        input_tokens,
        output_tokens,
        estimated_cost_usd: total_cost,
        duration_seconds,
        model,
    })
}

fn parse_duration_from_timestamps(first: &str, last: &str) -> f64 {
    let parse = |s: &str| -> Option<chrono::DateTime<chrono::Utc>> {
        chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .or_else(|| {
                // Try ISO 8601 without timezone
                chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f")
                    .ok()
                    .map(|ndt| ndt.and_utc())
            })
    };

    match (parse(first), parse(last)) {
        (Some(f), Some(l)) => {
            let dur = l.signed_duration_since(f);
            dur.num_seconds().max(0) as f64
        }
        _ => 0.0,
    }
}

fn estimate_cost(model: &str, input_tokens: u64, output_tokens: u64) -> f64 {
    let model_lower = model.to_lowercase();
    let (input_price, output_price) = if model_lower.contains("opus") {
        (15.0, 75.0)
    } else if model_lower.contains("haiku") {
        (0.25, 1.25)
    } else {
        // Default to sonnet pricing
        (3.0, 15.0)
    };

    (input_tokens as f64 / 1_000_000.0) * input_price
        + (output_tokens as f64 / 1_000_000.0) * output_price
}

fn normalize_model(model: &str) -> String {
    let lower = model.to_lowercase();
    if lower.contains("opus") {
        "opus".to_string()
    } else if lower.contains("haiku") {
        "haiku".to_string()
    } else if lower.contains("sonnet") {
        "sonnet".to_string()
    } else if lower.is_empty() {
        "unknown".to_string()
    } else {
        lower
    }
}

/// Aggregate usage across all sessions modified today.
pub fn get_daily_usage() -> Result<DailyUsage, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let projects_dir = home.join(".claude").join("projects");
    if !projects_dir.exists() {
        return Ok(DailyUsage {
            total_sessions: 0,
            total_messages: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost_usd: 0.0,
            by_model: HashMap::new(),
            session_costs: Vec::new(),
        });
    }

    let today = chrono::Local::now().date_naive();
    let mut total_sessions = 0usize;
    let mut total_messages = 0usize;
    let mut total_input_tokens = 0u64;
    let mut total_output_tokens = 0u64;
    let mut total_cost_usd = 0.0f64;
    let mut by_model: HashMap<String, ModelUsage> = HashMap::new();
    let mut session_costs: Vec<f64> = Vec::new();

    fn walk_jsonl(dir: &Path, results: &mut Vec<std::path::PathBuf>, today: chrono::NaiveDate) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk_jsonl(&path, results, today);
                } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    if let Ok(meta) = fs::metadata(&path) {
                        if let Ok(modified) = meta.modified() {
                            let dt: chrono::DateTime<chrono::Local> = modified.into();
                            if dt.date_naive() == today {
                                results.push(path);
                            }
                        }
                    }
                }
            }
        }
    }

    let mut files = Vec::new();
    walk_jsonl(&projects_dir, &mut files, today);

    for file_path in &files {
        let path_str = file_path.to_string_lossy().to_string();
        if let Ok(usage) = get_session_usage(&path_str) {
            total_sessions += 1;
            total_messages += usage.message_count;
            total_input_tokens += usage.input_tokens;
            total_output_tokens += usage.output_tokens;
            total_cost_usd += usage.estimated_cost_usd;
            session_costs.push(usage.estimated_cost_usd);

            let model_key = normalize_model(&usage.model);
            let entry = by_model.entry(model_key.clone()).or_insert_with(|| ModelUsage {
                model: model_key,
                input_tokens: 0,
                output_tokens: 0,
                cost_usd: 0.0,
                message_count: 0,
            });
            entry.input_tokens += usage.input_tokens;
            entry.output_tokens += usage.output_tokens;
            entry.cost_usd += usage.estimated_cost_usd;
            entry.message_count += usage.message_count;
        }
    }

    Ok(DailyUsage {
        total_sessions,
        total_messages,
        total_input_tokens,
        total_output_tokens,
        total_cost_usd,
        by_model,
        session_costs,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct PerformanceBenchmarks {
    pub avg_session_duration_secs: f64,
    pub avg_tokens_per_session: f64,
    pub avg_cost_per_session: f64,
    pub sessions_per_day: f64,
    pub most_used_agent: String,
    pub success_rate: f64,
    pub total_sessions_analyzed: usize,
}

/// Scan all sessions and compute performance benchmarks.
pub fn get_performance_benchmarks() -> Result<PerformanceBenchmarks, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let projects_dir = home.join(".claude").join("projects");
    if !projects_dir.exists() {
        return Ok(PerformanceBenchmarks {
            avg_session_duration_secs: 0.0,
            avg_tokens_per_session: 0.0,
            avg_cost_per_session: 0.0,
            sessions_per_day: 0.0,
            most_used_agent: "unknown".to_string(),
            success_rate: 0.0,
            total_sessions_analyzed: 0,
        });
    }

    // Collect all JSONL files modified in the last 30 days
    let cutoff = chrono::Local::now() - chrono::Duration::days(30);
    let cutoff_date = cutoff.date_naive();
    let mut files: Vec<(std::path::PathBuf, chrono::NaiveDate)> = Vec::new();

    fn walk_all(dir: &Path, results: &mut Vec<(std::path::PathBuf, chrono::NaiveDate)>, cutoff: chrono::NaiveDate) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk_all(&path, results, cutoff);
                } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    if let Ok(meta) = fs::metadata(&path) {
                        if let Ok(modified) = meta.modified() {
                            let dt: chrono::DateTime<chrono::Local> = modified.into();
                            let date = dt.date_naive();
                            if date >= cutoff {
                                results.push((path, date));
                            }
                        }
                    }
                }
            }
        }
    }

    walk_all(&projects_dir, &mut files, cutoff_date);

    if files.is_empty() {
        return Ok(PerformanceBenchmarks {
            avg_session_duration_secs: 0.0,
            avg_tokens_per_session: 0.0,
            avg_cost_per_session: 0.0,
            sessions_per_day: 0.0,
            most_used_agent: "unknown".to_string(),
            success_rate: 0.0,
            total_sessions_analyzed: 0,
        });
    }

    let mut total_duration = 0.0f64;
    let mut total_tokens = 0u64;
    let mut total_cost = 0.0f64;
    let mut model_counts: HashMap<String, usize> = HashMap::new();
    let mut success_count = 0usize;
    let mut analyzed = 0usize;
    let mut unique_dates: std::collections::HashSet<chrono::NaiveDate> = std::collections::HashSet::new();

    for (file_path, date) in &files {
        let path_str = file_path.to_string_lossy().to_string();
        if let Ok(usage) = get_session_usage(&path_str) {
            analyzed += 1;
            total_duration += usage.duration_seconds;
            total_tokens += usage.input_tokens + usage.output_tokens;
            total_cost += usage.estimated_cost_usd;
            unique_dates.insert(*date);

            let model_key = normalize_model(&usage.model);
            *model_counts.entry(model_key).or_insert(0) += 1;

            // A session is "successful" if it has > 1 message (completed some work)
            if usage.message_count > 1 {
                success_count += 1;
            }
        }
    }

    let n = analyzed as f64;
    let days = unique_dates.len().max(1) as f64;
    let most_used = model_counts
        .iter()
        .max_by_key(|(_, &v)| v)
        .map(|(k, _)| k.clone())
        .unwrap_or_else(|| "unknown".to_string());

    Ok(PerformanceBenchmarks {
        avg_session_duration_secs: if n > 0.0 { total_duration / n } else { 0.0 },
        avg_tokens_per_session: if n > 0.0 { total_tokens as f64 / n } else { 0.0 },
        avg_cost_per_session: if n > 0.0 { total_cost / n } else { 0.0 },
        sessions_per_day: analyzed as f64 / days,
        most_used_agent: most_used,
        success_rate: if n > 0.0 { (success_count as f64 / n) * 100.0 } else { 0.0 },
        total_sessions_analyzed: analyzed,
    })
}

/// Parse a JSONL session file and extract messages for replay.
pub fn get_session_transcript(file_path: &str) -> Result<Vec<ReplayMessage>, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("Session file not found: {}", file_path));
    }

    let file = fs::File::open(path)
        .map_err(|e| format!("Failed to open session file: {e}"))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();
    let mut turn = 0usize;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        let parsed: serde_json::Value = match serde_json::from_str(&line) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if msg_type != "user" && msg_type != "assistant" {
            continue;
        }

        turn += 1;
        let timestamp = parsed.get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Extract content: try message.content first, then message.text
        let content = parsed.get("message")
            .and_then(|m| {
                // content could be a string or array of blocks
                if let Some(s) = m.get("content").and_then(|c| c.as_str()) {
                    Some(s.to_string())
                } else if let Some(arr) = m.get("content").and_then(|c| c.as_array()) {
                    let mut text_parts = Vec::new();
                    for block in arr {
                        if let Some(t) = block.get("text").and_then(|t| t.as_str()) {
                            text_parts.push(t.to_string());
                        }
                    }
                    if text_parts.is_empty() { None } else { Some(text_parts.join("\n")) }
                } else {
                    m.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                }
            })
            .unwrap_or_default();

        // Truncate to a reasonable preview length
        let preview = if content.len() > 500 {
            format!("{}...", &content[..497])
        } else {
            content
        };

        messages.push(ReplayMessage {
            role: msg_type.to_string(),
            content: preview,
            timestamp,
            turn_number: turn,
        });
    }

    Ok(messages)
}
