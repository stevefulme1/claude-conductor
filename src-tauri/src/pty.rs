use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const FLUSH_INTERVAL: Duration = Duration::from_millis(16);
const FLUSH_THRESHOLD: usize = 32 * 1024;
const MAX_PENDING: usize = 4 * 1024 * 1024; // 4MB cap for paused output

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    reader_handle: Option<JoinHandle<()>>,
    paused: Arc<AtomicBool>,
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
    if !claude_session_id.is_empty() {
        cmd.arg("--resume");
        cmd.arg(&claude_session_id);
    }
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
    let paused = Arc::new(AtomicBool::new(false));
    let paused_clone = paused.clone();

    let reader_handle = thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut carry = Vec::new();
        let mut pending = String::new();
        let mut last_flush = Instant::now();
        let event_name = format!("pty-output-{}", sid);

        let flush = |pending: &mut String, app: &AppHandle, event: &str| -> bool {
            if pending.is_empty() {
                return true;
            }
            let data = std::mem::take(pending);
            app.emit(event, data).is_ok()
        };

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
                        let text = String::from_utf8_lossy(&buf[..boundary]);
                        let is_paused = paused_clone.load(Ordering::Relaxed);
                        pending.push_str(&text);
                        if is_paused {
                            // Cap pending buffer to prevent OOM
                            if pending.len() > MAX_PENDING {
                                let drain = pending.len() - MAX_PENDING;
                                pending.drain(..drain);
                            }
                        } else {
                            let should_flush = pending.len() >= FLUSH_THRESHOLD
                                || last_flush.elapsed() >= FLUSH_INTERVAL;
                            if should_flush {
                                if !flush(&mut pending, &app_clone, &event_name) {
                                    log::warn!("Event channel closed for session {}, stopping reader", sid);
                                    break;
                                }
                                last_flush = Instant::now();
                            }
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

            // Flush pending if unpaused and timer expired (handles idle periods)
            if !paused_clone.load(Ordering::Relaxed) && !pending.is_empty()
                && last_flush.elapsed() >= FLUSH_INTERVAL
            {
                if !flush(&mut pending, &app_clone, &event_name) {
                    break;
                }
                last_flush = Instant::now();
            }

            if !carry.is_empty() && carry.len() >= 4 {
                pending.push_str(&String::from_utf8_lossy(&carry));
                carry.clear();
            }
        }

        if !carry.is_empty() {
            pending.push_str(&String::from_utf8_lossy(&carry));
        }
        let _ = flush(&mut pending, &app_clone, &event_name);

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
            paused,
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

pub fn pause_pty(session_id: &str) -> Result<(), String> {
    let guard = PTY_MAP.lock();
    if let Some(map) = guard.as_ref() {
        if let Some(instance) = map.get(session_id) {
            instance.paused.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

pub fn resume_pty(session_id: &str, app: &AppHandle) -> Result<(), String> {
    let guard = PTY_MAP.lock();
    if let Some(map) = guard.as_ref() {
        if let Some(instance) = map.get(session_id) {
            instance.paused.store(false, Ordering::Relaxed);
        }
    }
    drop(guard);
    // The reader thread will flush pending output on the next read cycle
    // since paused is now false. Emit a nudge event so the frontend knows
    // to expect data.
    let _ = app.emit(&format!("pty-resumed-{}", session_id), ());
    Ok(())
}

pub fn pty_count() -> usize {
    let guard = PTY_MAP.lock();
    guard.as_ref().map(|m| m.len()).unwrap_or(0)
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
