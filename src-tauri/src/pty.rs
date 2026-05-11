use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    reader_handle: Option<JoinHandle<()>>,
}

static PTY_MAP: Mutex<Option<HashMap<String, PtyInstance>>> = Mutex::new(None);

fn validate_size(cols: u16, rows: u16) -> Result<(), String> {
    if cols == 0 || cols > 500 {
        return Err(format!("Invalid cols {cols}: must be 1..=500"));
    }
    if rows == 0 || rows > 200 {
        return Err(format!("Invalid rows {rows}: must be 1..=200"));
    }
    Ok(())
}

pub fn spawn_pty(
    app: AppHandle,
    session_id: String,
    claude_session_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    validate_size(cols, rows)?;

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

    let reader_handle = thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("pty-output-{}", sid), data);
                }
                Err(e) => {
                    log::debug!("PTY reader error for {}: {}", sid, e);
                    break;
                }
            }
        }

        let exit_status = child.wait().ok();
        let code = exit_status
            .map(|s| s.exit_code() as i32)
            .unwrap_or(-1);
        let _ = app_clone.emit(&format!("pty-exit-{}", sid), code);
    });

    let mut guard = PTY_MAP.lock();
    let map = guard.get_or_insert_with(HashMap::new);
    map.insert(
        session_id,
        PtyInstance {
            writer,
            master: pair.master,
            reader_handle: Some(reader_handle),
        },
    );

    Ok(())
}

pub fn write_pty(session_id: &str, data: &str) -> Result<(), String> {
    let mut guard = PTY_MAP.lock();
    let map = guard.get_or_insert_with(HashMap::new);
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
}

pub fn resize_pty(session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
    validate_size(cols, rows)?;

    let mut guard = PTY_MAP.lock();
    let map = guard.get_or_insert_with(HashMap::new);
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
}

pub fn kill_pty(session_id: &str) -> Result<(), String> {
    let instance = {
        let mut guard = PTY_MAP.lock();
        let map = guard.get_or_insert_with(HashMap::new);
        map.remove(session_id)
    };

    let Some(mut instance) = instance else {
        return Ok(());
    };

    drop(instance.writer);
    drop(instance.master);

    if let Some(handle) = instance.reader_handle.take() {
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let _ = handle.join();
            let _ = tx.send(());
        });
        if rx.recv_timeout(Duration::from_secs(5)).is_err() {
            log::warn!("Reader thread for {} did not exit within 5s", session_id);
        }
    }

    Ok(())
}
