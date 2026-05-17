mod config;
mod digest;
mod pty;
mod sessions;
mod shell_env;
mod sso;

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
) -> Result<(), String> {
    if !Path::new(&cwd).is_dir() {
        return Err(format!("Directory does not exist: {cwd}"));
    }
    pty::spawn_pty(app, session_id, claude_session_id, cwd, cols, rows)
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
            get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
