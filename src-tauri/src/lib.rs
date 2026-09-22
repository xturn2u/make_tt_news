use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    env,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use futures_util::StreamExt;
use tauri::{Emitter, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStatus {
    platform: String,
    ffmpeg_available: bool,
    ffmpeg_path: Option<String>,
    say_available: bool,
    ollama_available: bool,
    ollama_models: Vec<String>,
    data_dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaResult {
    title: String,
    thumb_url: String,
    original_url: String,
    page_url: String,
    license: String,
    artist: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NewsArticle {
    url: String,
    title: String,
    text: String,
    site_name: String,
    word_count: usize,
}

#[tauri::command]
async fn system_status(app: tauri::AppHandle) -> Result<SystemStatus, String> {
    let ffmpeg = resolve_binary("ffmpeg");
    let say = Path::new("/usr/bin/say").exists();
    let data_dir = ensure_data_dir(&app)?;
    let (ollama_available, ollama_models) = ollama_models().await;

    Ok(SystemStatus {
        platform: env::consts::OS.to_string(),
        ffmpeg_available: ffmpeg.is_some(),
        ffmpeg_path: ffmpeg.map(|p| p.to_string_lossy().to_string()),
        say_available: say,
        ollama_available,
        ollama_models,
        data_dir: data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn fetch_news_article(url: String) -> Result<NewsArticle, String> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Die News-Quelle muss eine HTTP(S)-URL sein.".into());
    }

    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Ungültige URL: {e}"))?;
    let site_name = parsed.host_str().unwrap_or("Unbekannte Quelle").trim_start_matches("www.").to_string();
    let client = http_client()?;
    let response = client
        .get(parsed.clone())
        .header(USER_AGENT, "TikTokNewsStudioLocal/0.2")
        .send()
        .await
        .map_err(|e| format!("Nachrichtenquelle nicht erreichbar: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Nachrichtenquelle HTTP {}", response.status()));
    }

    if let Some(length) = response.content_length() {
        if length > 10 * 1024 * 1024 {
            return Err("Die Quellseite ist größer als 10 MB.".into());
        }
    }

    let html = response.text().await.map_err(|e| format!("Quelltext konnte nicht gelesen werden: {e}"))?;
    let title = extract_html_tag(&html, "title")
        .map(|value| decode_entities(&strip_html(&value)))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| site_name.clone());

    let main_html = best_content_section(&html);
    let cleaned_html = remove_ignored_blocks(main_html);
    let text = decode_entities(&strip_html(&cleaned_html));
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = truncate_chars(&text, 45_000);

    if text.chars().count() < 120 {
        return Err("Auf der Seite konnte kein ausreichender Artikeltext erkannt werden.".into());
    }

    let word_count = text.split_whitespace().count();
    Ok(NewsArticle {
        url: parsed.to_string(),
        title,
        text,
        site_name,
        word_count,
    })
}

#[tauri::command]
async fn ollama_generate(model: String, prompt: String) -> Result<String, String> {
    if model.trim().is_empty() {
        return Err("Kein Ollama-Modell ausgewählt.".into());
    }
    let client = http_client()?;
    let response = client
        .post("http://127.0.0.1:11434/api/chat")
        .json(&json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": false
        }))
        .send()
        .await
        .map_err(|e| format!("Ollama nicht erreichbar: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Ollama HTTP {status}: {body}"));
    }
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    body.get("message")
        .and_then(|v| v.get("content"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Ollama hat keinen Sprechertext geliefert.".into())
}

#[tauri::command]
async fn wikimedia_search(query: String, limit: u8) -> Result<Vec<MediaResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Leerer Bild-Suchbegriff.".into());
    }
    let client = http_client()?;
    let limit_value = limit.clamp(1, 20).to_string();
    let response = client
        .get("https://commons.wikimedia.org/w/api.php")
        .query(&[
            ("action", "query"),
            ("generator", "search"),
            ("gsrsearch", query),
            ("gsrnamespace", "6"),
            ("gsrlimit", limit_value.as_str()),
            ("prop", "imageinfo"),
            ("iiprop", "url|extmetadata"),
            ("iiurlwidth", "900"),
            ("format", "json"),
        ])
        .send()
        .await
        .map_err(|e| format!("Wikimedia nicht erreichbar: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Wikimedia HTTP {}", response.status()));
    }
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    if let Some(pages) = body.pointer("/query/pages").and_then(Value::as_object) {
        for page in pages.values() {
            let info = page.pointer("/imageinfo/0").unwrap_or(&Value::Null);
            let thumb = info.get("thumburl").or_else(|| info.get("url")).and_then(Value::as_str).unwrap_or("");
            let original = info.get("url").or_else(|| info.get("thumburl")).and_then(Value::as_str).unwrap_or("");
            if thumb.is_empty() || original.is_empty() { continue; }
            results.push(MediaResult {
                title: page.get("title").and_then(Value::as_str).unwrap_or("Datei").trim_start_matches("File:").to_string(),
                thumb_url: thumb.to_string(),
                original_url: original.to_string(),
                page_url: info.get("descriptionurl").and_then(Value::as_str).unwrap_or("").to_string(),
                license: metadata(info, "LicenseShortName").or_else(|| metadata(info, "License")).unwrap_or_else(|| "Unbekannt".into()),
                artist: strip_html(&metadata(info, "Artist").or_else(|| metadata(info, "Credit")).unwrap_or_else(|| "Unbekannt".into())),
            });
        }
    }
    Ok(results)
}

#[tauri::command]
fn create_tts(app: tauri::AppHandle, text: String, voice: String) -> Result<String, String> {
    if !Path::new("/usr/bin/say").exists() {
        return Err("macOS TTS (/usr/bin/say) ist nicht verfügbar.".into());
    }
    if text.trim().is_empty() {
        return Err("Kein Sprechertext vorhanden.".into());
    }
    let dir = ensure_data_dir(&app)?;
    let output = dir.join(format!("voice-{}.aiff", timestamp()));
    let mut cmd = Command::new("/usr/bin/say");
    if !voice.trim().is_empty() {
        cmd.arg("-v").arg(voice.trim());
    }
    let status = cmd.arg("-o").arg(&output).arg(text).status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("macOS TTS fehlgeschlagen (Exit {:?}).", status.code()));
    }
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
async fn render_vertical_video(app: tauri::AppHandle, image_url: String, audio_path: String) -> Result<String, String> {
    let ffmpeg = resolve_binary("ffmpeg").ok_or_else(|| "FFmpeg wurde nicht gefunden. Installiere es mit: brew install ffmpeg".to_string())?;
    if !Path::new(&audio_path).exists() {
        return Err("TTS-Audiodatei wurde nicht gefunden.".into());
    }
    let dir = ensure_data_dir(&app)?;
    let image_path = dir.join(format!("visual-{}.img", timestamp()));
    download_to(&image_url, &image_path).await?;
    let output = dir.join(format!("tiktok-news-{}.mp4", timestamp()));

    let filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1";
    let common = [
        "-y", "-loop", "1", "-i",
    ];
    let mut command = Command::new(&ffmpeg);
    command.args(common).arg(&image_path).arg("-i").arg(&audio_path)
        .args(["-vf", filter, "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart"])
        .arg(&output);
    let first = command.output().map_err(|e| format!("FFmpeg Startfehler: {e}"))?;

    if !first.status.success() {
        let mut fallback = Command::new(&ffmpeg);
        fallback.args(common).arg(&image_path).arg("-i").arg(&audio_path)
            .args(["-vf", filter, "-c:v", "h264_videotoolbox", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart"])
            .arg(&output);
        let second = fallback.output().map_err(|e| format!("FFmpeg Fallback-Startfehler: {e}"))?;
        if !second.status.success() {
            let stderr = String::from_utf8_lossy(&second.stderr);
            return Err(format!("FFmpeg Renderfehler: {}", tail(&stderr, 900)));
        }
    }
    let _ = fs::remove_file(&image_path);
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
async fn replicate_predict(token: String, version: String, input_json: String) -> Result<Value, String> {
    if token.trim().is_empty() || version.trim().is_empty() {
        return Err("Replicate Token und Modellkennung sind erforderlich.".into());
    }
    let input: Value = serde_json::from_str(&input_json).map_err(|e| format!("Ungültiges Replicate Input JSON: {e}"))?;
    if !input.is_object() {
        return Err("Replicate Input muss ein JSON-Objekt sein.".into());
    }
    let client = http_client()?;
    let response = client
        .post("https://api.replicate.com/v1/predictions")
        .header(AUTHORIZATION, format!("Bearer {}", token.trim()))
        .header(CONTENT_TYPE, "application/json")
        .header("Prefer", "wait=60")
        .json(&json!({ "version": version.trim(), "input": input }))
        .send()
        .await
        .map_err(|e| format!("Replicate nicht erreichbar: {e}"))?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    let body: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({"raw": text}));
    if !status.is_success() {
        return Err(format!("Replicate HTTP {status}: {body}"));
    }
    Ok(body)
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("Datei existiert nicht.".into());
    }
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status().map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("Finder konnte nicht geöffnet werden.".into()) }
}

async fn ollama_models() -> (bool, Vec<String>) {
    let client = match http_client() { Ok(c) => c, Err(_) => return (false, vec![]) };
    let response = match client.get("http://127.0.0.1:11434/api/tags").timeout(Duration::from_secs(2)).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return (false, vec![]),
    };
    let body: Value = match response.json().await { Ok(v) => v, Err(_) => return (true, vec![]) };
    let models = body.get("models").and_then(Value::as_array).map(|items| {
        items.iter().filter_map(|m| m.get("name").and_then(Value::as_str).map(str::to_string)).collect()
    }).unwrap_or_default();
    (true, models)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("TikTokNewsStudioLocal/0.1 (+https://github.com/xturn2u/make_tt_news)")
        .timeout(Duration::from_secs(75))
        .build()
        .map_err(|e| e.to_string())
}

fn ensure_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("outputs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

async fn download_to(url: &str, target: &Path) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Nur HTTP(S)-Medienquellen sind zulässig.".into());
    }
    let response = http_client()?.get(url).header(USER_AGENT, "TikTokNewsStudioLocal/0.1").send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Mediendownload HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 80 * 1024 * 1024 {
        return Err("Bilddatei ist größer als 80 MB.".into());
    }
    fs::write(target, &bytes).map_err(|e| e.to_string())
}

fn best_content_section(html: &str) -> &str {
    for tag in ["article", "main"] {
        if let Some(section) = extract_html_tag(html, tag) {
            let start = section.as_ptr() as usize - html.as_ptr() as usize;
            return &html[start..start + section.len()];
        }
    }
    html
}

fn extract_html_tag<'a>(html: &'a str, tag: &str) -> Option<&'a str> {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let start = lower.find(&open)?;
    let content_start = lower[start..].find('>')? + start + 1;
    let end = lower[content_start..].find(&close)? + content_start;
    Some(&html[content_start..end])
}

fn remove_ignored_blocks(input: &str) -> String {
    let mut result = input.to_string();
    for tag in ["script", "style", "svg", "noscript", "template"] {
        loop {
            let lower = result.to_ascii_lowercase();
            let open = format!("<{tag}");
            let close = format!("</{tag}>");
            let Some(start) = lower.find(&open) else { break };
            let Some(relative_end) = lower[start..].find(&close) else {
                result.truncate(start);
                break;
            };
            let end = start + relative_end + close.len();
            result.replace_range(start..end, " ");
        }
    }
    result
}

fn decode_entities(input: &str) -> String {
    input
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&ndash;", "–")
        .replace("&mdash;", "—")
}

fn truncate_chars(input: &str, max: usize) -> String {
    if input.chars().count() <= max {
        input.to_string()
    } else {
        input.chars().take(max).collect()
    }
}

fn metadata(info: &Value, key: &str) -> Option<String> {
    info.get("extmetadata")?.get(key)?.get("value")?.as_str().map(str::to_string)
}

fn strip_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => { in_tag = false; out.push(' '); },
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn resolve_binary(name: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = env::var_os("PATH") {
        candidates.extend(env::split_paths(&path).map(|p| p.join(name)));
    }
    candidates.extend([
        PathBuf::from(format!("/opt/homebrew/bin/{name}")),
        PathBuf::from(format!("/usr/local/bin/{name}")),
        PathBuf::from(format!("/usr/bin/{name}")),
    ]);
    candidates.into_iter().find(|p| p.is_file())
}

fn timestamp() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn tail(value: &str, max: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= max { value.to_string() } else { chars[chars.len()-max..].iter().collect() }
}


#[tauri::command]
async fn ollama_pull_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    let model = model.trim();
    if model.is_empty() { return Err("Kein Modell ausgewählt.".into()); }
    let client = http_client()?;
    let request = || client.post("http://127.0.0.1:11434/api/pull")
        .json(&json!({"name": model, "stream": true}));
    let response = match request().send().await {
        Ok(response) if response.status().is_success() => response,
        _ => {
            // Ollama can be installed but still starting in the background.
            let _ = Command::new("/usr/bin/open").args(["-a", "Ollama"]).status();
            std::thread::sleep(Duration::from_secs(2));
            request().send().await.map_err(|_| "Local-AI-Runtime konnte nicht erreicht werden. Bitte die Runtime in den Einstellungen erneut starten.".to_string())?
        }
    };
    if !response.status().is_success() {
        return Err(format!("Modell konnte nicht geladen werden (Ollama HTTP {}).", response.status()));
    }

    let _ = app.emit("model-progress", json!({"model": model, "status": "Download gestartet", "percent": 0}));
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Modell-Download fehlgeschlagen: {e}"))?;
        buffer.extend_from_slice(&chunk);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = buffer.drain(..=position).collect();
            let line = String::from_utf8_lossy(&line);
            if let Ok(value) = serde_json::from_str::<Value>(line.trim()) {
                let status = value.get("status").and_then(Value::as_str).unwrap_or("Lädt …");
                let completed = value.get("completed").and_then(Value::as_u64);
                let total = value.get("total").and_then(Value::as_u64);
                let percent = match (completed, total) {
                    (Some(done), Some(total)) if total > 0 => Some((done as f64 / total as f64) * 100.0),
                    _ => None,
                };
                let _ = app.emit("model-progress", json!({
                    "model": model,
                    "status": status,
                    "completed": completed,
                    "total": total,
                    "percent": percent
                }));
            }
        }
    }
    if !buffer.is_empty() {
        if let Ok(value) = serde_json::from_slice::<Value>(&buffer) {
            let status = value.get("status").and_then(Value::as_str).unwrap_or("Installation abgeschlossen");
            let _ = app.emit("model-progress", json!({"model": model, "status": status, "percent": 100}));
        }
    }
    let _ = app.emit("model-progress", json!({"model": model, "status": "Installation abgeschlossen", "percent": 100}));
    Ok(())
}

#[tauri::command]
async fn install_ollama(app: tauri::AppHandle) -> Result<String, String> {
    let dir = ensure_data_dir(&app)?.join("runtime");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let archive = dir.join("Ollama-darwin.zip");
    let bytes = http_client()?.get("https://ollama.com/download/Ollama-darwin.zip")
        .send().await.map_err(|e| format!("Ollama-Download fehlgeschlagen: {e}"))?
        .bytes().await.map_err(|e| e.to_string())?;
    fs::write(&archive, &bytes).map_err(|e| e.to_string())?;
    let unpack = dir.join("unpacked");
    let _ = fs::remove_dir_all(&unpack);
    fs::create_dir_all(&unpack).map_err(|e| e.to_string())?;
    let status = Command::new("/usr/bin/ditto").args(["-x", "-k"]).arg(&archive).arg(&unpack).status().map_err(|e| e.to_string())?;
    if !status.success() { return Err("Ollama-Archiv konnte nicht entpackt werden.".into()); }
    let app_bundle = find_named_path(&unpack, "Ollama.app").ok_or("Ollama-App wurde im Download nicht gefunden.")?;
    let home = env::var_os("HOME").ok_or("Benutzerordner nicht gefunden.")?;
    let destination = PathBuf::from(home).join("Applications").join("Ollama.app");
    fs::create_dir_all(destination.parent().unwrap()).map_err(|e| e.to_string())?;
    let _ = Command::new("/usr/bin/ditto").arg(&app_bundle).arg(&destination).status();
    let _ = Command::new("/usr/bin/open").arg("-a").arg(&destination).status();
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
async fn install_ffmpeg(app: tauri::AppHandle) -> Result<String, String> {
    if let Some(path) = resolve_binary("ffmpeg") { return Ok(path.to_string_lossy().to_string()); }
    if let Some(brew) = resolve_binary("brew") {
        let status = Command::new(brew).args(["install", "ffmpeg"]).status().map_err(|e| format!("FFmpeg-Installation konnte nicht gestartet werden: {e}"))?;
        if status.success() {
            if let Some(path) = resolve_binary("ffmpeg") { return Ok(path.to_string_lossy().to_string()); }
        }
    }

    // Fallback: install a self-contained binary into the app data directory.
    let runtime = ensure_data_dir(&app)?.join("runtime");
    let bin_dir = runtime.join("bin");
    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    let destination = bin_dir.join("ffmpeg");
    if destination.is_file() {
        let _ = Command::new("/bin/chmod").args(["755", destination.to_string_lossy().as_ref()]).status();
        return Ok(destination.to_string_lossy().to_string());
    }
    let url = if env::consts::ARCH == "aarch64" {
        "https://www.osxexperts.net/ffmpeg80arm.zip"
    } else {
        "https://www.osxexperts.net/ffmpeg80intel.zip"
    };
    let archive = runtime.join(format!("ffmpeg-{}.zip", timestamp()));
    let response = http_client()?.get(url).send().await.map_err(|e| format!("FFmpeg-Download fehlgeschlagen: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("FFmpeg-Download HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| format!("FFmpeg-Download fehlgeschlagen: {e}"))?;
    fs::write(&archive, &bytes).map_err(|e| e.to_string())?;
    let unpack = runtime.join(format!("ffmpeg-unpacked-{}", timestamp()));
    fs::create_dir_all(&unpack).map_err(|e| e.to_string())?;
    let status = Command::new("/usr/bin/ditto").args(["-x", "-k"]).arg(&archive).arg(&unpack).status().map_err(|e| e.to_string())?;
    if !status.success() { return Err("FFmpeg-Archiv konnte nicht entpackt werden.".into()); }
    let source = find_named_path(&unpack, "ffmpeg").ok_or("FFmpeg-Binary wurde im Download nicht gefunden.")?;
    fs::copy(&source, &destination).map_err(|e| format!("FFmpeg konnte nicht eingerichtet werden: {e}"))?;
    let _ = Command::new("/bin/chmod").args(["755", destination.to_string_lossy().as_ref()]).status();
    let _ = fs::remove_file(&archive);
    let _ = fs::remove_dir_all(&unpack);
    Ok(destination.to_string_lossy().to_string())
}

fn find_named_path(root: &Path, name: &str) -> Option<PathBuf> {
    if root.file_name().and_then(|v| v.to_str()) == Some(name) { return Some(root.to_path_buf()); }
    if !root.is_dir() { return None; }
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        if let Some(found) = find_named_path(&entry.path(), name) { return Some(found); }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            system_status,
            install_ollama,
            ollama_pull_model,
            install_ffmpeg,
            fetch_news_article,
            ollama_generate,
            wikimedia_search,
            create_tts,
            render_vertical_video,
            replicate_predict,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running TikTok News Studio Local");
}
