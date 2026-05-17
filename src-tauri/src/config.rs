use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

static CONFIG_WRITE_LOCK: parking_lot::Mutex<()> = parking_lot::Mutex::new(());

#[derive(Debug, Clone, Serialize)]
pub struct McpServer {
    pub name: String,
    pub server_type: String,
    pub command_or_url: String,
    pub args: Vec<String>,
    pub has_env: bool,
    pub has_auth: bool,
    pub env_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpStatus {
    pub reachable: bool,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeConfig {
    pub mcp_servers: Vec<McpServer>,
    pub plugins: Vec<String>,
    pub model: String,
    pub config_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct McpEnvUpdate {
    pub server_name: String,
    pub env_vars: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewMcpServer {
    pub name: String,
    pub server_type: String,
    pub command_or_url: String,
    pub args: Vec<String>,
    pub env_vars: HashMap<String, String>,
    pub auth_token: String,
}

fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude.json")
}

fn settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("settings.json")
}

fn write_config_file(path: &PathBuf, content: &str) -> Result<(), Box<dyn std::error::Error>> {
    // Atomic write: write to temp file with restricted permissions, then rename
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let tmp_path = dir.join(format!(".{}.tmp", path.file_name().unwrap_or_default().to_string_lossy()));

    fs::write(&tmp_path, content)?;
    #[cfg(unix)]
    {
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(&tmp_path, perms)?;
    }
    fs::rename(&tmp_path, path)?;
    Ok(())
}

fn read_raw_config() -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let mut merged = serde_json::json!({});

    // Read ~/.claude.json
    let cfg_path = config_path();
    if cfg_path.exists() {
        let data = fs::read_to_string(&cfg_path)?;
        merged = serde_json::from_str(&data)?;
    }

    // Merge ~/.claude/.mcp.json MCP servers
    let mcp_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join(".mcp.json");
    if mcp_path.exists() {
        if let Ok(data) = fs::read_to_string(&mcp_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(servers) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
                    let merged_servers = merged
                        .as_object_mut()
                        .unwrap()
                        .entry("mcpServers")
                        .or_insert_with(|| serde_json::json!({}));
                    if let Some(obj) = merged_servers.as_object_mut() {
                        for (name, val) in servers {
                            if !obj.contains_key(name) {
                                obj.insert(name.clone(), val.clone());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(merged)
}

pub fn read_config() -> Result<ClaudeConfig, Box<dyn std::error::Error>> {
    let mut mcp_servers = Vec::new();
    let mut plugins = Vec::new();
    let mut model = String::new();
    let mut config_paths = Vec::new();

    let cfg_path = config_path();
    if cfg_path.exists() {
        config_paths.push(cfg_path.to_string_lossy().to_string());
        let parsed = read_raw_config()?;

        if let Some(servers) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
            for (name, server) in servers {
                let server_type = server
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let command_or_url = if server_type == "http" {
                    server
                        .get("url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                } else {
                    server
                        .get("command")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                };

                let args = server
                    .get("args")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();

                let has_env = server
                    .get("env")
                    .and_then(|v| v.as_object())
                    .map(|o| !o.is_empty())
                    .unwrap_or(false);

                let has_auth = server
                    .get("headers")
                    .and_then(|v| v.as_object())
                    .map(|h| {
                        h.keys()
                            .any(|k| k.to_lowercase() == "authorization")
                    })
                    .unwrap_or(false)
                    || has_env;

                let env_keys = server
                    .get("env")
                    .and_then(|v| v.as_object())
                    .map(|o| o.keys().cloned().collect())
                    .unwrap_or_default();

                mcp_servers.push(McpServer {
                    name: name.clone(),
                    server_type,
                    command_or_url,
                    args,
                    has_env,
                    has_auth,
                    env_keys,
                });
            }
        }
    }

    // Also read ~/.claude/.mcp.json (user-level MCP config used by Claude CLI)
    let mcp_json_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join(".mcp.json");
    if mcp_json_path.exists() {
        config_paths.push(mcp_json_path.to_string_lossy().to_string());
        if let Ok(data) = fs::read_to_string(&mcp_json_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(servers) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, server) in servers {
                        if mcp_servers.iter().any(|s| s.name == *name) {
                            continue;
                        }
                        let server_type = server
                            .get("type")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| {
                                if server.get("url").is_some() { "http".to_string() }
                                else { "stdio".to_string() }
                            });
                        let command_or_url = if server_type == "http" {
                            server.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string()
                        } else {
                            server.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string()
                        };
                        let args = server.get("args").and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                            .unwrap_or_default();
                        let has_env = server.get("env").and_then(|v| v.as_object()).map(|o| !o.is_empty()).unwrap_or(false);
                        let env_keys = server.get("env").and_then(|v| v.as_object())
                            .map(|o| o.keys().cloned().collect()).unwrap_or_default();
                        mcp_servers.push(McpServer {
                            name: name.clone(),
                            server_type,
                            command_or_url,
                            args,
                            has_env,
                            has_auth: has_env,
                            env_keys,
                        });
                    }
                }
            }
        }
    }

    let settings = settings_path();
    if settings.exists() {
        config_paths.push(settings.to_string_lossy().to_string());
        let data = fs::read_to_string(&settings)?;
        let parsed: serde_json::Value = serde_json::from_str(&data)?;

        if let Some(m) = parsed.get("model").and_then(|v| v.as_str()) {
            model = m.to_string();
        }

        if let Some(enabled) = parsed.get("enabledPlugins").and_then(|v| v.as_object()) {
            for (name, val) in enabled {
                if val.as_bool().unwrap_or(false) {
                    plugins.push(name.clone());
                }
            }
            plugins.sort();
        }
    }

    Ok(ClaudeConfig {
        mcp_servers,
        plugins,
        model,
        config_paths,
    })
}

fn check_stdio_server(server: &McpServer) -> McpStatus {
    let mut logs = Vec::new();
    let cmd = &server.command_or_url;

    if cmd.is_empty() {
        return McpStatus {
            reachable: false,
            logs: vec!["No command specified".into()],
        };
    }

    let shell_env = crate::shell_env::get_shell_env();
    let base = cmd.split('/').next_back().unwrap_or(cmd);
    logs.push(format!("Command: {cmd}"));

    let resolved_path = if std::path::Path::new(cmd).is_file() {
        Some(cmd.to_string())
    } else {
        crate::shell_env::resolve_executable(base, &shell_env)
    };

    let resolved_path = match resolved_path {
        Some(p) => {
            logs.push(format!("✓ Binary found: {p}"));
            p
        }
        None => {
            logs.push(format!("✗ Binary '{base}' not found on PATH"));
            logs.push("Ensure the command is installed and accessible".into());
            return McpStatus {
                reachable: false,
                logs,
            };
        }
    };

    if !server.args.is_empty() {
        logs.push(format!("Args: {}", server.args.join(" ")));
    }

    let raw_config = match read_raw_config() {
        Ok(c) => c,
        Err(e) => {
            logs.push(format!("✗ Failed to read config: {e}"));
            return McpStatus {
                reachable: false,
                logs,
            };
        }
    };
    let server_config = raw_config
        .get("mcpServers")
        .and_then(|s| s.get(&server.name));
    let env_obj = server_config
        .and_then(|s| s.get("env"))
        .and_then(|v| v.as_object());

    if let Some(env) = env_obj {
        let mut missing_env = Vec::new();
        for (key, val) in env {
            let val_str = val.as_str().unwrap_or("");
            if val_str.is_empty() {
                missing_env.push(key.clone());
            }
        }
        if missing_env.is_empty() {
            logs.push(format!("✓ All {} env vars configured", env.len()));
        } else {
            logs.push(format!(
                "✗ Missing env values: {}",
                missing_env.join(", ")
            ));
            return McpStatus {
                reachable: false,
                logs,
            };
        }
    }

    let mut spawn_cmd = std::process::Command::new(&resolved_path);
    for arg in &server.args {
        spawn_cmd.arg(arg);
    }

    for (key, val) in &shell_env {
        spawn_cmd.env(key, val);
    }

    if let Some(env) = env_obj {
        for (key, val) in env {
            if let Some(v) = val.as_str() {
                spawn_cmd.env(key, v);
            }
        }
    }

    spawn_cmd.stdin(std::process::Stdio::piped());
    spawn_cmd.stdout(std::process::Stdio::piped());
    spawn_cmd.stderr(std::process::Stdio::piped());

    match spawn_cmd.spawn() {
        Ok(mut child) => {
            let mut stdin_ok = false;
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let init_msg = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"conductor","version":"0.2.0"}}}"#;
                let header = format!("Content-Length: {}\r\n\r\n{}", init_msg.len(), init_msg);
                match stdin.write_all(header.as_bytes()).and_then(|_| stdin.flush()) {
                    Ok(()) => stdin_ok = true,
                    Err(e) => {
                        logs.push(format!("✗ Failed to send initialize message: {e}"));
                    }
                }
            }

            std::thread::sleep(Duration::from_millis(500));

            if let Err(e) = child.kill() {
                logs.push(format!("⚠ Could not terminate test process: {e}"));
            }
            let output = child.wait_with_output();

            match output {
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let stdout = String::from_utf8_lossy(&out.stdout);

                    if !stdout.is_empty() && stdout.contains("jsonrpc") {
                        logs.push("✓ Server responded to MCP initialize".into());
                        McpStatus {
                            reachable: true,
                            logs,
                        }
                    } else if !stderr.is_empty() {
                        let stderr_lines: Vec<&str> =
                            stderr.lines().take(5).collect();
                        logs.push("✗ Server started but returned errors:".into());
                        for line in stderr_lines {
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                logs.push(format!("  {trimmed}"));
                            }
                        }
                        McpStatus {
                            reachable: false,
                            logs,
                        }
                    } else if !stdin_ok {
                        McpStatus {
                            reachable: false,
                            logs,
                        }
                    } else {
                        logs.push("⚠ Server started but did not respond to MCP initialize".into());
                        logs.push("The process may be hanging or may not be an MCP server".into());
                        McpStatus {
                            reachable: false,
                            logs,
                        }
                    }
                }
                Err(e) => {
                    logs.push(format!("✗ Failed to collect output: {e}"));
                    McpStatus {
                        reachable: false,
                        logs,
                    }
                }
            }
        }
        Err(e) => {
            logs.push(format!("✗ Failed to spawn process: {e}"));
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                logs.push("Check file permissions on the command binary".into());
            }
            McpStatus {
                reachable: false,
                logs,
            }
        }
    }
}

fn check_http_server(server: &McpServer) -> McpStatus {
    let mut logs = Vec::new();
    let url = &server.command_or_url;

    if url.is_empty() {
        return McpStatus {
            reachable: false,
            logs: vec!["No URL configured".into()],
        };
    }

    logs.push(format!("URL: {url}"));

    let raw_config = match read_raw_config() {
        Ok(c) => c,
        Err(e) => {
            logs.push(format!("✗ Failed to read config: {e}"));
            return McpStatus {
                reachable: false,
                logs,
            };
        }
    };
    let server_config = raw_config
        .get("mcpServers")
        .and_then(|s| s.get(&server.name));

    let has_auth_header = server_config
        .and_then(|s| s.get("headers"))
        .and_then(|v| v.as_object())
        .map(|h| h.keys().any(|k| k.to_lowercase() == "authorization"))
        .unwrap_or(false);

    if has_auth_header {
        logs.push("✓ Authorization header configured".into());
    }

    let mut curl_config = String::new();
    curl_config.push_str(&format!("url = \"{url}\"\n"));
    curl_config.push_str("silent\n");
    curl_config.push_str("fail\n");
    curl_config.push_str("max-time = 5\n");
    curl_config.push_str("output = /dev/null\n");
    curl_config.push_str("write-out = \"%{http_code}\"\n");

    if let Some(headers) = server_config
        .and_then(|s| s.get("headers"))
        .and_then(|v| v.as_object())
    {
        for (key, val) in headers {
            if let Some(v) = val.as_str() {
                curl_config.push_str(&format!("header = \"{key}: {v}\"\n"));
            }
        }
    }

    let mut curl_cmd = std::process::Command::new("curl");
    curl_cmd.arg("--config").arg("-");
    curl_cmd.stdin(std::process::Stdio::piped());
    curl_cmd.stdout(std::process::Stdio::piped());
    curl_cmd.stderr(std::process::Stdio::piped());

    match curl_cmd.spawn() {
        Ok(mut child) => {
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(curl_config.as_bytes());
            }

            match child.wait_with_output() {
                Ok(output) => {
                    let code =
                        String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr);

                    match code.as_str() {
                        "200" | "204" | "301" | "302" | "405" => {
                            logs.push(format!("✓ Server reachable (HTTP {code})"));
                            McpStatus {
                                reachable: true,
                                logs,
                            }
                        }
                        "401" | "403" => {
                            logs.push(format!(
                                "✗ Authentication failed (HTTP {code})"
                            ));
                            if !has_auth_header {
                                logs.push(
                                    "No Authorization header configured — add credentials"
                                        .into(),
                                );
                            } else {
                                logs.push(
                                    "Check that your auth token is valid and not expired"
                                        .into(),
                                );
                            }
                            McpStatus {
                                reachable: false,
                                logs,
                            }
                        }
                        "" => {
                            let err_msg = stderr
                                .lines()
                                .take(3)
                                .collect::<Vec<_>>()
                                .join("; ");
                            logs.push(format!("✗ Connection failed: {err_msg}"));
                            if url.starts_with("https://") {
                                logs.push(
                                    "Check network connectivity and DNS resolution"
                                        .into(),
                                );
                            }
                            McpStatus {
                                reachable: false,
                                logs,
                            }
                        }
                        _ => {
                            logs.push(format!(
                                "✗ Unexpected response (HTTP {code})"
                            ));
                            McpStatus {
                                reachable: false,
                                logs,
                            }
                        }
                    }
                }
                Err(e) => {
                    logs.push(format!("✗ Failed to collect output: {e}"));
                    McpStatus {
                        reachable: false,
                        logs,
                    }
                }
            }
        }
        Err(e) => {
            logs.push(format!("✗ curl not available: {e}"));
            logs.push("Install curl or check PATH".into());
            McpStatus {
                reachable: false,
                logs,
            }
        }
    }
}

pub fn verify_mcp_server(name: &str) -> Result<McpStatus, Box<dyn std::error::Error>> {
    let config = read_config()?;
    let server = config
        .mcp_servers
        .iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("MCP server '{name}' not found"))?;

    Ok(match server.server_type.as_str() {
        "stdio" => check_stdio_server(server),
        "http" => check_http_server(server),
        _ => McpStatus {
            reachable: false,
            logs: vec![format!("Unknown server type: {}", server.server_type)],
        },
    })
}

pub fn verify_mcp_tools() -> Result<HashMap<String, McpStatus>, Box<dyn std::error::Error>> {
    let config = read_config()?;
    let mut status = HashMap::new();

    for server in &config.mcp_servers {
        let result = match server.server_type.as_str() {
            "stdio" => check_stdio_server(server),
            "http" => check_http_server(server),
            _ => McpStatus {
                reachable: false,
                logs: vec![format!("Unknown server type: {}", server.server_type)],
            },
        };
        status.insert(server.name.clone(), result);
    }

    Ok(status)
}

pub fn update_mcp_env(update: McpEnvUpdate) -> Result<(), Box<dyn std::error::Error>> {
    let _lock = CONFIG_WRITE_LOCK.lock();
    let cfg_path = config_path();
    let data = fs::read_to_string(&cfg_path)?;
    let mut parsed: serde_json::Value = serde_json::from_str(&data)?;

    let server = parsed
        .get_mut("mcpServers")
        .and_then(|s| s.get_mut(&update.server_name))
        .ok_or_else(|| format!("Server '{}' not found in config", update.server_name))?;

    let env = server
        .as_object_mut()
        .ok_or("Invalid server config")?
        .entry("env")
        .or_insert_with(|| serde_json::json!({}));

    let non_empty: HashMap<_, _> = update
        .env_vars
        .iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .collect();

    if non_empty.is_empty() {
        return Err("No non-empty values provided".into());
    }

    if let Some(env_obj) = env.as_object_mut() {
        for (key, value) in non_empty {
            env_obj.insert(key.clone(), serde_json::Value::String(value.clone()));
        }
    }

    let output = serde_json::to_string_pretty(&parsed)?;
    write_config_file(&cfg_path, &output)?;
    Ok(())
}

pub fn update_mcp_auth_header(
    server_name: &str,
    token: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let _lock = CONFIG_WRITE_LOCK.lock();
    let cfg_path = config_path();
    let data = fs::read_to_string(&cfg_path)?;
    let mut parsed: serde_json::Value = serde_json::from_str(&data)?;

    let server = parsed
        .get_mut("mcpServers")
        .and_then(|s| s.get_mut(server_name))
        .ok_or_else(|| format!("Server '{server_name}' not found in config"))?;

    let obj = server.as_object_mut().ok_or("Invalid server config")?;
    let headers = obj
        .entry("headers")
        .or_insert_with(|| serde_json::json!({}));

    if let Some(h) = headers.as_object_mut() {
        h.insert(
            "Authorization".into(),
            serde_json::Value::String(format!("Bearer {token}")),
        );
    }

    let output = serde_json::to_string_pretty(&parsed)?;
    write_config_file(&cfg_path, &output)?;
    Ok(())
}

pub fn toggle_mcp_server(
    server_name: &str,
    enabled: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let _lock = CONFIG_WRITE_LOCK.lock();
    let cfg_path = config_path();
    let data = fs::read_to_string(&cfg_path)?;
    let mut parsed: serde_json::Value = serde_json::from_str(&data)?;

    let servers = parsed
        .get_mut("mcpServers")
        .and_then(|s| s.as_object_mut())
        .ok_or("No mcpServers in config")?;

    if enabled {
        let disabled_path = config_path().with_extension("disabled-mcps.json");
        if !disabled_path.exists() {
            return Err(format!(
                "Cannot re-enable '{server_name}': no disabled servers file found"
            )
            .into());
        }
        let disabled_data = fs::read_to_string(&disabled_path)?;
        let disabled: serde_json::Value = serde_json::from_str(&disabled_data)?;
        let server_val = disabled
            .get(server_name)
            .ok_or_else(|| {
                format!("Server '{server_name}' not found in disabled servers")
            })?
            .clone();

        servers.insert(server_name.to_string(), server_val);

        let mut disabled_mut: serde_json::Value =
            serde_json::from_str(&disabled_data)?;
        if let Some(obj) = disabled_mut.as_object_mut() {
            obj.remove(server_name);
        }
        write_config_file(&disabled_path, &serde_json::to_string_pretty(&disabled_mut)?)?;
    } else if let Some(server_val) = servers.remove(server_name) {
        let disabled_path = config_path().with_extension("disabled-mcps.json");
        let mut disabled: serde_json::Value = if disabled_path.exists() {
            let d = fs::read_to_string(&disabled_path)?;
            serde_json::from_str(&d)?
        } else {
            serde_json::json!({})
        };
        if let Some(obj) = disabled.as_object_mut() {
            obj.insert(server_name.to_string(), server_val);
        }
        write_config_file(&disabled_path, &serde_json::to_string_pretty(&disabled)?)?;
    } else {
        return Err(format!("Server '{server_name}' not found in config").into());
    }

    let output = serde_json::to_string_pretty(&parsed)?;
    write_config_file(&cfg_path, &output)?;
    Ok(())
}

pub fn add_mcp_server(server: NewMcpServer) -> Result<(), Box<dyn std::error::Error>> {
    if server.name.trim().is_empty() {
        return Err("Server name cannot be empty".into());
    }
    if server.command_or_url.trim().is_empty() {
        return Err("Command or URL cannot be empty".into());
    }

    let _lock = CONFIG_WRITE_LOCK.lock();
    let cfg_path = config_path();

    let mut parsed: serde_json::Value = if cfg_path.exists() {
        let data = fs::read_to_string(&cfg_path)?;
        serde_json::from_str(&data)?
    } else {
        serde_json::json!({})
    };

    let servers = parsed
        .as_object_mut()
        .ok_or("Invalid config format")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    if servers.get(&server.name).is_some() {
        return Err(format!("Server '{}' already exists", server.name).into());
    }

    let mut server_obj = serde_json::Map::new();
    server_obj.insert(
        "type".into(),
        serde_json::Value::String(server.server_type.clone()),
    );

    if server.server_type == "http" {
        server_obj.insert(
            "url".into(),
            serde_json::Value::String(server.command_or_url),
        );
        if !server.auth_token.trim().is_empty() {
            let mut headers = serde_json::Map::new();
            headers.insert(
                "Authorization".into(),
                serde_json::Value::String(format!("Bearer {}", server.auth_token.trim())),
            );
            server_obj.insert("headers".into(), serde_json::Value::Object(headers));
        }
    } else {
        server_obj.insert(
            "command".into(),
            serde_json::Value::String(server.command_or_url),
        );
        if !server.args.is_empty() {
            server_obj.insert(
                "args".into(),
                serde_json::Value::Array(
                    server
                        .args
                        .iter()
                        .map(|a| serde_json::Value::String(a.clone()))
                        .collect(),
                ),
            );
        }
        let non_empty_env: HashMap<_, _> = server
            .env_vars
            .iter()
            .filter(|(_, v)| !v.trim().is_empty())
            .collect();
        if !non_empty_env.is_empty() {
            let mut env = serde_json::Map::new();
            for (key, value) in non_empty_env {
                env.insert(key.clone(), serde_json::Value::String(value.clone()));
            }
            server_obj.insert("env".into(), serde_json::Value::Object(env));
        }
    }

    if let Some(s) = servers.as_object_mut() {
        s.insert(server.name, serde_json::Value::Object(server_obj));
    }

    let output = serde_json::to_string_pretty(&parsed)?;
    write_config_file(&cfg_path, &output)?;
    Ok(())
}

// -- Smart MCP Auth Detection --

#[derive(Debug, Clone, Serialize)]
pub struct AuthInfo {
    pub auth_type: String,
    pub has_token: bool,
    pub token_valid: bool,
    pub provider: String,
    pub oauth_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TokenStatus {
    pub valid: bool,
    pub message: String,
    pub expires_at: Option<String>,
}

pub fn get_auth_info(server_name: &str) -> Result<AuthInfo, Box<dyn std::error::Error>> {
    let config = read_config()?;
    let server = config
        .mcp_servers
        .iter()
        .find(|s| s.name == *server_name)
        .ok_or_else(|| format!("MCP server '{server_name}' not found"))?;

    let name_lower = server_name.to_lowercase();
    let url_lower = server.command_or_url.to_lowercase();
    let cmd_lower = server.command_or_url.to_lowercase();

    // Detect provider and auth type based on server name, command, or URL
    if name_lower.contains("atlassian") || cmd_lower.contains("mcp-atlassian") {
        let has_token = std::env::var("JIRA_TOKEN").map(|v| !v.is_empty()).unwrap_or(false)
            || server.env_keys.iter().any(|k| k.contains("TOKEN") || k.contains("API_KEY"));
        let token_valid = has_token;
        return Ok(AuthInfo {
            auth_type: "token".into(),
            has_token,
            token_valid,
            provider: "Atlassian".into(),
            oauth_url: None,
        });
    }

    if name_lower.contains("tableau") {
        let has_token = std::env::var("TABLEAU_PAT_SECRET").map(|v| !v.is_empty()).unwrap_or(false)
            || server.env_keys.iter().any(|k| k.contains("TABLEAU"));
        return Ok(AuthInfo {
            auth_type: "token".into(),
            has_token,
            token_valid: has_token,
            provider: "Tableau".into(),
            oauth_url: None,
        });
    }

    if name_lower.contains("github") {
        let has_token = std::env::var("GITHUB_TOKEN").map(|v| !v.is_empty()).unwrap_or(false)
            || server.env_keys.iter().any(|k| k.contains("GITHUB"));
        return Ok(AuthInfo {
            auth_type: "token".into(),
            has_token,
            token_valid: has_token,
            provider: "GitHub".into(),
            oauth_url: None,
        });
    }

    if name_lower.contains("miro") || url_lower.contains("miro.com") {
        let oauth_url = if server.server_type == "http" && !server.command_or_url.is_empty() {
            Some(server.command_or_url.clone())
        } else {
            None
        };
        return Ok(AuthInfo {
            auth_type: "oauth".into(),
            has_token: false,
            token_valid: false,
            provider: "Miro".into(),
            oauth_url,
        });
    }

    if name_lower.contains("plasmic") || url_lower.contains("pipedream") {
        let oauth_url = if server.server_type == "http" && !server.command_or_url.is_empty() {
            Some(server.command_or_url.clone())
        } else {
            None
        };
        return Ok(AuthInfo {
            auth_type: "oauth".into(),
            has_token: false,
            token_valid: false,
            provider: "Plasmic".into(),
            oauth_url,
        });
    }

    if name_lower.contains("framer") || url_lower.contains("framer.com") {
        let oauth_url = if server.server_type == "http" && !server.command_or_url.is_empty() {
            Some(server.command_or_url.clone())
        } else {
            None
        };
        return Ok(AuthInfo {
            auth_type: "oauth".into(),
            has_token: false,
            token_valid: false,
            provider: "Framer".into(),
            oauth_url,
        });
    }

    // Check if the server has env vars that look like tokens
    if server.has_env && server.env_keys.iter().any(|k| {
        let ku = k.to_uppercase();
        ku.contains("TOKEN") || ku.contains("API_KEY") || ku.contains("SECRET") || ku.contains("PASSWORD")
    }) {
        let raw_config = read_raw_config()?;
        let env_obj = raw_config
            .get("mcpServers")
            .and_then(|s| s.get(server_name))
            .and_then(|s| s.get("env"))
            .and_then(|v| v.as_object());

        let has_token = env_obj
            .map(|env| {
                env.iter().any(|(k, v)| {
                    let ku = k.to_uppercase();
                    (ku.contains("TOKEN") || ku.contains("API_KEY") || ku.contains("SECRET"))
                        && v.as_str().map(|s| !s.is_empty()).unwrap_or(false)
                })
            })
            .unwrap_or(false);

        return Ok(AuthInfo {
            auth_type: "token".into(),
            has_token,
            token_valid: has_token,
            provider: server_name.to_string(),
            oauth_url: None,
        });
    }

    // Check if server has auth headers
    if server.has_auth && server.server_type == "http" {
        let raw_config = read_raw_config()?;
        let has_auth_header = raw_config
            .get("mcpServers")
            .and_then(|s| s.get(server_name))
            .and_then(|s| s.get("headers"))
            .and_then(|v| v.as_object())
            .map(|h| h.keys().any(|k| k.to_lowercase() == "authorization"))
            .unwrap_or(false);
        if has_auth_header {
            return Ok(AuthInfo {
                auth_type: "token".into(),
                has_token: true,
                token_valid: true,
                provider: server_name.to_string(),
                oauth_url: None,
            });
        }
    }

    Ok(AuthInfo {
        auth_type: "none".into(),
        has_token: false,
        token_valid: false,
        provider: server_name.to_string(),
        oauth_url: None,
    })
}

pub fn validate_token(server_name: &str) -> Result<TokenStatus, Box<dyn std::error::Error>> {
    let config = read_config()?;
    let server = config
        .mcp_servers
        .iter()
        .find(|s| s.name == *server_name)
        .ok_or_else(|| format!("MCP server '{server_name}' not found"))?;

    let auth_info = get_auth_info(server_name)?;

    if auth_info.auth_type == "none" {
        return Ok(TokenStatus {
            valid: true,
            message: "No authentication required".into(),
            expires_at: None,
        });
    }

    if auth_info.auth_type == "oauth" {
        return Ok(TokenStatus {
            valid: false,
            message: "OAuth authentication — use browser login".into(),
            expires_at: None,
        });
    }

    // For HTTP servers, try a HEAD request
    if server.server_type == "http" && !server.command_or_url.is_empty() {
        let raw_config = read_raw_config()?;
        let server_config = raw_config
            .get("mcpServers")
            .and_then(|s| s.get(server_name));

        let mut curl_config = String::new();
        curl_config.push_str(&format!("url = \"{}\"\n", server.command_or_url));
        curl_config.push_str("silent\n");
        curl_config.push_str("fail\n");
        curl_config.push_str("max-time = 5\n");
        curl_config.push_str("output = /dev/null\n");
        curl_config.push_str("write-out = \"%{http_code}\"\n");

        if let Some(headers) = server_config
            .and_then(|s| s.get("headers"))
            .and_then(|v| v.as_object())
        {
            for (key, val) in headers {
                if let Some(v) = val.as_str() {
                    curl_config.push_str(&format!("header = \"{key}: {v}\"\n"));
                }
            }
        }

        let mut curl_cmd = std::process::Command::new("curl");
        curl_cmd.arg("--config").arg("-");
        curl_cmd.stdin(std::process::Stdio::piped());
        curl_cmd.stdout(std::process::Stdio::piped());
        curl_cmd.stderr(std::process::Stdio::piped());

        if let Ok(mut child) = curl_cmd.spawn() {
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(curl_config.as_bytes());
            }
            if let Ok(output) = child.wait_with_output() {
                let code = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return match code.as_str() {
                    "200" | "204" | "301" | "302" | "405" => Ok(TokenStatus {
                        valid: true,
                        message: format!("Token valid (HTTP {code})"),
                        expires_at: None,
                    }),
                    "401" | "403" => Ok(TokenStatus {
                        valid: false,
                        message: format!("Token rejected (HTTP {code})"),
                        expires_at: None,
                    }),
                    _ => Ok(TokenStatus {
                        valid: false,
                        message: format!("Unexpected response (HTTP {code})"),
                        expires_at: None,
                    }),
                };
            }
        }
    }

    // For stdio servers, just check if env vars are set
    if auth_info.has_token {
        Ok(TokenStatus {
            valid: true,
            message: "Token is configured".into(),
            expires_at: None,
        })
    } else {
        Ok(TokenStatus {
            valid: false,
            message: "No token configured".into(),
            expires_at: None,
        })
    }
}

fn conductor_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("conductor-config.json")
}

fn read_conductor_config() -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let path = conductor_config_path();
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

fn write_conductor_config(val: &serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
    let path = conductor_config_path();
    let output = serde_json::to_string_pretty(val)?;
    write_config_file(&path, &output)?;
    Ok(())
}

// -- P2: Session Statuses --

pub fn get_session_statuses() -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    let config = read_conductor_config()?;
    let statuses = config
        .get("statuses")
        .and_then(|v| serde_json::from_value::<HashMap<String, String>>(v.clone()).ok())
        .unwrap_or_default();
    Ok(statuses)
}

pub fn set_session_status(session_id: &str, status: &str) -> Result<(), Box<dyn std::error::Error>> {
    let valid = ["planning", "running", "review", "done"];
    if !valid.contains(&status) {
        return Err(format!("Invalid status '{}'. Must be one of: {:?}", status, valid).into());
    }
    let _lock = CONFIG_WRITE_LOCK.lock();
    let mut config = read_conductor_config()?;
    let statuses = config
        .as_object_mut()
        .ok_or("Invalid conductor config")?
        .entry("statuses")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(obj) = statuses.as_object_mut() {
        obj.insert(session_id.to_string(), serde_json::Value::String(status.to_string()));
    }
    write_conductor_config(&config)?;
    Ok(())
}

// -- P2: Agent Profiles --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProfile {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_hint: Option<String>,
}

pub fn get_agent_profiles() -> Result<Vec<AgentProfile>, Box<dyn std::error::Error>> {
    let config = read_conductor_config()?;
    let profiles = config
        .get("profiles")
        .and_then(|v| serde_json::from_value::<Vec<AgentProfile>>(v.clone()).ok())
        .unwrap_or_default();
    Ok(profiles)
}

pub fn save_agent_profile(profile: AgentProfile) -> Result<(), Box<dyn std::error::Error>> {
    if profile.name.trim().is_empty() {
        return Err("Profile name cannot be empty".into());
    }
    if profile.command.trim().is_empty() {
        return Err("Profile command cannot be empty".into());
    }
    let _lock = CONFIG_WRITE_LOCK.lock();
    let mut config = read_conductor_config()?;
    let profiles_val = config
        .as_object_mut()
        .ok_or("Invalid conductor config")?
        .entry("profiles")
        .or_insert_with(|| serde_json::json!([]));

    let mut profiles: Vec<AgentProfile> = serde_json::from_value(profiles_val.clone()).unwrap_or_default();
    // Upsert by name
    if let Some(existing) = profiles.iter_mut().find(|p| p.name == profile.name) {
        *existing = profile;
    } else {
        profiles.push(profile);
    }
    *profiles_val = serde_json::to_value(&profiles)?;
    write_conductor_config(&config)?;
    Ok(())
}

pub fn delete_agent_profile(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let _lock = CONFIG_WRITE_LOCK.lock();
    let mut config = read_conductor_config()?;
    let profiles_val = config
        .as_object_mut()
        .ok_or("Invalid conductor config")?
        .entry("profiles")
        .or_insert_with(|| serde_json::json!([]));

    let mut profiles: Vec<AgentProfile> = serde_json::from_value(profiles_val.clone()).unwrap_or_default();
    let before = profiles.len();
    profiles.retain(|p| p.name != name);
    if profiles.len() == before {
        return Err(format!("Profile '{}' not found", name).into());
    }
    *profiles_val = serde_json::to_value(&profiles)?;
    write_conductor_config(&config)?;
    Ok(())
}

// -- P2: Dev Server Detection --

#[derive(Debug, Clone, Serialize)]
pub struct DevServer {
    pub port: u16,
    pub url: String,
}

pub fn check_port(port: u16) -> Result<bool, Box<dyn std::error::Error>> {
    use std::net::TcpStream;
    let addr = format!("127.0.0.1:{}", port);
    match TcpStream::connect_timeout(
        &addr.parse()?,
        Duration::from_millis(300),
    ) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

pub fn detect_dev_servers() -> Result<Vec<DevServer>, Box<dyn std::error::Error>> {
    let ports: &[u16] = &[3000, 3001, 4200, 5173, 5174, 8000, 8080, 8888];
    let mut servers = Vec::new();
    for &port in ports {
        if check_port(port)? {
            servers.push(DevServer {
                port,
                url: format!("http://localhost:{}", port),
            });
        }
    }
    Ok(servers)
}

// -- Session Templates --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTemplate {
    pub name: String,
    pub agent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd_pattern: Option<String>,
    #[serde(default)]
    pub mcp_servers: Vec<String>,
    pub description: String,
}

fn default_templates() -> Vec<SessionTemplate> {
    vec![
        SessionTemplate {
            name: "Code Review".to_string(),
            agent: "claude".to_string(),
            cwd_pattern: None,
            mcp_servers: vec![],
            description: "Review code for bugs, style, and best practices".to_string(),
        },
        SessionTemplate {
            name: "Implement Feature".to_string(),
            agent: "claude".to_string(),
            cwd_pattern: None,
            mcp_servers: vec![],
            description: "Implement a new feature with tests".to_string(),
        },
        SessionTemplate {
            name: "Research".to_string(),
            agent: "claude".to_string(),
            cwd_pattern: None,
            mcp_servers: vec!["brave-search".to_string()],
            description: "Research a topic using web search and analysis".to_string(),
        },
    ]
}

pub fn get_session_templates() -> Result<Vec<SessionTemplate>, Box<dyn std::error::Error>> {
    let config = read_conductor_config()?;
    let templates = config
        .get("templates")
        .and_then(|v| serde_json::from_value::<Vec<SessionTemplate>>(v.clone()).ok());

    match templates {
        Some(t) if !t.is_empty() => Ok(t),
        _ => Ok(default_templates()),
    }
}

pub fn save_session_template(template: SessionTemplate) -> Result<(), Box<dyn std::error::Error>> {
    if template.name.trim().is_empty() {
        return Err("Template name cannot be empty".into());
    }
    let _lock = CONFIG_WRITE_LOCK.lock();
    let mut config = read_conductor_config()?;
    let templates_val = config
        .as_object_mut()
        .ok_or("Invalid conductor config")?
        .entry("templates")
        .or_insert_with(|| serde_json::to_value(default_templates()).unwrap_or(serde_json::json!([])));

    let mut templates: Vec<SessionTemplate> = serde_json::from_value(templates_val.clone()).unwrap_or_default();
    if let Some(existing) = templates.iter_mut().find(|t| t.name == template.name) {
        *existing = template;
    } else {
        templates.push(template);
    }
    *templates_val = serde_json::to_value(&templates)?;
    write_conductor_config(&config)?;
    Ok(())
}

pub fn delete_session_template(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let _lock = CONFIG_WRITE_LOCK.lock();
    let mut config = read_conductor_config()?;
    let templates_val = config
        .as_object_mut()
        .ok_or("Invalid conductor config")?
        .entry("templates")
        .or_insert_with(|| serde_json::to_value(default_templates()).unwrap_or(serde_json::json!([])));

    let mut templates: Vec<SessionTemplate> = serde_json::from_value(templates_val.clone()).unwrap_or_default();
    let before = templates.len();
    templates.retain(|t| t.name != name);
    if templates.len() == before {
        return Err(format!("Template '{}' not found", name).into());
    }
    *templates_val = serde_json::to_value(&templates)?;
    write_conductor_config(&config)?;
    Ok(())
}

fn labels_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("conductor-labels.json")
}

pub fn get_session_labels() -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    let path = labels_path();
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = fs::read_to_string(&path)?;
    let labels: HashMap<String, String> = serde_json::from_str(&data)?;
    Ok(labels)
}

pub fn set_session_label(
    session_id: &str,
    label: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = labels_path();
    let mut labels = get_session_labels().unwrap_or_default();

    let trimmed = label.trim();
    if trimmed.is_empty() {
        labels.remove(session_id);
    } else {
        labels.insert(session_id.to_string(), trimmed.to_string());
    }

    let output = serde_json::to_string_pretty(&labels)?;
    write_config_file(&path, &output)?;
    Ok(())
}
