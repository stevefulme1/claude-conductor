mod analytics;
mod chaining;
mod checkpoints;
mod code_search;
mod config;
mod digest;
mod file_tracker;
mod git_graph;
mod marketplace;
mod pty;
mod sessions;
mod sharing;
mod shell_env;
mod sso;
mod worktree;

use sessions::SessionMeta;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[tauri::command]
fn list_sessions() -> Result<Vec<SessionMeta>, String> {
    sessions::discover_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {e}"))?;
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let allowed = home.join(".claude").join("projects");
    if !path.starts_with(&allowed) {
        return Err("Path is not within the sessions directory".to_string());
    }
    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
        return Err("Only .jsonl session files can be deleted".to_string());
    }
    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete session: {e}"))
}

#[tauri::command]
fn spawn_terminal(
    app: tauri::AppHandle,
    session_id: String,
    claude_session_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    command: String,
) -> Result<(), String> {
    if !Path::new(&cwd).is_dir() {
        return Err(format!("Directory does not exist: {cwd}"));
    }
    pty::spawn_pty(app, session_id, claude_session_id, cwd, cols, rows, command)
}

#[tauri::command]
fn write_terminal(session_id: String, data: String) -> Result<(), String> {
    pty::write_pty(&session_id, &data)
}

#[tauri::command]
fn resize_terminal(session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    pty::resize_pty(&session_id, cols, rows)
}

#[tauri::command]
fn kill_terminal(session_id: String) -> Result<(), String> {
    pty::kill_pty(&session_id)
}

#[tauri::command]
fn pause_terminal(session_id: String) -> Result<(), String> {
    pty::pause_pty(&session_id)
}

#[tauri::command]
fn resume_terminal(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    pty::resume_pty(&session_id, &app)
}

#[tauri::command]
fn refresh_digest() -> Result<String, String> {
    digest::write_digest().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_digest() -> Result<String, String> {
    digest::generate_digest().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_config() -> Result<config::ClaudeConfig, String> {
    config::read_config().map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_mcp() -> Result<HashMap<String, config::McpStatus>, String> {
    config::verify_mcp_tools().map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_mcp_single(name: String) -> Result<config::McpStatus, String> {
    config::verify_mcp_server(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_mcp_env(update: config::McpEnvUpdate) -> Result<(), String> {
    config::update_mcp_env(update).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_mcp_auth(server_name: String, token: String) -> Result<(), String> {
    config::update_mcp_auth_header(&server_name, &token).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_mcp(server_name: String, enabled: bool) -> Result<(), String> {
    config::toggle_mcp_server(&server_name, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_mcp(server: config::NewMcpServer) -> Result<(), String> {
    config::add_mcp_server(server).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_sso(app: tauri::AppHandle, config: sso::SsoConfig) -> Result<sso::SsoStartResult, String> {
    sso::start_sso_flow(app, config).map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_sso() -> Result<(), String> {
    sso::cancel_sso_flow().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_labels() -> Result<HashMap<String, String>, String> {
    config::get_session_labels().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_session_label(session_id: String, label: String) -> Result<(), String> {
    config::set_session_label(&session_id, &label).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_worktree(repo_path: String, branch_name: String) -> Result<String, String> {
    worktree::create_worktree(&repo_path, &branch_name)
}

#[tauri::command]
fn list_worktrees(repo_path: String) -> Result<Vec<worktree::WorktreeInfo>, String> {
    worktree::list_worktrees(&repo_path)
}

#[tauri::command]
fn remove_worktree(worktree_path: String) -> Result<(), String> {
    worktree::remove_worktree(&worktree_path)
}

#[tauri::command]
fn get_file_changes(cwd: String) -> Result<Vec<file_tracker::FileChange>, String> {
    file_tracker::get_file_changes(&cwd)
}

#[tauri::command]
fn get_file_diff(cwd: String, file_path: String) -> Result<String, String> {
    file_tracker::get_file_diff(&cwd, &file_path)
}

#[tauri::command]
fn get_session_usage(file_path: String) -> Result<analytics::SessionUsage, String> {
    analytics::get_session_usage(&file_path)
}

#[tauri::command]
fn create_checkpoint(cwd: String, name: String) -> Result<checkpoints::CheckpointInfo, String> {
    checkpoints::create_checkpoint(&cwd, &name)
}

#[tauri::command]
fn list_checkpoints(cwd: String) -> Result<Vec<checkpoints::CheckpointInfo>, String> {
    checkpoints::list_checkpoints(&cwd)
}

#[tauri::command]
fn restore_checkpoint(cwd: String, checkpoint_id: String) -> Result<(), String> {
    checkpoints::restore_checkpoint(&cwd, &checkpoint_id)
}

// P2: Session Statuses
#[tauri::command]
fn get_session_statuses() -> Result<HashMap<String, String>, String> {
    config::get_session_statuses().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_session_status(session_id: String, status: String) -> Result<(), String> {
    config::set_session_status(&session_id, &status).map_err(|e| e.to_string())
}

// P2: Agent Profiles
#[tauri::command]
fn get_agent_profiles() -> Result<Vec<config::AgentProfile>, String> {
    config::get_agent_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_agent_profile(profile: config::AgentProfile) -> Result<(), String> {
    config::save_agent_profile(profile).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_agent_profile(name: String) -> Result<(), String> {
    config::delete_agent_profile(&name).map_err(|e| e.to_string())
}

// P2: Dev Server Detection
#[tauri::command]
fn check_port(port: u16) -> Result<bool, String> {
    config::check_port(port).map_err(|e| e.to_string())
}

#[tauri::command]
fn detect_dev_servers() -> Result<Vec<config::DevServer>, String> {
    config::detect_dev_servers().map_err(|e| e.to_string())
}

// P3: Code Search
#[tauri::command]
fn search_code(
    cwd: String,
    query: String,
    file_extensions: Option<Vec<String>>,
) -> Result<Vec<code_search::SearchResult>, String> {
    code_search::search_code(&cwd, &query, file_extensions)
}

// P3: Git Visualization
#[tauri::command]
fn get_git_log(cwd: String, limit: u32) -> Result<Vec<git_graph::GitLogEntry>, String> {
    git_graph::get_git_log(&cwd, limit)
}

// P3: Session Sharing
#[tauri::command]
fn export_session(file_path: String) -> Result<String, String> {
    sharing::export_session(&file_path)
}

#[tauri::command]
fn save_export(dest_path: String, content: String) -> Result<(), String> {
    sharing::save_export(&dest_path, &content)
}

#[tauri::command]
fn get_status() -> Result<serde_json::Value, String> {
    let pty_count = pty::pty_count();
    let sessions = sessions::discover_sessions()
        .map(|s| s.len())
        .unwrap_or(0);

    let sys_info = serde_json::json!({
        "active_ptys": pty_count,
        "discovered_sessions": sessions,
        "uptime_seconds": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        "pid": std::process::id(),
    });

    Ok(sys_info)
}

// Tier 1: Session Cost Calculator
#[tauri::command]
fn get_daily_usage() -> Result<analytics::DailyUsage, String> {
    analytics::get_daily_usage()
}

// Tier 1: Session Replay
#[tauri::command]
fn get_session_transcript(file_path: String) -> Result<Vec<analytics::ReplayMessage>, String> {
    analytics::get_session_transcript(&file_path)
}

// Tier 1: Agent Handoff / Session Chaining
#[tauri::command]
fn create_chain(name: String, steps: Vec<chaining::ChainStep>) -> Result<String, String> {
    chaining::create_chain(&name, steps)
}

#[tauri::command]
fn get_chain(chain_id: String) -> Result<chaining::SessionChain, String> {
    chaining::get_chain(&chain_id)
}

#[tauri::command]
fn list_chains() -> Result<Vec<chaining::SessionChain>, String> {
    chaining::list_chains()
}

#[tauri::command]
fn advance_chain(chain_id: String) -> Result<chaining::ChainStep, String> {
    chaining::advance_chain(&chain_id)
}

#[tauri::command]
fn delete_chain(chain_id: String) -> Result<(), String> {
    chaining::delete_chain(&chain_id)
}

// Tier 1: Session Templates
#[tauri::command]
fn get_session_templates() -> Result<Vec<config::SessionTemplate>, String> {
    config::get_session_templates().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_session_template(template: config::SessionTemplate) -> Result<(), String> {
    config::save_session_template(template).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session_template(name: String) -> Result<(), String> {
    config::delete_session_template(&name).map_err(|e| e.to_string())
}

// Tier 1: MCP Marketplace
#[tauri::command]
fn list_marketplace() -> Result<Vec<marketplace::McpServerEntry>, String> {
    marketplace::list_marketplace()
}

#[tauri::command]
fn install_mcp_from_marketplace(name: String) -> Result<(), String> {
    marketplace::install_mcp_from_marketplace(&name)
}

fn start_digest_timer(shutdown: Arc<AtomicBool>) {
    thread::spawn(move || {
        while !shutdown.load(Ordering::Relaxed) {
            match digest::write_digest() {
                Ok(path) => log::info!("Digest refreshed: {}", path),
                Err(e) => log::warn!("Digest refresh failed: {}", e),
            }
            for _ in 0..60 {
                if shutdown.load(Ordering::Relaxed) { return; }
                thread::sleep(Duration::from_secs(5));
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(level)
                    .build(),
            )?;

            let shutdown = Arc::new(AtomicBool::new(false));
            start_digest_timer(shutdown);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            delete_session,
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
            pause_terminal,
            resume_terminal,
            refresh_digest,
            get_digest,
            get_config,
            verify_mcp,
            verify_mcp_single,
            update_mcp_env,
            update_mcp_auth,
            toggle_mcp,
            add_mcp,
            start_sso,
            cancel_sso,
            get_session_labels,
            set_session_label,
            create_worktree,
            list_worktrees,
            remove_worktree,
            get_file_changes,
            get_file_diff,
            get_session_usage,
            create_checkpoint,
            list_checkpoints,
            restore_checkpoint,
            get_status,
            get_session_statuses,
            set_session_status,
            get_agent_profiles,
            save_agent_profile,
            delete_agent_profile,
            check_port,
            detect_dev_servers,
            search_code,
            get_git_log,
            export_session,
            save_export,
            get_daily_usage,
            get_session_transcript,
            create_chain,
            get_chain,
            list_chains,
            advance_chain,
            delete_chain,
            get_session_templates,
            save_session_template,
            delete_session_template,
            list_marketplace,
            install_mcp_from_marketplace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
