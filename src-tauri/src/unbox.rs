use chrono::{DateTime, Local};
use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_directory: bool,
    pub modified: String,
    pub file_type: String,
    pub is_archive: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryContents {
    pub current_path: String,
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentZipFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
    pub modified_timestamp: u64,
}

#[tauri::command]
pub fn get_directory_contents(path: String) -> Result<DirectoryContents, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut files = Vec::new();

    match fs::read_dir(dir_path) {
        Ok(entries) => {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    let file_path = entry.path().to_string_lossy().to_string();

                    let modified = metadata
                        .modified()
                        .ok()
                        .and_then(|time| {
                            let datetime: DateTime<Local> = time.into();
                            Some(datetime.format("%Y-%m-%d %H:%M:%S").to_string())
                        })
                        .unwrap_or_else(|| "Unknown".to_string());

                    let is_directory = metadata.is_dir();
                    let extension = entry
                        .path()
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    let file_type = if is_directory {
                        "Folder".to_string()
                    } else {
                        extension.to_uppercase()
                    };

                    let is_archive = !is_directory
                        && matches!(
                            extension.as_str(),
                            "7z" | "zip" | "rar" | "tar" | "gz" | "bz2" | "xz"
                        );

                    files.push(FileEntry {
                        name: file_name,
                        path: file_path,
                        size: metadata.len(),
                        is_directory,
                        modified,
                        file_type,
                        is_archive,
                    });
                }
            }
        }
        Err(e) => return Err(format!("Failed to read directory: {}", e)),
    }

    files.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(DirectoryContents {
        current_path: path,
        files,
    })
}

#[tauri::command]
pub fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_common_directories() -> Result<Vec<(String, String)>, String> {
    let mut result = Vec::new();

    if let Some(home) = dirs::home_dir() {
        result.push(("Home".to_string(), home.to_string_lossy().to_string()));

        if let Some(desktop) = dirs::desktop_dir() {
            result.push(("Desktop".to_string(), desktop.to_string_lossy().to_string()));
        }

        if let Some(documents) = dirs::document_dir() {
            result.push((
                "Documents".to_string(),
                documents.to_string_lossy().to_string(),
            ));
        }

        if let Some(downloads) = dirs::download_dir() {
            result.push((
                "Downloads".to_string(),
                downloads.to_string_lossy().to_string(),
            ));
        }

        if let Some(pictures) = dirs::picture_dir() {
            result.push((
                "Pictures".to_string(),
                pictures.to_string_lossy().to_string(),
            ));
        }

        if let Some(music) = dirs::audio_dir() {
            result.push(("Music".to_string(), music.to_string_lossy().to_string()));
        }

        if let Some(videos) = dirs::video_dir() {
            result.push(("Videos".to_string(), videos.to_string_lossy().to_string()));
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn get_app_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get app path: {}", e))
}

#[tauri::command]
pub fn copy_file(source_path: String, dest_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    let dest = Path::new(&dest_path);

    if source.is_dir() {
        copy_dir_all(source, dest).map_err(|e| format!("Failed to copy directory: {}", e))?;
    } else {
        fs::copy(source, dest).map_err(|e| format!("Failed to copy file: {}", e))?;
    }

    Ok(format!("Copied successfully to {}", dest_path))
}

#[tauri::command]
pub fn move_file(source_path: String, dest_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    let dest = Path::new(&dest_path);

    fs::rename(source, dest).map_err(|e| format!("Failed to move file: {}", e))?;

    Ok(format!("Moved successfully to {}", dest_path))
}

#[tauri::command]
pub fn delete_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(format!("Deleted successfully: {}", file_path))
}

#[tauri::command]
pub fn create_folder(parent_path: String, folder_name: String) -> Result<String, String> {
    let parent = Path::new(&parent_path);
    let new_folder_path = parent.join(&folder_name);

    if new_folder_path.exists() {
        return Err(format!(
            "A folder with the name '{}' already exists",
            folder_name
        ));
    }

    fs::create_dir(&new_folder_path).map_err(|e| format!("Failed to create folder: {}", e))?;

    Ok(new_folder_path.to_string_lossy().to_string())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn extract_archive(archive_path: String, destination_path: String) -> Result<String, String> {
    let archive = Path::new(&archive_path);
    let dest = Path::new(&destination_path);

    if !archive.exists() {
        return Err(format!("Archive does not exist: {}", archive_path));
    }

    let extension = archive
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "7z" => {
            use sevenz_rust::decompress_file;
            decompress_file(archive, dest)
                .map_err(|e| format!("Failed to extract 7z archive: {}", e))?;
        }
        "zip" => {
            use std::io;
            use zip::ZipArchive;

            let file =
                fs::File::open(archive).map_err(|e| format!("Failed to open zip file: {}", e))?;

            let mut archive =
                ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;

            for i in 0..archive.len() {
                let mut file = archive
                    .by_index(i)
                    .map_err(|e| format!("Failed to read file from archive: {}", e))?;

                let outpath = match file.enclosed_name() {
                    Some(path) => dest.join(path),
                    None => continue,
                };

                if file.name().ends_with('/') {
                    fs::create_dir_all(&outpath)
                        .map_err(|e| format!("Failed to create directory: {}", e))?;
                } else {
                    if let Some(p) = outpath.parent() {
                        if !p.exists() {
                            fs::create_dir_all(p)
                                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                        }
                    }
                    let mut outfile = fs::File::create(&outpath)
                        .map_err(|e| format!("Failed to create output file: {}", e))?;
                    io::copy(&mut file, &mut outfile)
                        .map_err(|e| format!("Failed to extract file: {}", e))?;
                }
            }
        }
        _ => {
            return Err(format!("Unsupported archive format: {}", extension));
        }
    }

    Ok(format!("Successfully extracted to {}", destination_path))
}

#[tauri::command]
pub fn create_archive(source_path: String, archive_path: String) -> Result<String, String> {
    use sevenz_rust::compress_to_path;

    let source = Path::new(&source_path);
    let dest = Path::new(&archive_path);

    if !source.exists() {
        return Err(format!("Source does not exist: {}", source_path));
    }

    compress_to_path(source, dest).map_err(|e| format!("Failed to create archive: {}", e))?;

    Ok(format!("Successfully created archive: {}", archive_path))
}

#[tauri::command]
pub fn search_files(directory: String, query: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&directory);

    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }

    let matcher = SkimMatcherV2::default();
    let mut scored_results: Vec<(i64, FileEntry)> = Vec::new();

    for entry in WalkDir::new(dir_path)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if scored_results.len() >= 100 {
            break;
        }

        if let Some(file_name) = entry.file_name().to_str() {
            if let Some(score) = matcher.fuzzy_match(file_name, &query) {
                if let Ok(metadata) = entry.metadata() {
                    let modified = metadata
                        .modified()
                        .ok()
                        .and_then(|time| {
                            let datetime: DateTime<Local> = time.into();
                            Some(datetime.format("%Y-%m-%d %H:%M:%S").to_string())
                        })
                        .unwrap_or_else(|| "Unknown".to_string());

                    let is_directory = metadata.is_dir();

                    let extension = entry
                        .path()
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    let file_type = if is_directory {
                        "Folder".to_string()
                    } else {
                        extension.to_uppercase()
                    };

                    let is_archive = !is_directory
                        && matches!(
                            extension.as_str(),
                            "7z" | "zip" | "rar" | "tar" | "gz" | "bz2" | "xz"
                        );

                    scored_results.push((
                        score,
                        FileEntry {
                            name: file_name.to_string(),
                            path: entry.path().to_string_lossy().to_string(),
                            size: metadata.len(),
                            is_directory,
                            modified,
                            file_type,
                            is_archive,
                        },
                    ));
                }
            }
        }
    }

    scored_results.sort_by(|a, b| b.0.cmp(&a.0));

    Ok(scored_results
        .into_iter()
        .map(|(_, file)| file)
        .take(100)
        .collect())
}

#[tauri::command]
pub fn get_recent_zip_files(home_directory: Option<String>) -> Result<Vec<RecentZipFile>, String> {
    let home_dir = if let Some(path) = home_directory {
        PathBuf::from(path)
    } else {
        dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?
    };

    static ARCHIVE_EXTENSIONS: &[&str] = &["7z", "zip", "rar", "tar", "gz", "bz2", "xz"];

    let mut zip_files = Vec::new();

    for entry in WalkDir::new(home_dir)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if let Some(extension) = entry
            .path()
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
        {
            if ARCHIVE_EXTENSIONS.contains(&extension.as_str()) {
                if let Ok(metadata) = entry.metadata() {
                    let modified = metadata
                        .modified()
                        .ok()
                        .and_then(|time| {
                            let datetime: DateTime<Local> = time.into();
                            Some(datetime.format("%Y-%m-%d %H:%M:%S").to_string())
                        })
                        .unwrap_or_else(|| "Unknown".to_string());

                    let modified_timestamp = metadata
                        .modified()
                        .unwrap_or(SystemTime::UNIX_EPOCH)
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .map(|duration| duration.as_secs())
                        .unwrap_or(0);

                    zip_files.push(RecentZipFile {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: entry.path().to_string_lossy().to_string(),
                        size: metadata.len(),
                        modified,
                        modified_timestamp,
                    });
                }
            }
        }
    }

    zip_files.sort_by(|a, b| b.modified_timestamp.cmp(&a.modified_timestamp));
    zip_files.truncate(20);

    Ok(zip_files)
}

#[tauri::command]
pub fn register_context_menu(app_path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let extensions = ["7z", "zip", "rar", "tar", "gz", "bz2", "xz"];

        for ext in extensions {
            let key_path = format!("HKEY_CLASSES_ROOT\\.{}\\shell\\UnboxExtract", ext);
            let command_path = format!("HKEY_CLASSES_ROOT\\.{}\\shell\\UnboxExtract\\command", ext);

            Command::new("reg")
                .args(["add", &key_path, "/ve", "/d", "Extract with Unbox", "/f"])
                .output()
                .map_err(|e| format!("Failed to create registry key: {}", e))?;

            Command::new("reg")
                .args(["add", &key_path, "/v", "Icon", "/d", &app_path, "/f"])
                .output()
                .map_err(|e| format!("Failed to set icon: {}", e))?;

            let command_value = format!("\"{}\" \"%1\"", app_path);
            Command::new("reg")
                .args(["add", &command_path, "/ve", "/d", &command_value, "/f"])
                .output()
                .map_err(|e| format!("Failed to set command: {}", e))?;
        }

        Ok("Context menu registered successfully".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Context menu registration is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub fn unregister_context_menu() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let extensions = ["7z", "zip", "rar", "tar", "gz", "bz2", "xz"];

        for ext in extensions {
            let key_path = format!("HKEY_CLASSES_ROOT\\.{}\\shell\\UnboxExtract", ext);

            Command::new("reg")
                .args(["delete", &key_path, "/f"])
                .output()
                .ok();
        }

        Ok("Context menu unregistered successfully".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Context menu unregistration is only supported on Windows".to_string())
    }
}
