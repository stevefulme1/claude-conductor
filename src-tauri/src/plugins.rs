use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub description: String,
    pub entry_point: String,
    pub hooks: Vec<String>,
}

fn plugins_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".claude").join("conductor-plugins"))
}

pub fn discover_plugins() -> Result<Vec<PluginManifest>, String> {
    let dir = plugins_dir()?;
    if !dir.exists() {
        // Create directory so users know where to put plugins
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create plugins directory: {e}"))?;
        return Ok(Vec::new());
    }

    let mut plugins = Vec::new();

    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read plugins directory: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        let content = match fs::read_to_string(&manifest_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut manifest: PluginManifest = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Resolve entry_point relative to plugin directory
        if !Path::new(&manifest.entry_point).is_absolute() {
            manifest.entry_point = path
                .join(&manifest.entry_point)
                .to_string_lossy()
                .to_string();
        }

        plugins.push(manifest);
    }

    // Sort by name for consistent ordering
    plugins.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(plugins)
}

pub fn load_plugin_config(name: &str) -> Result<serde_json::Value, String> {
    let dir = plugins_dir()?;
    let config_path = dir.join(name).join("config.json");

    if !config_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read plugin config: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse plugin config: {e}"))
}
