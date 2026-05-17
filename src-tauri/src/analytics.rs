use serde::Serialize;
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
