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

fn find_utf8_boundary(buf: &[u8], len: usize) -> usize {
    if len == 0 {
        return 0;
    }
    if std::str::from_utf8(&buf[..len]).is_ok() {
        return len;
    }
    let mut end = len;
    while end > 0 && end > len.saturating_sub(4) {
        end -= 1;
        if std::str::from_utf8(&buf[..end]).is_ok() {
            return end;
        }
    }
    len
}

fn get_shell_env() -> HashMap<String, String> {
    crate::shell_env::get_shell_env()
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

    let shell_env = get_shell_env();

    let claude_path = crate::shell_env::resolve_executable("claude", &shell_env)
        .ok_or_else(|| "Failed to launch claude: 'claude' not found in PATH. Install it with: npm install -g @anthropic-ai/claude-code".to_string())?;

    let mut cmd = CommandBuilder::new(claude_path);
    cmd.arg("--resume");
    cmd.arg(&claude_session_id);
    cmd.cwd(&cwd);

    for (key, value) in &shell_env {
        cmd.env(key, value);
    }

    cmd.env("TERM", "xterm-256color");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

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
        let mut buf = [0u8; 8192];
        let mut carry = Vec::new();

        loop {
            let offset = carry.len();
            let read_start = offset;

            if offset > 0 {
                buf[..offset].copy_from_slice(&carry);
                carry.clear();
            }

            match reader.read(&mut buf[read_start..]) {
                Ok(0) => break,
                Ok(n) => {
                    let total = read_start + n;
                    let boundary = find_utf8_boundary(&buf, total);

                    if boundary > 0 {
                        let text = String::from_utf8_lossy(&buf[..boundary]).to_string();
                        if app_clone.emit(&format!("pty-output-{}", sid), text).is_err() {
                            log::warn!("Event channel closed for session {}, stopping reader", sid);
                            break;
                        }
                    }

                    if boundary < total {
                        carry.extend_from_slice(&buf[boundary..total]);
                    }
                }
                Err(e) => {
                    log::debug!("PTY reader error for {}: {}", sid, e);
                    break;
                }
            }

            if !carry.is_empty() && carry.len() >= 4 {
                let text = String::from_utf8_lossy(&carry).to_string();
                if app_clone.emit(&format!("pty-output-{}", sid), text).is_err() {
                    break;
                }
                carry.clear();
            }
        }

        if !carry.is_empty() {
            let text = String::from_utf8_lossy(&carry).to_string();
            let _ = app_clone.emit(&format!("pty-output-{}", sid), text);
        }

        let exit_status = match child.wait() {
            Ok(status) => status.exit_code() as i32,
            Err(e) => {
                log::warn!("Failed to wait for child process {}: {}", sid, e);
                -1
            }
        };
        if let Err(e) = app_clone.emit(&format!("pty-exit-{}", sid), exit_status) {
            log::warn!("Failed to emit exit event for session {}: {}", sid, e);
        }
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
