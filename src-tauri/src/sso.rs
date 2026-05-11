use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

static SSO_STATE: Mutex<Option<SsoSession>> = Mutex::new(None);

struct SsoSession {
    code_verifier: String,
    token_url: String,
    client_id: String,
    redirect_uri: String,
    state: String,
    cancel_tx: Option<mpsc::Sender<()>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SsoStartResult {
    pub auth_url: String,
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SsoConfig {
    pub server_name: String,
    pub auth_url: String,
    pub token_url: String,
    pub client_id: String,
    pub scopes: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SsoCallbackResult {
    pub success: bool,
    pub server_name: String,
    pub error: Option<String>,
}

fn generate_code_verifier() -> String {
    let charset = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut random_bytes = [0u8; 64];
    getrandom::getrandom(&mut random_bytes).expect("failed to get random bytes");
    random_bytes
        .iter()
        .map(|b| charset[(*b as usize) % charset.len()] as char)
        .collect()
}

fn generate_state() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("failed to get random bytes");
    URL_SAFE_NO_PAD.encode(bytes)
}

fn sha256_base64url(input: &str) -> String {
    let hash = Sha256::digest(input.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

fn url_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

fn url_decode(s: &str) -> String {
    let mut result = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                &String::from_utf8_lossy(&bytes[i + 1..i + 3]),
                16,
            ) {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            result.push(b' ');
        } else {
            result.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}

fn parse_query_string(query: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            params.insert(url_decode(key), url_decode(value));
        }
    }
    params
}

pub fn start_sso_flow(
    app: tauri::AppHandle,
    config: SsoConfig,
) -> Result<SsoStartResult, Box<dyn std::error::Error>> {
    cancel_sso_flow()?;

    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    let code_verifier = generate_code_verifier();
    let code_challenge = sha256_base64url(&code_verifier);
    let state = generate_state();

    let auth_url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
        config.auth_url,
        url_encode(&config.client_id),
        url_encode(&redirect_uri),
        url_encode(&config.scopes),
        url_encode(&code_challenge),
        url_encode(&state),
    );

    let (cancel_tx, cancel_rx) = mpsc::channel();

    {
        let mut guard = SSO_STATE.lock();
        *guard = Some(SsoSession {
            code_verifier: code_verifier.clone(),
            token_url: config.token_url.clone(),
            client_id: config.client_id.clone(),
            redirect_uri: redirect_uri.clone(),
            state: state.clone(),
            cancel_tx: Some(cancel_tx),
        });
    }

    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to set non-blocking: {e}"))?;

    let server_name = config.server_name.clone();

    thread::spawn(move || {
        let timeout = Duration::from_secs(300);
        let start = std::time::Instant::now();

        loop {
            if cancel_rx.try_recv().is_ok() {
                log::info!("SSO flow cancelled for {}", server_name);
                return;
            }

            if start.elapsed() > timeout {
                log::warn!("SSO flow timed out for {}", server_name);
                let _ = tauri::Emitter::emit(
                    &app,
                    "sso-result",
                    SsoCallbackResult {
                        success: false,
                        server_name: server_name.clone(),
                        error: Some("SSO login timed out (5 minutes)".into()),
                    },
                );
                let mut guard = SSO_STATE.lock();
                *guard = None;
                return;
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buf = [0u8; 4096];
                    let n = match stream.read(&mut buf) {
                        Ok(n) => n,
                        Err(e) => {
                            log::error!("Failed to read SSO callback: {}", e);
                            let _ = tauri::Emitter::emit(
                                &app,
                                "sso-result",
                                SsoCallbackResult {
                                    success: false,
                                    server_name: server_name.clone(),
                                    error: Some(format!("Failed to read callback: {e}")),
                                },
                            );
                            let mut guard = SSO_STATE.lock();
                            *guard = None;
                            return;
                        }
                    };
                    let request = String::from_utf8_lossy(&buf[..n]);

                    let path = request
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("");

                    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
                    let params = parse_query_string(query);

                    let expected_state = {
                        let guard = SSO_STATE.lock();
                        guard.as_ref().map(|s| s.state.clone()).unwrap_or_default()
                    };
                    let received_state = params.get("state").cloned().unwrap_or_default();

                    let result = if received_state != expected_state {
                        SsoCallbackResult {
                            success: false,
                            server_name: server_name.clone(),
                            error: Some("OAuth state mismatch — possible CSRF attack".into()),
                        }
                    } else if let Some(code) = params.get("code") {
                        let exchange_result = exchange_code_for_token(code);
                        match exchange_result {
                            Ok(token) => {
                                if let Err(e) = crate::config::update_mcp_auth_header(
                                    &server_name,
                                    &token,
                                ) {
                                    SsoCallbackResult {
                                        success: false,
                                        server_name: server_name.clone(),
                                        error: Some(format!("Failed to save token: {e}")),
                                    }
                                } else {
                                    SsoCallbackResult {
                                        success: true,
                                        server_name: server_name.clone(),
                                        error: None,
                                    }
                                }
                            }
                            Err(e) => SsoCallbackResult {
                                success: false,
                                server_name: server_name.clone(),
                                error: Some(format!("Token exchange failed: {e}")),
                            },
                        }
                    } else if let Some(err) = params.get("error") {
                        let desc = params
                            .get("error_description")
                            .cloned()
                            .unwrap_or_default();
                        SsoCallbackResult {
                            success: false,
                            server_name: server_name.clone(),
                            error: Some(format!("{err}: {desc}")),
                        }
                    } else {
                        SsoCallbackResult {
                            success: false,
                            server_name: server_name.clone(),
                            error: Some("No authorization code in callback".into()),
                        }
                    };

                    let html = if result.success {
                        "<html><body style='font-family:system-ui;text-align:center;padding:60px'>\
                         <h2>Authentication Successful</h2>\
                         <p>You can close this tab and return to Claude Conductor.</p>\
                         </body></html>"
                    } else {
                        "<html><body style='font-family:system-ui;text-align:center;padding:60px'>\
                         <h2>Authentication Failed</h2>\
                         <p>Check Claude Conductor for details.</p>\
                         </body></html>"
                    };

                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        html.len(),
                        html
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();

                    if let Err(e) = tauri::Emitter::emit(&app, "sso-result", result) {
                        log::error!("Failed to emit SSO result event: {}", e);
                    }

                    let mut guard = SSO_STATE.lock();
                    *guard = None;
                    return;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(200));
                }
                Err(e) => {
                    log::error!("SSO listener error: {}", e);
                    let _ = tauri::Emitter::emit(
                        &app,
                        "sso-result",
                        SsoCallbackResult {
                            success: false,
                            server_name: server_name.clone(),
                            error: Some(format!("Callback listener failed: {e}")),
                        },
                    );
                    let mut guard = SSO_STATE.lock();
                    *guard = None;
                    return;
                }
            }
        }
    });

    Ok(SsoStartResult {
        auth_url,
        port,
    })
}

fn exchange_code_for_token(code: &str) -> Result<String, Box<dyn std::error::Error>> {
    let session = {
        let guard = SSO_STATE.lock();
        guard.as_ref().ok_or("No active SSO session")?.clone_for_exchange()
    };

    let body = format!(
        "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}",
        url_encode(code),
        url_encode(&session.redirect_uri),
        url_encode(&session.client_id),
        url_encode(&session.code_verifier),
    );

    let mut curl = Command::new("curl");
    curl.arg("-sS")
        .arg("-X")
        .arg("POST")
        .arg(&session.token_url)
        .arg("-H")
        .arg("Content-Type: application/x-www-form-urlencoded")
        .arg("-H")
        .arg("Accept: application/json")
        .arg("--config")
        .arg("-");

    curl.stdin(std::process::Stdio::piped());
    curl.stdout(std::process::Stdio::piped());
    curl.stderr(std::process::Stdio::piped());

    let mut child = curl.spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
        let config = format!("data = \"{body}\"");
        stdin.write_all(config.as_bytes())?;
    }

    let output = child.wait_with_output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Token request failed (curl exit {}): {}", output.status, stderr).into());
    }

    let response = String::from_utf8_lossy(&output.stdout);

    let parsed: serde_json::Value = serde_json::from_str(&response)
        .map_err(|_| "Invalid JSON in token response")?;

    if let Some(token) = parsed.get("access_token").and_then(|v| v.as_str()) {
        Ok(token.to_string())
    } else if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
        let desc = parsed
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        Err(format!("{err}: {desc}").into())
    } else {
        Err("No access_token in token response".into())
    }
}

pub fn cancel_sso_flow() -> Result<(), Box<dyn std::error::Error>> {
    let mut guard = SSO_STATE.lock();
    if let Some(session) = guard.take() {
        if let Some(tx) = session.cancel_tx {
            let _ = tx.send(());
        }
    }
    Ok(())
}

impl SsoSession {
    fn clone_for_exchange(&self) -> SsoExchangeData {
        SsoExchangeData {
            code_verifier: self.code_verifier.clone(),
            token_url: self.token_url.clone(),
            client_id: self.client_id.clone(),
            redirect_uri: self.redirect_uri.clone(),
        }
    }
}

struct SsoExchangeData {
    code_verifier: String,
    token_url: String,
    client_id: String,
    redirect_uri: String,
}
