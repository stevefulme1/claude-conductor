use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct McpServer {
    pub name: String,
    pub server_type: String,
    pub command_or_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeConfig {
    pub mcp_servers: Vec<McpServer>,
    pub plugins: Vec<String>,
    pub model: String,
    pub config_paths: Vec<String>,
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

pub fn read_config() -> Result<ClaudeConfig, Box<dyn std::error::Error>> {
    let mut mcp_servers = Vec::new();
    let mut plugins = Vec::new();
    let mut model = String::new();
    let mut config_paths = Vec::new();

    let cfg_path = config_path();
    if cfg_path.exists() {
        config_paths.push(cfg_path.to_string_lossy().to_string());
        let data = fs::read_to_string(&cfg_path)?;
        let parsed: serde_json::Value = serde_json::from_str(&data)?;

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

                mcp_servers.push(McpServer {
                    name: name.clone(),
                    server_type,
                    command_or_url,
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

pub fn verify_mcp_tools() -> Result<HashMap<String, bool>, Box<dyn std::error::Error>> {
    let config = read_config()?;
    let mut status = HashMap::new();

    for server in &config.mcp_servers {
        let reachable = match server.server_type.as_str() {
            "stdio" => {
                let cmd = &server.command_or_url;
                if cmd.is_empty() {
                    false
                } else {
                    let base = cmd.split('/').last().unwrap_or(cmd);
                    std::process::Command::new("which")
                        .arg(base)
                        .output()
                        .map(|o| o.status.success())
                        .unwrap_or(false)
                }
            }
            "http" => !server.command_or_url.is_empty(),
            _ => false,
        };
        status.insert(server.name.clone(), reachable);
    }

    Ok(status)
}
