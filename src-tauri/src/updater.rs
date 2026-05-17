use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub changelog: String,
}

pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn check_for_updates() -> Result<UpdateInfo, String> {
    let current = get_current_version();

    let output = Command::new("curl")
        .args([
            "-sL",
            "-H",
            "Accept: application/vnd.github+json",
            "https://api.github.com/repos/stevefulme1/claude-conductor/releases/latest",
        ])
        .output()
        .map_err(|e| format!("Failed to run curl: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "GitHub API request failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let body = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {e}"))?;

    let tag = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let release_url = json["html_url"].as_str().unwrap_or("").to_string();
    let changelog = json["body"].as_str().unwrap_or("").to_string();

    let update_available = if tag.is_empty() {
        false
    } else {
        compare_versions(&current, &tag)
    };

    Ok(UpdateInfo {
        current_version: current,
        latest_version: if tag.is_empty() {
            "unknown".to_string()
        } else {
            tag
        },
        update_available,
        release_url,
        changelog,
    })
}

/// Returns true if latest > current using semver comparison.
fn compare_versions(current: &str, latest: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.')
            .filter_map(|p| p.parse::<u64>().ok())
            .collect()
    };
    let c = parse(current);
    let l = parse(latest);
    for i in 0..3 {
        let cv = c.get(i).copied().unwrap_or(0);
        let lv = l.get(i).copied().unwrap_or(0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}
