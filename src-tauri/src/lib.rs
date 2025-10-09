mod scanner;

use scanner::{scan_directory_with_progress, get_drives, FileEntry};
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[tauri::command]
fn scan_drive(path: String, app: AppHandle) -> Result<FileEntry, String> {
    // Input validation
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let path_obj = Path::new(&path);

    if !path_obj.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    // Scan with real-time progress events
    match scan_directory_with_progress(path_obj, |files_scanned, bytes_scanned| {
        let _ = app.emit("scan-progress", serde_json::json!({
            "files_scanned": files_scanned,
            "bytes_scanned": bytes_scanned,
        }));
    }) {
        Ok(result) => {
            eprintln!("✅ Scan completed successfully: {} bytes, {} children",
                     result.size, result.children.len());
            Ok(result)
        },
        Err(e) => {
            eprintln!("❌ Scan failed: {}", e);
            Err(format!("Failed to scan: {}", e))
        }
    }
}

#[tauri::command]
fn list_drives() -> Vec<String> {
    let drives = get_drives();
    eprintln!("📁 Found {} drives: {:?}", drives.len(), drives);
    drives
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_drive, list_drives])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
