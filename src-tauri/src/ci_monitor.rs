use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CIStatus {
    pub repo: String,
    pub branch: String,
    pub status: String,       // queued, in_progress, completed
    pub conclusion: Option<String>, // success, failure, null
    pub url: String,
    pub workflow_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GhRunEntry {
    status: Option<String>,
    conclusion: Option<String>,
    url: Option<String>,
    name: Option<String>,
}

fn extract_repo(cwd: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        return Err("No git remote found".to_string());
    }

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Parse owner/repo from various URL formats
    let repo = if url.contains("github.com") {
        url.trim_end_matches(".git")
            .rsplit("github.com")
            .next()
            .unwrap_or("")
            .trim_start_matches('/')
            .trim_start_matches(':')
            .to_string()
    } else {
        return Err(format!("Not a GitHub remote: {url}"));
    };

    if repo.is_empty() || !repo.contains('/') {
        return Err(format!("Cannot parse owner/repo from: {url}"));
    }

    Ok(repo)
}

fn get_branch(cwd: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        return Err("Cannot determine current branch".to_string());
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        return Err("Detached HEAD state".to_string());
    }

    Ok(branch)
}

pub fn get_ci_status(cwd: &str) -> Result<CIStatus, String> {
    let repo = extract_repo(cwd)?;
    let branch = get_branch(cwd)?;

    let output = Command::new("gh")
        .args([
            "run", "list",
            "--branch", &branch,
            "--limit", "1",
            "--json", "status,conclusion,url,name",
        ])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run gh CLI: {e}. Is `gh` installed?"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh run list failed: {stderr}"));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let runs: Vec<GhRunEntry> = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse gh output: {e}"))?;

    let run = runs.first().ok_or("No CI runs found for this branch")?;

    Ok(CIStatus {
        repo,
        branch,
        status: run.status.clone().unwrap_or_else(|| "unknown".to_string()),
        conclusion: run.conclusion.clone(),
        url: run.url.clone().unwrap_or_default(),
        workflow_name: run.name.clone().unwrap_or_else(|| "Unknown".to_string()),
    })
}

pub fn get_ci_logs(cwd: &str) -> Result<String, String> {
    let output = Command::new("gh")
        .args(["run", "view", "--log-failed"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run gh CLI: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() && stdout.is_empty() {
        return Err(format!("gh run view failed: {stderr}"));
    }

    // Return last 50 lines
    let lines: Vec<&str> = stdout.lines().collect();
    let start = if lines.len() > 50 { lines.len() - 50 } else { 0 };
    Ok(lines[start..].join("\n"))
}

pub fn rerun_ci(cwd: &str) -> Result<(), String> {
    // Find the latest failed run ID
    let output = Command::new("gh")
        .args([
            "run", "list",
            "--limit", "1",
            "--json", "databaseId,conclusion",
        ])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run gh CLI: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh run list failed: {stderr}"));
    }

    #[derive(Deserialize)]
    struct RunId {
        #[serde(rename = "databaseId")]
        database_id: Option<u64>,
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let runs: Vec<RunId> = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse: {e}"))?;

    let run = runs.first().ok_or("No CI runs found")?;
    let run_id = run.database_id.ok_or("No run ID found")?;

    let rerun_output = Command::new("gh")
        .args(["run", "rerun", &run_id.to_string()])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to rerun: {e}"))?;

    if !rerun_output.status.success() {
        let stderr = String::from_utf8_lossy(&rerun_output.stderr);
        return Err(format!("Rerun failed: {stderr}"));
    }

    Ok(())
}
