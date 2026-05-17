use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct FileChange {
    pub path: String,
    pub status: String,  // "added", "modified", "deleted", "renamed", "copied"
    pub staged: bool,
}

fn parse_status_char(c: char) -> &'static str {
    match c {
        'A' => "added",
        'M' => "modified",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        'T' => "modified",
        _ => "modified",
    }
}

/// Get all file changes in a git working directory.
/// Combines staged changes, unstaged changes, and untracked files.
pub fn get_file_changes(cwd: &str) -> Result<Vec<FileChange>, String> {
    let mut changes: Vec<FileChange> = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    // Check if this is a git repository
    let check = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !check.status.success() {
        return Ok(Vec::new()); // Not a git repo, return empty
    }

    // Check if there are any commits yet
    let has_commits = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(cwd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if has_commits {
        // Staged changes: git diff --name-status --staged HEAD
        let staged_output = Command::new("git")
            .args(["diff", "--name-status", "--staged", "HEAD"])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run git diff --staged: {e}"))?;

        if staged_output.status.success() {
            let stdout = String::from_utf8_lossy(&staged_output.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.splitn(2, '\t').collect();
                if parts.len() == 2 {
                    let status_char = parts[0].chars().next().unwrap_or('M');
                    let path = parts[1].to_string();
                    seen_paths.insert(path.clone());
                    changes.push(FileChange {
                        path,
                        status: parse_status_char(status_char).to_string(),
                        staged: true,
                    });
                }
            }
        }

        // Unstaged changes: git diff --name-status HEAD
        let unstaged_output = Command::new("git")
            .args(["diff", "--name-status"])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run git diff: {e}"))?;

        if unstaged_output.status.success() {
            let stdout = String::from_utf8_lossy(&unstaged_output.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.splitn(2, '\t').collect();
                if parts.len() == 2 {
                    let status_char = parts[0].chars().next().unwrap_or('M');
                    let path = parts[1].to_string();
                    if !seen_paths.contains(&path) {
                        seen_paths.insert(path.clone());
                        changes.push(FileChange {
                            path,
                            status: parse_status_char(status_char).to_string(),
                            staged: false,
                        });
                    }
                }
            }
        }
    }

    // Untracked files: git ls-files --others --exclude-standard
    let untracked_output = Command::new("git")
        .args(["ls-files", "--others", "--exclude-standard"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git ls-files: {e}"))?;

    if untracked_output.status.success() {
        let stdout = String::from_utf8_lossy(&untracked_output.stdout);
        for line in stdout.lines() {
            let path = line.trim().to_string();
            if !path.is_empty() && !seen_paths.contains(&path) {
                changes.push(FileChange {
                    path,
                    status: "added".to_string(),
                    staged: false,
                });
            }
        }
    }

    // Sort: staged first, then by path
    changes.sort_by(|a, b| {
        b.staged.cmp(&a.staged).then_with(|| a.path.cmp(&b.path))
    });

    Ok(changes)
}

/// Get unified diff for a specific file against HEAD.
pub fn get_file_diff(cwd: &str, file_path: &str) -> Result<String, String> {
    // Check if this is a git repository
    let check = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !check.status.success() {
        return Err("Not a git repository".to_string());
    }

    // Check if there are any commits
    let has_commits = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(cwd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if has_commits {
        // Try staged diff first, then unstaged
        let staged = Command::new("git")
            .args(["diff", "--staged", "HEAD", "--", file_path])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run git diff: {e}"))?;

        let staged_text = String::from_utf8_lossy(&staged.stdout).to_string();

        let unstaged = Command::new("git")
            .args(["diff", "HEAD", "--", file_path])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run git diff: {e}"))?;

        let unstaged_text = String::from_utf8_lossy(&unstaged.stdout).to_string();

        // Return whichever has content (prefer unstaged as it shows current state)
        if !unstaged_text.trim().is_empty() {
            return Ok(unstaged_text);
        }
        if !staged_text.trim().is_empty() {
            return Ok(staged_text);
        }
    }

    // For untracked files, show entire content as added
    let full_path = std::path::Path::new(cwd).join(file_path);
    if full_path.exists() {
        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file: {e}"))?;
        let lines: Vec<&str> = content.lines().collect();
        let mut diff = format!("--- /dev/null\n+++ b/{}\n@@ -0,0 +1,{} @@\n", file_path, lines.len());
        for line in &lines {
            diff.push('+');
            diff.push_str(line);
            diff.push('\n');
        }
        return Ok(diff);
    }

    Ok(String::new())
}
