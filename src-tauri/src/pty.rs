use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::thread;
use tauri::{AppHandle, Emitter};

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

static PTY_MAP: Mutex<Option<HashMap<String, PtyInstance>>> = Mutex::new(None);

fn with_map<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, PtyInstance>) -> R,
{
    let mut guard = PTY_MAP.lock();
    let map = guard.get_or_insert_with(HashMap::new);
    f(map)
}

pub fn spawn_pty(
    app: AppHandle,
    session_id: String,
    claude_session_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut cmd = CommandBuilder::new("claude");
    cmd.arg("--resume");
    cmd.arg(&claude_session_id);
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;

    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {e}"))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {e}"))?;

    let sid = session_id.clone();
    let app_clone = app.clone();

    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("pty-output-{}", sid), data);
                }
                Err(_) => break,
            }
        }
        let exit_status = child.wait().ok();
        let code = exit_status
            .map(|s| s.exit_code() as i32)
            .unwrap_or(-1);
        let _ = app_clone.emit(&format!("pty-exit-{}", sid), code);
    });

    with_map(|map| {
        map.insert(
            session_id,
            PtyInstance {
                writer,
                master: pair.master,
            },
        );
    });

    Ok(())
}

pub fn write_pty(session_id: &str, data: &str) -> Result<(), String> {
    with_map(|map| {
        if let Some(instance) = map.get_mut(session_id) {
            instance
                .writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("Write failed: {e}"))?;
            instance
                .writer
                .flush()
                .map_err(|e| format!("Flush failed: {e}"))?;
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    })
}

pub fn resize_pty(session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
    with_map(|map| {
        if let Some(instance) = map.get(session_id) {
            instance
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Resize failed: {e}"))?;
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    })
}

pub fn kill_pty(session_id: &str) {
    with_map(|map| {
        map.remove(session_id);
    });
}
