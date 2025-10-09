use jwalk::WalkDir;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub children: Vec<FileEntry>,
}

/// Fast parallel directory scanner using jwalk (4x faster than walkdir)
///
/// Architecture: Clean, single-purpose scanner that leverages jwalk's built-in parallelism
/// - No admin privileges required
/// - Automatically skips reparse points and symlinks
/// - Built-in parallel processing
/// - Sorted results by default
pub fn scan_directory_with_progress<F>(
    path: &Path,
    mut progress_callback: F,
) -> Result<FileEntry, Box<dyn std::error::Error>>
where
    F: FnMut(usize, u64),
{
    eprintln!("🚀 Starting jwalk scan of: {:?}", path);

    if !path.exists() {
        return Err(format!("Path does not exist: {:?}", path).into());
    }

    // Build hierarchical tree from flat jwalk output with progress
    let root = build_file_tree_with_progress(path, &mut progress_callback)?;

    eprintln!("✅ Scan complete: {} bytes total", root.size);
    Ok(root)
}

fn build_file_tree_with_progress<F>(
    root_path: &Path,
    progress_callback: &mut F,
) -> Result<FileEntry, Box<dyn std::error::Error>>
where
    F: FnMut(usize, u64),
{
    // Walk the directory tree in parallel with jwalk
    let walker = WalkDir::new(root_path)
        .skip_hidden(false)
        .follow_links(false) // Don't follow symlinks
        .sort(true); // Sort results for consistency

    // Collect all entries with progress tracking
    let mut entries: Vec<(PathBuf, u64, bool)> = Vec::new();
    let mut files_scanned: usize = 0;
    let mut bytes_scanned: u64 = 0;
    let mut last_report = std::time::Instant::now();

    eprintln!("📋 Starting to collect entries...");

    for entry in walker {
        match entry {
            Ok(entry) => {
                let path = entry.path();

                // Skip special Windows device files (nul, con, prn, aux, etc.)
                if let Some(name) = path.file_name() {
                    let name_lower = name.to_string_lossy().to_lowercase();
                    if name_lower == "nul" || name_lower == "con" || name_lower == "prn"
                        || name_lower == "aux" || name_lower.starts_with("com")
                        || name_lower.starts_with("lpt") {
                        continue;
                    }
                }

                let metadata = match entry.metadata() {
                    Ok(m) => m,
                    Err(e) => {
                        // Only log non-device file errors
                        if !path.to_string_lossy().contains("nul") {
                            eprintln!("  ⚠️  Can't read metadata for {:?}: {}", path, e);
                        }
                        continue;
                    }
                };

                let is_dir = metadata.is_dir();
                let size = if is_dir { 0 } else { metadata.len() };

                entries.push((path, size, is_dir));

                files_scanned += 1;
                bytes_scanned += size;

                // Emit progress every 100ms to avoid flooding the UI
                if last_report.elapsed().as_millis() > 100 {
                    progress_callback(files_scanned, bytes_scanned);
                    last_report = std::time::Instant::now();
                }
            }
            Err(e) => {
                eprintln!("  ⚠️  Skipping entry: {}", e);
                continue;
            }
        }
    }

    eprintln!("📊 Collected {} entries total", entries.len());

    // Final progress update
    progress_callback(files_scanned, bytes_scanned);

    // Build tree structure from flat list
    let tree = build_tree_from_entries(root_path, &entries)?;
    Ok(tree)
}

fn build_tree_from_entries(
    root_path: &Path,
    entries: &[(PathBuf, u64, bool)],
) -> Result<FileEntry, Box<dyn std::error::Error>> {
    // Create a map of path -> FileEntry for efficient lookup
    let mut node_map: HashMap<PathBuf, FileEntry> = HashMap::new();

    // First pass: Create all nodes
    for (path, size, is_dir) in entries {
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let entry = FileEntry {
            path: path.to_string_lossy().to_string(),
            name,
            size: *size,
            is_dir: *is_dir,
            children: Vec::new(),
        };

        node_map.insert(path.clone(), entry);
    }

    // Second pass: Build parent-child relationships and calculate directory sizes
    let mut paths: Vec<PathBuf> = node_map.keys().cloned().collect();

    // Sort by depth (deepest first) so we can calculate sizes bottom-up
    paths.sort_by(|a, b| {
        let depth_a = a.components().count();
        let depth_b = b.components().count();
        depth_b.cmp(&depth_a) // Reverse order (deepest first)
    });

    eprintln!("🔨 Building tree from {} entries", paths.len());
    eprintln!("📂 Root path: {:?}", root_path);

    for path in &paths {
        if let Some(parent_path) = path.parent() {
            if parent_path != path && node_map.contains_key(parent_path) {
                // Remove child from map (transfer ownership to parent)
                if let Some(child) = node_map.remove(path) {
                    eprintln!("  ➡️  Moving {:?} to parent {:?}", path.file_name().unwrap_or_default(), parent_path.file_name().unwrap_or_default());
                    // Add child size to parent and add to children
                    if let Some(parent) = node_map.get_mut(parent_path) {
                        parent.size += child.size;
                        parent.children.push(child);
                    }
                }
            }
        }
    }

    // Sort children by size (descending) for better visualization
    for entry in node_map.values_mut() {
        entry.children.sort_by(|a, b| b.size.cmp(&a.size));
    }

    // Return the root entry
    eprintln!("🔍 Remaining entries in map: {}", node_map.len());
    eprintln!("🔍 Map keys: {:?}", node_map.keys().collect::<Vec<_>>());

    match node_map.remove(root_path) {
        Some(root) => {
            eprintln!("✅ Root found! Size: {}, Children: {}", root.size, root.children.len());
            Ok(root)
        },
        None => {
            eprintln!("❌ Root path not found: {:?}", root_path);
            eprintln!("❌ Available paths in map:");
            for key in node_map.keys() {
                eprintln!("  - {:?}", key);
            }
            Err("Root path not found in entries".into())
        }
    }
}

pub fn get_drives() -> Vec<String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = Path::new(&drive);
            if path.exists() {
                drives.push(drive);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        drives.push("/".to_string());
        let common_mounts = vec!["/home", "/mnt", "/media"];
        for mount in common_mounts {
            if Path::new(mount).exists() {
                drives.push(mount.to_string());
            }
        }
    }

    drives
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;

    fn create_test_directory() -> PathBuf {
        use std::time::{SystemTime, UNIX_EPOCH};

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_dir = std::env::temp_dir().join(format!("space_test_scan_{}", timestamp));

        let _ = fs::remove_dir_all(&test_dir);
        fs::create_dir_all(&test_dir).unwrap();

        // Create test structure
        let mut f1 = File::create(test_dir.join("file1.txt")).unwrap();
        f1.write_all(&vec![b'A'; 100]).unwrap();

        let mut f2 = File::create(test_dir.join("file2.txt")).unwrap();
        f2.write_all(&vec![b'B'; 200]).unwrap();

        let folder1 = test_dir.join("folder1");
        fs::create_dir(&folder1).unwrap();

        let mut f3 = File::create(folder1.join("file3.txt")).unwrap();
        f3.write_all(&vec![b'C'; 300]).unwrap();

        test_dir
    }

    #[test]
    fn test_scan_directory_basic() {
        let test_dir = create_test_directory();
        let result = scan_directory_with_progress(&test_dir, |_, _| {}).unwrap();

        assert!(result.is_dir);
        assert_eq!(result.size, 600); // 100 + 200 + 300
        assert!(result.children.len() >= 2); // At least 2 files + 1 folder

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_get_drives() {
        let drives = get_drives();
        assert!(!drives.is_empty(), "Should find at least one drive");

        #[cfg(target_os = "windows")]
        {
            for drive in &drives {
                assert!(
                    drive.ends_with(":\\"),
                    "Drive should end with :\\, got: {}",
                    drive
                );
            }
        }
    }

    #[test]
    fn test_scan_nonexistent_directory() {
        let test_dir = std::env::temp_dir().join("space_test_nonexistent_12345");
        let _ = fs::remove_dir_all(&test_dir);

        let result = scan_directory_with_progress(&test_dir, |_, _| {});
        assert!(result.is_err(), "Should return error for nonexistent directory");
    }
}
