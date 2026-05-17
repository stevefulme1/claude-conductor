use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct AgentSuggestion {
    pub agent_name: String,
    pub reason: String,
    pub detected_language: String,
    pub detected_framework: String,
}

pub fn suggest_agent(cwd: &str) -> Result<AgentSuggestion, String> {
    let dir = Path::new(cwd);
    if !dir.is_dir() {
        return Err(format!("Directory does not exist: {cwd}"));
    }

    // Check for project type indicators in priority order
    if dir.join("Cargo.toml").exists() {
        return Ok(AgentSuggestion {
            agent_name: "claude --model opus".to_string(),
            reason: "Detected Rust project (Cargo.toml) -- recommended Opus for systems-level reasoning".to_string(),
            detected_language: "Rust".to_string(),
            detected_framework: detect_rust_framework(dir),
        });
    }

    if dir.join("pyproject.toml").exists() || dir.join("setup.py").exists() {
        return Ok(AgentSuggestion {
            agent_name: "claude".to_string(),
            reason: "Detected Python project -- recommended Sonnet for efficient Python development".to_string(),
            detected_language: "Python".to_string(),
            detected_framework: detect_python_framework(dir),
        });
    }

    if dir.join("package.json").exists() {
        return Ok(AgentSuggestion {
            agent_name: "claude".to_string(),
            reason: "Detected Node/TypeScript project -- recommended Sonnet for web development".to_string(),
            detected_language: "TypeScript/JavaScript".to_string(),
            detected_framework: detect_node_framework(dir),
        });
    }

    if dir.join("galaxy.yml").exists() || dir.join("galaxy.yaml").exists() {
        return Ok(AgentSuggestion {
            agent_name: "claude".to_string(),
            reason: "Detected Ansible collection -- recommended Sonnet for automation content".to_string(),
            detected_language: "YAML/Ansible".to_string(),
            detected_framework: "Ansible Collection".to_string(),
        });
    }

    if dir.join("Dockerfile").exists() || dir.join("docker-compose.yml").exists() {
        return Ok(AgentSuggestion {
            agent_name: "claude".to_string(),
            reason: "Detected containerized project -- recommended with container context".to_string(),
            detected_language: "Docker".to_string(),
            detected_framework: "Container".to_string(),
        });
    }

    if dir.join("go.mod").exists() {
        return Ok(AgentSuggestion {
            agent_name: "claude".to_string(),
            reason: "Detected Go project".to_string(),
            detected_language: "Go".to_string(),
            detected_framework: "Go Module".to_string(),
        });
    }

    // Default
    Ok(AgentSuggestion {
        agent_name: "claude".to_string(),
        reason: "No specific project type detected -- using default agent".to_string(),
        detected_language: "Unknown".to_string(),
        detected_framework: "Unknown".to_string(),
    })
}

fn detect_rust_framework(dir: &Path) -> String {
    if dir.join("tauri.conf.json").exists() || dir.join("src-tauri").exists() {
        return "Tauri".to_string();
    }
    if let Ok(content) = std::fs::read_to_string(dir.join("Cargo.toml")) {
        if content.contains("actix") {
            return "Actix Web".to_string();
        }
        if content.contains("axum") {
            return "Axum".to_string();
        }
        if content.contains("rocket") {
            return "Rocket".to_string();
        }
        if content.contains("tokio") {
            return "Tokio".to_string();
        }
    }
    "Rust".to_string()
}

fn detect_python_framework(dir: &Path) -> String {
    if dir.join("manage.py").exists() {
        return "Django".to_string();
    }
    if dir.join("app.py").exists() || dir.join("wsgi.py").exists() {
        return "Flask".to_string();
    }
    if dir.join("pyproject.toml").exists() {
        if let Ok(content) = std::fs::read_to_string(dir.join("pyproject.toml")) {
            if content.contains("fastapi") {
                return "FastAPI".to_string();
            }
            if content.contains("pytest") {
                return "Python (pytest)".to_string();
            }
        }
    }
    "Python".to_string()
}

fn detect_node_framework(dir: &Path) -> String {
    if let Ok(content) = std::fs::read_to_string(dir.join("package.json")) {
        if content.contains("\"next\"") {
            return "Next.js".to_string();
        }
        if content.contains("\"react\"") {
            return "React".to_string();
        }
        if content.contains("\"vue\"") {
            return "Vue".to_string();
        }
        if content.contains("\"svelte\"") {
            return "Svelte".to_string();
        }
        if content.contains("\"express\"") {
            return "Express".to_string();
        }
        if content.contains("\"angular\"") || content.contains("@angular/core") {
            return "Angular".to_string();
        }
    }
    "Node.js".to_string()
}
