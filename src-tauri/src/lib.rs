mod sessions;

use sessions::SessionMeta;
use std::path::Path;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            delete_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
