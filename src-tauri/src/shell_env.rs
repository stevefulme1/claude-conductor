use parking_lot::Mutex;
use std::collections::HashMap;
use std::process::Command;

static SHELL_ENV: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

pub fn get_shell_env() -> HashMap<String, String> {
    let mut guard = SHELL_ENV.lock();
    if let Some(ref cached) = *guard {
        return cached.clone();
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let env_map = match Command::new(&shell)
        .args(["-l", "-c", "env -0"])
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut map = HashMap::new();
            for entry in stdout.split('\0') {
                if let Some((key, value)) = entry.split_once('=') {
                    if !key.is_empty() && !key.contains('\n') {
                        map.insert(key.to_string(), value.to_string());
                    }
                }
            }
            map
        }
        Err(e) => {
            log::warn!("Failed to capture shell environment: {}", e);
            std::env::vars().collect()
        }
    };

    *guard = Some(env_map.clone());
    env_map
}

pub fn resolve_executable(name: &str, env: &HashMap<String, String>) -> Option<String> {
    let well_known = [
        dirs::home_dir().map(|h| h.join(".local/bin").join(name)),
        dirs::home_dir().map(|h| h.join(format!(".nvm/versions/node/current/bin/{name}"))),
        Some(std::path::PathBuf::from(format!("/usr/local/bin/{name}"))),
        Some(std::path::PathBuf::from(format!("/opt/homebrew/bin/{name}"))),
    ];

    if let Some(path_var) = env.get("PATH") {
        for dir in path_var.split(':') {
            let candidate = std::path::PathBuf::from(dir).join(name);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }

    for path in well_known.iter().flatten() {
        if path.is_file() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    if let Ok(output) = Command::new("/bin/sh")
        .args(["-l", "-c", &format!("which {name}")])
        .output()
    {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() && std::path::Path::new(&path).is_file() {
            return Some(path);
        }
    }

    None
}
