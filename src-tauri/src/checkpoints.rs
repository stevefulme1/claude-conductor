use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct CheckpointInfo {
    pub id: String,
    pub name: String,
    pub timestamp: String,
    pub commit_sha: String,
}

/// Create a checkpoint by tagging the current HEAD.
pub fn create_checkpoint(cwd: &str, name: &str) -> Result<CheckpointInfo, String> {
    // Validate name (no spaces or special chars that break git)
    let sanitized: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect();

    if sanitized.is_empty() {
        return Err("Checkpoint name cannot be empty".to_string());
    }

    let tag_name = format!("conductor/checkpoint/{}", sanitized);

    // Check if tag already exists
    let check = Command::new("git")
        .args(["tag", "-l", &tag_name])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    let existing = String::from_utf8_lossy(&check.stdout);
    if !existing.trim().is_empty() {
        return Err(format!("Checkpoint '{}' already exists", sanitized));
    }

    // Get current HEAD sha
    let head = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to get HEAD: {e}"))?;

    if !head.status.success() {
        return Err("No commits in repository".to_string());
    }

    let commit_sha = String::from_utf8_lossy(&head.stdout).trim().to_string();

    // Create the tag
    let result = Command::new("git")
        .args(["tag", &tag_name, "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to create tag: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("Failed to create checkpoint: {}", stderr));
    }

    // Get timestamp
    let ts = Command::new("git")
        .args(["log", "-1", "--format=%aI", &commit_sha])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to get timestamp: {e}"))?;

    let timestamp = String::from_utf8_lossy(&ts.stdout).trim().to_string();

    Ok(CheckpointInfo {
        id: tag_name.clone(),
        name: sanitized,
        timestamp,
        commit_sha,
    })
}

/// List all conductor checkpoints in the repo.
pub fn list_checkpoints(cwd: &str) -> Result<Vec<CheckpointInfo>, String> {
    let output = Command::new("git")
        .args(["tag", "-l", "conductor/checkpoint/*", "--sort=-creatordate"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to list tags: {e}"))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut checkpoints = Vec::new();

    for tag in stdout.lines() {
        let tag = tag.trim();
        if tag.is_empty() {
            continue;
        }

        let name = tag
            .strip_prefix("conductor/checkpoint/")
            .unwrap_or(tag)
            .to_string();

        // Get commit sha for this tag
        let sha_output = Command::new("git")
            .args(["rev-list", "-1", tag])
            .current_dir(cwd)
            .output()
            .ok();

        let commit_sha = sha_output
            .as_ref()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        // Get timestamp
        let ts_output = Command::new("git")
            .args(["log", "-1", "--format=%aI", tag])
            .current_dir(cwd)
            .output()
            .ok();

        let timestamp = ts_output
            .as_ref()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        checkpoints.push(CheckpointInfo {
            id: tag.to_string(),
            name,
            timestamp,
            commit_sha,
        });
    }

    Ok(checkpoints)
}

/// Restore a checkpoint by checking out the tagged commit.
pub fn restore_checkpoint(cwd: &str, checkpoint_id: &str) -> Result<(), String> {
    // Validate the checkpoint exists
    let check = Command::new("git")
        .args(["tag", "-l", checkpoint_id])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to verify checkpoint: {e}"))?;

    let existing = String::from_utf8_lossy(&check.stdout);
    if existing.trim().is_empty() {
        return Err(format!("Checkpoint '{}' not found", checkpoint_id));
    }

    // Check for uncommitted changes
    let status = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to check status: {e}"))?;

    let status_text = String::from_utf8_lossy(&status.stdout);
    if !status_text.trim().is_empty() {
        return Err("Cannot restore checkpoint: you have uncommitted changes. Please commit or stash them first.".to_string());
    }

    // Checkout the tag
    let result = Command::new("git")
        .args(["checkout", checkpoint_id])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to restore checkpoint: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("Failed to restore checkpoint: {}", stderr));
    }

    Ok(())
}
