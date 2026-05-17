use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head_commit: String,
    pub is_prunable: bool,
}

/// Create a git worktree for a given repo, returning the worktree path.
/// Places worktrees in a sibling directory: ../<repo-name>-worktrees/<branch_name>
pub fn create_worktree(repo_path: &str, branch_name: &str) -> Result<String, String> {
    let repo = Path::new(repo_path);
    if !repo.is_dir() {
        return Err(format!("Repository path does not exist: {repo_path}"));
    }

    let repo_name = repo
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repo".to_string());

    let parent = repo
        .parent()
        .ok_or_else(|| "Cannot determine parent directory of repo".to_string())?;

    let worktree_base = parent.join(format!("{repo_name}-worktrees"));
    std::fs::create_dir_all(&worktree_base)
        .map_err(|e| format!("Failed to create worktree directory: {e}"))?;

    let worktree_path = worktree_base.join(branch_name);
    let worktree_str = worktree_path.to_string_lossy().to_string();

    let output = Command::new("git")
        .args(["worktree", "add", &worktree_str, "-b", branch_name])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree add: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If branch already exists, try without -b
        if stderr.contains("already exists") {
            let output2 = Command::new("git")
                .args(["worktree", "add", &worktree_str, branch_name])
                .current_dir(repo_path)
                .output()
                .map_err(|e| format!("Failed to run git worktree add: {e}"))?;

            if !output2.status.success() {
                let stderr2 = String::from_utf8_lossy(&output2.stderr);
                return Err(format!("git worktree add failed: {stderr2}"));
            }
        } else {
            return Err(format!("git worktree add failed: {stderr}"));
        }
    }

    Ok(worktree_str)
}

/// List all worktrees for a given repo.
pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, String> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree list: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree list failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();
    let mut current_head = String::new();
    let mut current_prunable = false;

    for line in stdout.lines() {
        if line.starts_with("worktree ") {
            if !current_path.is_empty() {
                worktrees.push(WorktreeInfo {
                    path: current_path.clone(),
                    branch: current_branch.clone(),
                    head_commit: current_head.clone(),
                    is_prunable: current_prunable,
                });
            }
            current_path = line.trim_start_matches("worktree ").to_string();
            current_branch = String::new();
            current_head = String::new();
            current_prunable = false;
        } else if line.starts_with("HEAD ") {
            current_head = line.trim_start_matches("HEAD ").to_string();
        } else if line.starts_with("branch ") {
            let full_ref = line.trim_start_matches("branch ");
            current_branch = full_ref
                .strip_prefix("refs/heads/")
                .unwrap_or(full_ref)
                .to_string();
        } else if line == "prunable" {
            current_prunable = true;
        }
    }

    // Push the last entry
    if !current_path.is_empty() {
        worktrees.push(WorktreeInfo {
            path: current_path,
            branch: current_branch,
            head_commit: current_head,
            is_prunable: current_prunable,
        });
    }

    Ok(worktrees)
}

/// Remove a git worktree.
pub fn remove_worktree(worktree_path: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["worktree", "remove", worktree_path, "--force"])
        .output()
        .map_err(|e| format!("Failed to run git worktree remove: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree remove failed: {stderr}"));
    }

    Ok(())
}

/// Prune stale worktree references.
pub fn prune_worktrees(repo_path: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree prune: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree prune failed: {stderr}"));
    }

    Ok(())
}
