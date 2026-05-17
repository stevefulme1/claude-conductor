use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub time_ago: String,
    pub refs: Vec<String>,
    pub graph_chars: String,
}

pub fn get_git_log(cwd: &str, limit: u32) -> Result<Vec<GitLogEntry>, String> {
    let limit_str = limit.to_string();
    let output = Command::new("git")
        .args([
            "log",
            "--oneline",
            "--graph",
            "--all",
            "-n",
            &limit_str,
            "--format=CONDUCTOR_SEP%H|%h|%s|%an|%ar|%d",
        ])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git log: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git log failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        if let Some(sep_pos) = line.find("CONDUCTOR_SEP") {
            let graph_chars = line[..sep_pos].to_string();
            let data = &line[sep_pos + "CONDUCTOR_SEP".len()..];

            let parts: Vec<&str> = data.splitn(6, '|').collect();
            if parts.len() < 6 {
                continue;
            }

            let refs_raw = parts[5].trim();
            let refs = if refs_raw.is_empty() {
                Vec::new()
            } else {
                // Strip outer parens: " (HEAD -> main, origin/main)"
                let inner = refs_raw
                    .trim_start_matches(" (")
                    .trim_start_matches('(')
                    .trim_end_matches(')');
                inner
                    .split(", ")
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            };

            entries.push(GitLogEntry {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author: parts[3].to_string(),
                time_ago: parts[4].to_string(),
                refs,
                graph_chars,
            });
        }
    }

    Ok(entries)
}
