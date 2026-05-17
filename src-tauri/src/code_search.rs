use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub file_path: String,
    pub line_number: u32,
    pub line_content: String,
    pub match_type: String, // "text" or "symbol"
}

const MAX_RESULTS: usize = 100;

fn default_extensions() -> Vec<String> {
    vec![
        "rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h", "hpp", "rb", "swift",
        "kt", "scala", "sh", "yaml", "yml", "toml", "json", "md", "css", "html", "vue", "svelte",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

fn build_include_args(extensions: &[String]) -> Vec<String> {
    extensions
        .iter()
        .map(|ext| format!("--include=*.{}", ext))
        .collect()
}

pub fn search_code(
    cwd: &str,
    query: &str,
    file_extensions: Option<Vec<String>>,
) -> Result<Vec<SearchResult>, String> {
    let exts = file_extensions.unwrap_or_else(default_extensions);
    let include_args = build_include_args(&exts);

    let mut results = Vec::new();

    // Text search
    let mut cmd = Command::new("grep");
    cmd.arg("-rn")
        .args(&include_args)
        .arg("--")
        .arg(query)
        .arg(".")
        .current_dir(cwd);

    if let Ok(output) = cmd.output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if results.len() >= MAX_RESULTS {
                break;
            }
            if let Some(result) = parse_grep_line(line, "text") {
                results.push(result);
            }
        }
    }

    // Symbol search (if we still have room and query looks like a symbol name)
    if results.len() < MAX_RESULTS && !query.contains(' ') {
        let symbol_pattern = format!(
            r"(fn |def |class |function |const |let |var |export |impl |struct |enum |trait |interface |type ){}\b",
            regex_escape(query)
        );

        let mut cmd = Command::new("grep");
        cmd.arg("-rnE")
            .args(&include_args)
            .arg("--")
            .arg(&symbol_pattern)
            .arg(".")
            .current_dir(cwd);

        if let Ok(output) = cmd.output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if results.len() >= MAX_RESULTS {
                    break;
                }
                if let Some(result) = parse_grep_line(line, "symbol") {
                    // Avoid duplicates
                    let dominated = results.iter().any(|r| {
                        r.file_path == result.file_path && r.line_number == result.line_number
                    });
                    if !dominated {
                        results.push(result);
                    }
                }
            }
        }
    }

    Ok(results)
}

fn parse_grep_line(line: &str, match_type: &str) -> Option<SearchResult> {
    // grep -rn output format: ./path/to/file:123:line content
    let line = line.strip_prefix("./").unwrap_or(line);
    let first_colon = line.find(':')?;
    let rest = &line[first_colon + 1..];
    let second_colon = rest.find(':')?;

    let file_path = line[..first_colon].to_string();
    let line_number: u32 = rest[..second_colon].parse().ok()?;
    let line_content = rest[second_colon + 1..].trim().to_string();

    Some(SearchResult {
        file_path,
        line_number,
        line_content,
        match_type: match_type.to_string(),
    })
}

fn regex_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for c in s.chars() {
        if r"\.+*?()[]{}|^$".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
