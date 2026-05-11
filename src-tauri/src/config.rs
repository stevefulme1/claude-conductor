use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
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
    fs::write(path, content)?;
    #[cfg(unix)]
    {
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
}

fn read_raw_config() -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let cfg_path = config_path();
    if !cfg_path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&cfg_path)?;
    Ok(serde_json::from_str(&data)?)
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

    let base = cmd.split('/').last().unwrap_or(cmd);
    logs.push(format!("Command: {cmd}"));

    let on_path = std::process::Command::new("which")
        .arg(base)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !on_path {
        let full_path_exists = std::path::Path::new(cmd).exists();
        if !full_path_exists {
            logs.push(format!("✗ Binary '{base}' not found on PATH"));
            logs.push("Ensure the command is installed and accessible".into());
            return McpStatus {
                reachable: false,
                logs,
            };
        }
        logs.push(format!("✓ Binary found at absolute path: {cmd}"));
    } else {
        let resolved = std::process::Command::new("which")
            .arg(base)
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        logs.push(format!("✓ Binary found: {resolved}"));
    }

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

    let mut spawn_cmd = std::process::Command::new(cmd);
    for arg in &server.args {
        spawn_cmd.arg(arg);
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

            std::thread::sleep(Duration::from_secs(2));

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
