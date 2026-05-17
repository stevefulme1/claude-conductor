use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceEvent {
    pub timestamp: String,
    pub session_id: String,
    pub action: String,
    pub details: String,
    pub approved: bool,
}

fn audit_log_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let path = home.join(".claude").join("conductor-audit.jsonl");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    Ok(path)
}

pub fn log_compliance_event(event: ComplianceEvent) -> Result<(), String> {
    let path = audit_log_path()?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open audit log: {e}"))?;

    let json = serde_json::to_string(&event)
        .map_err(|e| format!("Failed to serialize event: {e}"))?;
    writeln!(file, "{}", json)
        .map_err(|e| format!("Failed to write audit event: {e}"))?;
    Ok(())
}

pub fn get_compliance_log(limit: u32) -> Result<Vec<ComplianceEvent>, String> {
    let path = audit_log_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = fs::File::open(&path)
        .map_err(|e| format!("Failed to open audit log: {e}"))?;
    let reader = BufReader::new(file);

    let mut events: Vec<ComplianceEvent> = Vec::new();
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(event) = serde_json::from_str::<ComplianceEvent>(&line) {
            events.push(event);
        }
    }

    // Return last N events
    let start = if events.len() > limit as usize {
        events.len() - limit as usize
    } else {
        0
    };
    Ok(events[start..].to_vec())
}

pub fn export_compliance_report(start_date: &str, end_date: &str) -> Result<String, String> {
    let path = audit_log_path()?;
    if !path.exists() {
        return Ok("# Compliance Report\n\nNo audit events found.\n".to_string());
    }

    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {e}"))?;
    let end = NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {e}"))?;

    let file = fs::File::open(&path)
        .map_err(|e| format!("Failed to open audit log: {e}"))?;
    let reader = BufReader::new(file);

    let mut events: Vec<ComplianceEvent> = Vec::new();
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if let Ok(event) = serde_json::from_str::<ComplianceEvent>(&line) {
            // Filter by date range
            if let Ok(dt) = DateTime::parse_from_rfc3339(&event.timestamp) {
                let date = dt.with_timezone(&Utc).date_naive();
                if date >= start && date <= end {
                    events.push(event);
                }
            }
        }
    }

    // Build markdown report
    let mut md = String::new();
    md.push_str("# Compliance Audit Report\n\n");
    md.push_str(&format!("**Period:** {} to {}\n\n", start_date, end_date));
    md.push_str(&format!("**Total Events:** {}\n\n", events.len()));

    // Summary by action type
    let mut action_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut approved_count = 0usize;
    for ev in &events {
        *action_counts.entry(ev.action.clone()).or_insert(0) += 1;
        if ev.approved {
            approved_count += 1;
        }
    }

    md.push_str("## Summary\n\n");
    md.push_str(&format!("- Approved events: {}\n", approved_count));
    md.push_str(&format!("- Total events: {}\n\n", events.len()));

    md.push_str("### Events by Action\n\n");
    md.push_str("| Action | Count |\n|--------|-------|\n");
    let mut actions: Vec<_> = action_counts.iter().collect();
    actions.sort_by(|a, b| b.1.cmp(a.1));
    for (action, count) in actions {
        md.push_str(&format!("| {} | {} |\n", action, count));
    }

    md.push_str("\n## Event Log\n\n");
    md.push_str("| Timestamp | Session | Action | Details | Approved |\n");
    md.push_str("|-----------|---------|--------|---------|----------|\n");
    for ev in &events {
        let short_session = if ev.session_id.len() > 8 {
            &ev.session_id[..8]
        } else {
            &ev.session_id
        };
        let approved_mark = if ev.approved { "Yes" } else { "No" };
        let details_short = if ev.details.len() > 60 {
            format!("{}...", &ev.details[..57])
        } else {
            ev.details.clone()
        };
        md.push_str(&format!(
            "| {} | {} | {} | {} | {} |\n",
            ev.timestamp, short_session, ev.action, details_short, approved_mark
        ));
    }

    Ok(md)
}
