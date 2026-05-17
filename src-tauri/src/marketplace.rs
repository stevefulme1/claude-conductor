use serde::Serialize;
use std::fs;
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Debug, Clone, Serialize)]
pub struct McpServerEntry {
    pub name: String,
    pub description: String,
    pub install_type: String,
    pub install_command: String,
    pub config_template: serde_json::Value,
    pub category: String,
}

pub fn list_marketplace() -> Result<Vec<McpServerEntry>, String> {
    Ok(vec![
        McpServerEntry {
            name: "GitHub".to_string(),
            description: "Access GitHub repos, issues, PRs, and code search".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @modelcontextprotocol/server-github".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-github"],
                "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "" }
            }),
            category: "development".to_string(),
        },
        McpServerEntry {
            name: "Brave Search".to_string(),
            description: "Web search via Brave Search API".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @modelcontextprotocol/server-brave-search".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-brave-search"],
                "env": { "BRAVE_API_KEY": "" }
            }),
            category: "productivity".to_string(),
        },
        McpServerEntry {
            name: "Playwright".to_string(),
            description: "Browser automation, testing, and web scraping".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @playwright/mcp@latest".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@playwright/mcp@latest"]
            }),
            category: "development".to_string(),
        },
        McpServerEntry {
            name: "PostgreSQL".to_string(),
            description: "Query and manage PostgreSQL databases".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @modelcontextprotocol/server-postgres".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-postgres"],
                "env": { "POSTGRES_CONNECTION_STRING": "" }
            }),
            category: "data".to_string(),
        },
        McpServerEntry {
            name: "Slack".to_string(),
            description: "Read and send Slack messages, manage channels".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @anthropic/mcp-server-slack".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@anthropic/mcp-server-slack"],
                "env": { "SLACK_BOT_TOKEN": "" }
            }),
            category: "productivity".to_string(),
        },
        McpServerEntry {
            name: "Google Workspace".to_string(),
            description: "Access Google Docs, Sheets, Drive, Calendar, and Gmail".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @anthropic/mcp-server-google-workspace".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@anthropic/mcp-server-google-workspace"]
            }),
            category: "productivity".to_string(),
        },
        McpServerEntry {
            name: "Figma".to_string(),
            description: "Read Figma designs, export assets, inspect layers".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @anthropic/mcp-server-figma".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@anthropic/mcp-server-figma"],
                "env": { "FIGMA_ACCESS_TOKEN": "" }
            }),
            category: "development".to_string(),
        },
        McpServerEntry {
            name: "Jira".to_string(),
            description: "Manage Jira issues, sprints, and boards".to_string(),
            install_type: "pip".to_string(),
            install_command: "uvx mcp-atlassian".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "uvx",
                "args": ["mcp-atlassian"],
                "env": {
                    "JIRA_URL": "",
                    "JIRA_USERNAME": "",
                    "JIRA_API_TOKEN": ""
                }
            }),
            category: "productivity".to_string(),
        },
        McpServerEntry {
            name: "Confluence".to_string(),
            description: "Search and read Confluence pages and spaces".to_string(),
            install_type: "pip".to_string(),
            install_command: "uvx mcp-atlassian".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "uvx",
                "args": ["mcp-atlassian"],
                "env": {
                    "CONFLUENCE_URL": "",
                    "CONFLUENCE_USERNAME": "",
                    "CONFLUENCE_API_TOKEN": ""
                }
            }),
            category: "productivity".to_string(),
        },
        McpServerEntry {
            name: "Filesystem".to_string(),
            description: "Read, write, and manage local files with safety constraints".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @modelcontextprotocol/server-filesystem".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
            }),
            category: "development".to_string(),
        },
        McpServerEntry {
            name: "Sentry".to_string(),
            description: "Query errors, issues, and performance data from Sentry".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @sentry/mcp-server".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@sentry/mcp-server"],
                "env": { "SENTRY_AUTH_TOKEN": "" }
            }),
            category: "development".to_string(),
        },
        McpServerEntry {
            name: "Linear".to_string(),
            description: "Manage Linear issues, projects, and cycles".to_string(),
            install_type: "npm".to_string(),
            install_command: "npx -y @linear/mcp-server".to_string(),
            config_template: serde_json::json!({
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@linear/mcp-server"],
                "env": { "LINEAR_API_KEY": "" }
            }),
            category: "productivity".to_string(),
        },
    ])
}

pub fn install_mcp_from_marketplace(name: &str) -> Result<(), String> {
    let registry = list_marketplace()?;
    let entry = registry.iter()
        .find(|e| e.name == name)
        .ok_or_else(|| format!("Server '{}' not found in marketplace", name))?;

    let cfg_path = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".claude.json");

    let mut parsed: serde_json::Value = if cfg_path.exists() {
        let data = fs::read_to_string(&cfg_path)
            .map_err(|e| format!("Failed to read config: {e}"))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse config: {e}"))?
    } else {
        serde_json::json!({})
    };

    let servers = parsed
        .as_object_mut()
        .ok_or("Invalid config format")?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));

    // Use a sanitized key (lowercase, hyphens)
    let key = name.to_lowercase().replace(' ', "-");
    if servers.get(&key).is_some() {
        return Err(format!("Server '{}' is already installed", key));
    }

    if let Some(obj) = servers.as_object_mut() {
        obj.insert(key, entry.config_template.clone());
    }

    let output = serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;

    // Atomic write
    let dir = cfg_path.parent().unwrap_or_else(|| Path::new("."));
    let tmp = dir.join(".claude.json.tmp");
    fs::write(&tmp, &output)
        .map_err(|e| format!("Failed to write config: {e}"))?;
    #[cfg(unix)]
    {
        let perms = fs::Permissions::from_mode(0o600);
        let _ = fs::set_permissions(&tmp, perms);
    }
    fs::rename(&tmp, &cfg_path)
        .map_err(|e| format!("Failed to save config: {e}"))?;

    Ok(())
}
