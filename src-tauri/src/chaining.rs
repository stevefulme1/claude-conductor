use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainStep {
    pub agent: String,
    pub prompt: String,
    pub status: String, // "pending" | "running" | "done" | "failed"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionChain {
    pub id: String,
    pub name: String,
    pub steps: Vec<ChainStep>,
    pub current_step: usize,
}

fn chains_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("conductor-chains.json")
}

fn read_chains() -> Result<Vec<SessionChain>, String> {
    let path = chains_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read chains: {e}"))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse chains: {e}"))
}

fn write_chains(chains: &[SessionChain]) -> Result<(), String> {
    let path = chains_path();
    let dir = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let tmp = dir.join(".conductor-chains.tmp");
    let content = serde_json::to_string_pretty(chains)
        .map_err(|e| format!("Failed to serialize chains: {e}"))?;
    fs::write(&tmp, &content)
        .map_err(|e| format!("Failed to write chains: {e}"))?;
    #[cfg(unix)]
    {
        let perms = fs::Permissions::from_mode(0o600);
        let _ = fs::set_permissions(&tmp, perms);
    }
    fs::rename(&tmp, &path)
        .map_err(|e| format!("Failed to save chains: {e}"))?;
    Ok(())
}

pub fn create_chain(name: &str, steps: Vec<ChainStep>) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("Chain name cannot be empty".to_string());
    }
    if steps.is_empty() {
        return Err("Chain must have at least one step".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let chain = SessionChain {
        id: id.clone(),
        name: name.to_string(),
        steps: steps.into_iter().map(|mut s| {
            s.status = "pending".to_string();
            s
        }).collect(),
        current_step: 0,
    };

    let mut chains = read_chains()?;
    chains.push(chain);
    write_chains(&chains)?;
    Ok(id)
}

pub fn get_chain(chain_id: &str) -> Result<SessionChain, String> {
    let chains = read_chains()?;
    chains.into_iter()
        .find(|c| c.id == chain_id)
        .ok_or_else(|| format!("Chain '{}' not found", chain_id))
}

pub fn list_chains() -> Result<Vec<SessionChain>, String> {
    read_chains()
}

pub fn advance_chain(chain_id: &str) -> Result<ChainStep, String> {
    let mut chains = read_chains()?;
    let chain = chains.iter_mut()
        .find(|c| c.id == chain_id)
        .ok_or_else(|| format!("Chain '{}' not found", chain_id))?;

    // Mark current step done
    if chain.current_step < chain.steps.len() {
        chain.steps[chain.current_step].status = "done".to_string();
    }

    // Move to next step
    let next = chain.current_step + 1;
    if next >= chain.steps.len() {
        write_chains(&chains)?;
        return Err("Chain completed — no more steps".to_string());
    }

    chain.current_step = next;
    chain.steps[next].status = "running".to_string();
    let step = chain.steps[next].clone();
    write_chains(&chains)?;
    Ok(step)
}

pub fn delete_chain(chain_id: &str) -> Result<(), String> {
    let mut chains = read_chains()?;
    let before = chains.len();
    chains.retain(|c| c.id != chain_id);
    if chains.len() == before {
        return Err(format!("Chain '{}' not found", chain_id));
    }
    write_chains(&chains)
}
