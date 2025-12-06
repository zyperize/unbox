use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io::ErrorKind;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::fs::MetadataExt;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub path: String,
    pub completed_children: usize,
    pub total_children: usize,
    pub scanned_entries: usize,
    pub scanned_bytes: u64,
    pub current_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpaceChild {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub file_count: u64,
    pub dir_count: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpaceScanResult {
    pub path: String,
    pub name: String,
    pub total_size: u64,
    pub scanned_entries: usize,
    pub scanned_bytes: u64,
    pub children: Vec<SpaceChild>,
    pub total_children: usize,
    pub other_children: usize,
    pub other_size: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub missing_entries: usize,
    pub permission_denied_entries: usize,
    pub other_errors: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TopFileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug)]
pub enum ScanError {
    Cancelled,
    Io(std::io::Error),
    Other(String),
}

impl std::fmt::Display for ScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScanError::Cancelled => write!(f, "scan cancelled"),
            ScanError::Io(err) => write!(f, "{err}"),
            ScanError::Other(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for ScanError {}

impl From<std::io::Error> for ScanError {
    fn from(value: std::io::Error) -> Self {
        ScanError::Io(value)
    }
}

fn is_windows_device_file(file_name: &str) -> bool {
    let name_lower = file_name.to_lowercase();
    let base = name_lower.split('.').next().unwrap_or(&name_lower);
    base == "nul"
        || base == "con"
        || base == "prn"
        || base == "aux"
        || base.starts_with("com") && base.len() <= 4
        || base.starts_with("lpt") && base.len() <= 4
}

fn is_permission_denied(err: &std::io::Error) -> bool {
    err.kind() == ErrorKind::PermissionDenied || err.raw_os_error() == Some(5)
}

fn is_symlink_or_reparse(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(target_os = "windows"))]
    {
        return false;
    }
}

fn dir_fingerprint(path: &Path) -> Option<String> {
    Some(normalize_path(path))
}

fn debug_log(enabled: bool, file_path: &Path, message: &str) {
    if !enabled {
        return;
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(file_path) {
        let _ = writeln!(file, "{}", message);
    }
}

fn metadata_with_debug(path: &Path, debug_enabled: bool, debug_file: &Path) -> std::io::Result<fs::Metadata> {
    let start = Instant::now();
    let result = fs::symlink_metadata(path);
    if debug_enabled && start.elapsed() > Duration::from_secs(2) {
        debug_log(
            debug_enabled,
            debug_file,
            &format!(
                "[slow] metadata {} duration_ms={} result={:?}",
                path.display(),
                start.elapsed().as_millis(),
                result.as_ref().map(|m| (m.len(), m.permissions().readonly()))
            ),
        );
    }
    result
}

fn read_dir_with_debug(path: &Path, debug_enabled: bool, debug_file: &Path) -> std::io::Result<fs::ReadDir> {
    let start = Instant::now();
    let result = fs::read_dir(path);
    if debug_enabled && start.elapsed() > Duration::from_secs(2) {
        debug_log(
            debug_enabled,
            debug_file,
            &format!(
                "[slow] read_dir start {} duration_ms={} status={}",
                path.display(),
                start.elapsed().as_millis(),
                result.is_ok()
            ),
        );
    }
    result
}

fn normalize_path(path: &Path) -> String {
    let mut raw = path.to_string_lossy().to_string();
    if !raw.ends_with('\\') && !raw.ends_with('/') {
        raw.push(std::path::MAIN_SEPARATOR);
    }
    raw.to_lowercase()
}

fn should_skip_system_path(path: &Path) -> bool {
    let p = normalize_path(path);
    let heavy_roots = [
        "c:\\windows\\winsxs\\",
        "c:\\windows\\installer\\",
        "c:\\windows\\softwaredistribution\\",
        "c:\\windows\\temp\\",
        "c:\\windows\\servicing\\",
        "c:\\$recycle.bin\\",
        "c:\\system volume information\\",
        "c:\\recovery\\",
        "c:\\config.msi\\",
        "c:\\programdata\\packages\\",
        "c:\\program files\\windowsapps\\",
        "c:\\programdata\\microsoft\\windows\\wer\\",
        "c:\\programdata\\microsoft\\windows\\crashreports\\",
        "c:\\programdata\\microsoft\\windows\\deliveryoptimization\\",
        "c:\\programdata\\microsoft\\device metadata\\",
        "c:\\program files (x86)\\steam\\appcache\\httpcache\\",
    ];
    heavy_roots.iter().any(|root| p.starts_with(root))
}

#[derive(Default)]
struct ScanStats {
    missing_entries: usize,
    permission_denied: usize,
    metadata_errors: usize,
    reparse_skipped: usize,
    duplicate_dirs: usize,
    skipped_system: usize,
}

#[derive(Debug, Clone)]
pub struct SpaceSnapshot {
    pub root: SpaceScanResult,
    pub directories: HashMap<String, SpaceScanResult>,
    _limit: usize,
}

impl SpaceSnapshot {
    pub fn get(&self, path: &str) -> Option<&SpaceScanResult> {
        self.directories.get(path)
    }
}

// Directory info accumulated during scan
#[derive(Debug, Clone)]
struct DirInfo {
    path: PathBuf,
    name: String,
    total_size: u64,
    file_count: u64,
    dir_count: u64,
    children: Vec<SpaceChild>,
    total_direct_children: usize,
}

impl DirInfo {
    fn new(path: PathBuf, name: String) -> Self {
        Self {
            path,
            name,
            total_size: 0,
            file_count: 0,
            dir_count: 1, // Count self
            children: Vec::new(),
            total_direct_children: 0,
        }
    }

    fn add_file(&mut self, name: String, path: String, size: u64) {
        self.total_size += size;
        self.file_count += 1;
        self.total_direct_children += 1;
        self.children.push(SpaceChild {
            path,
            name,
            size,
            is_dir: false,
            file_count: 1,
            dir_count: 0,
        });
    }

    fn add_subdir(&mut self, child: SpaceChild) {
        self.total_size += child.size;
        self.file_count += child.file_count;
        self.dir_count += child.dir_count;
        self.total_direct_children += 1;
        self.children.push(child);
    }

    fn finalize(mut self, limit: usize) -> SpaceScanResult {
        // Sort children by size descending
        self.children.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));

        // Keep only top N children, aggregate the rest
        let mut other_size = 0u64;
        let mut other_count = 0usize;
        let top_children: Vec<SpaceChild> = if self.children.len() > limit {
            let (keep, rest) = self.children.split_at(limit);
            for child in rest {
                other_size += child.size;
                other_count += 1;
            }
            keep.to_vec()
        } else {
            self.children
        };

        SpaceScanResult {
            path: self.path.to_string_lossy().to_string(),
            name: self.name,
            total_size: self.total_size,
            scanned_entries: (self.file_count + self.dir_count) as usize,
            scanned_bytes: self.total_size,
            children: top_children,
            total_children: self.total_direct_children,
            other_children: other_count,
            other_size,
            file_count: self.file_count,
            dir_count: self.dir_count,
            missing_entries: 0,
            permission_denied_entries: 0,
            other_errors: 0,
        }
    }
}

/// Queue-based iterative scanner (like WinDirStat)
/// Uses a work queue instead of recursion for better progress tracking
pub fn summarize_directory<F>(
    root: &Path,
    mut progress_callback: F,
    limit: usize,
    cancel_flag: &AtomicBool,
) -> Result<SpaceSnapshot, ScanError>
where
    F: FnMut(ScanProgress),
{
    if !root.exists() {
        return Err(ScanError::Other(format!(
            "Path does not exist: {}",
            root.display()
        )));
    }

    let limit = limit.max(1);
    let root_name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| root.display().to_string());

    let mut stats = ScanStats::default();

    let mut progress = ScanProgress {
        path: root.to_string_lossy().to_string(),
        completed_children: 0,
        total_children: 0,
        scanned_entries: 0,
        scanned_bytes: 0,
        current_path: root.to_string_lossy().to_string(),
    };
    progress_callback(progress.clone());

    let debug_enabled = std::env::var_os("SPACE_SCAN_DEBUG").is_some();
    let debug_file = std::env::var_os("SPACE_SCAN_DEBUG_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("space_scan_debug.log"));
    let scan_start = Instant::now();
    debug_log(
        debug_enabled,
        &debug_file,
        &format!(
            "[start] path={} limit={} debug_file={}",
            root.display(),
            limit,
            debug_file.display()
        ),
    );

    // Work queue: (path, name, parent_path, is_top_level)
    let mut queue: VecDeque<(PathBuf, String, Option<String>, bool)> = VecDeque::new();

    // Directory info storage: path -> DirInfo
    let mut dir_infos: HashMap<String, DirInfo> = HashMap::new();

    // Track which directories are waiting for children to complete
    // parent_path -> set of pending child paths
    let mut pending_children: HashMap<String, Vec<String>> = HashMap::new();
    let mut completed_dirs: HashMap<String, SpaceScanResult> = HashMap::new();
    let mut parent_map: HashMap<String, Option<String>> = HashMap::new();

    // Track top-level items for progress updates
    let mut top_level_pending: HashSet<String> = HashSet::new();
    let mut completed_top_level = 0usize;
    let mut visited_dirs: HashSet<String> = HashSet::new();

    // Initialize root
    let root_path_str = root.to_string_lossy().to_string();
    parent_map.insert(root_path_str.clone(), None);
    dir_infos.insert(root_path_str.clone(), DirInfo::new(root.to_path_buf(), root_name.clone()));

    // Add root's immediate children to queue
    match read_dir_with_debug(root, debug_enabled, &debug_file) {
        Ok(read_dir) => {
            let mut children_paths = Vec::new();
            for entry_result in read_dir {
                if cancel_flag.load(Ordering::Relaxed) {
                    return Err(ScanError::Cancelled);
                }

                match entry_result {
                    Ok(entry) => {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if is_windows_device_file(&name) {
                            continue;
                        }
                        let entry_path = entry.path();
                        if should_skip_system_path(&entry_path) {
                            stats.skipped_system += 1;
                            continue;
                        }
                        let entry_path_str = entry_path.to_string_lossy().to_string();

                        queue.push_back((entry_path, name, Some(root_path_str.clone()), true));
                        children_paths.push(entry_path_str.clone());
                        parent_map.insert(entry_path_str.clone(), Some(root_path_str.clone()));
                        top_level_pending.insert(entry_path_str);
                    }
                    Err(err) => {
                        if err.kind() == ErrorKind::NotFound {
                            stats.missing_entries += 1;
                        } else if is_permission_denied(&err) {
                            stats.permission_denied += 1;
                        } else {
                            stats.metadata_errors += 1;
                        }
                    }
                }
            }
            if !children_paths.is_empty() {
                pending_children.insert(root_path_str.clone(), children_paths);
            }
            progress.total_children = top_level_pending.len();
            progress_callback(progress.clone());
        }
        Err(err) => {
            return Err(ScanError::Io(err));
        }
    }

    let mut last_report = Instant::now();
    let mut last_debug_log = Instant::now();
    let mut last_heartbeat = Instant::now();

    // Process queue iteratively
    while let Some((entry_path, name, parent_path, _is_top_level)) = queue.pop_front() {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err(ScanError::Cancelled);
        }

        let entry_path_str = entry_path.to_string_lossy().to_string();
        progress.current_path = entry_path_str.clone();
        progress.scanned_entries += 1;

        // Heartbeat even if nothing changes, to keep UI alive
        if last_heartbeat.elapsed() >= Duration::from_secs(2) {
            progress_callback(progress.clone());
            last_heartbeat = Instant::now();
        }

        // Emit progress frequently
        if last_report.elapsed() >= Duration::from_millis(50) || progress.scanned_entries % 500 == 0 {
            progress_callback(progress.clone());
            last_report = Instant::now();
            last_heartbeat = Instant::now();
        }

        if debug_enabled && last_debug_log.elapsed() >= Duration::from_secs(3) {
            let queue_len = queue.len();
            debug_log(
                debug_enabled,
                &debug_file,
                &format!(
                    "[progress] scanned_entries={} scanned_bytes={} completed_children={}/{} queue={} current={}",
                    progress.scanned_entries,
                    progress.scanned_bytes,
                    progress.completed_children,
                    progress.total_children,
                    queue_len,
                    progress.current_path
                ),
            );
            last_debug_log = Instant::now();
        }

        if should_skip_system_path(&entry_path) {
            stats.skipped_system += 1;
            if let Some(parent) = &parent_path {
                mark_child_complete(
                    &mut dir_infos,
                    &mut pending_children,
                    &mut completed_dirs,
                    &parent_map,
                    &root_path_str,
                    parent,
                    &entry_path_str,
                    None,
                    limit,
                    &mut top_level_pending,
                    &mut completed_top_level,
                    &mut progress,
                );
            }
            continue;
        }

        // Use symlink_metadata to detect reparse points before following them
        let metadata = match metadata_with_debug(&entry_path, debug_enabled, &debug_file) {
            Ok(meta) => meta,
            Err(err) => {
                if err.kind() == ErrorKind::NotFound {
                    stats.missing_entries += 1;
                } else if is_permission_denied(&err) {
                    stats.permission_denied += 1;
                } else {
                    stats.metadata_errors += 1;
                }
                // Mark this entry as complete for parent tracking
                if let Some(parent) = &parent_path {
                    mark_child_complete(
                        &mut dir_infos,
                        &mut pending_children,
                        &mut completed_dirs,
                        &parent_map,
                        &root_path_str,
                        parent,
                        &entry_path_str,
                        None,
                        limit,
                        &mut top_level_pending,
                        &mut completed_top_level,
                        &mut progress,
                    );
                }
                continue;
            }
        };

        if is_symlink_or_reparse(&metadata) {
            stats.reparse_skipped += 1;
            // Skip traversing symlinks/reparse points to avoid infinite loops
            if let Some(parent) = &parent_path {
                mark_child_complete(
                    &mut dir_infos,
                    &mut pending_children,
                    &mut completed_dirs,
                    &parent_map,
                    &root_path_str,
                    parent,
                    &entry_path_str,
                    None,
                    limit,
                    &mut top_level_pending,
                    &mut completed_top_level,
                    &mut progress,
                );
            }
            continue;
        }

        if metadata.is_file() {
            let size = metadata.len();
            progress.scanned_bytes += size;

            // Add file to parent directory
            if let Some(parent) = &parent_path {
                if let Some(parent_info) = dir_infos.get_mut(parent) {
                    parent_info.add_file(name.clone(), entry_path_str.clone(), size);
                }
                mark_child_complete(
                    &mut dir_infos,
                    &mut pending_children,
                    &mut completed_dirs,
                    &parent_map,
                    &root_path_str,
                    parent,
                    &entry_path_str,
                    None,
                    limit,
                    &mut top_level_pending,
                    &mut completed_top_level,
                    &mut progress,
                );
            }
        } else if metadata.is_dir() {
            // Avoid revisiting the same directory (e.g., via junctions)
            if let Some(fingerprint) = dir_fingerprint(&entry_path) {
                if !visited_dirs.insert(fingerprint) {
                    stats.duplicate_dirs += 1;
                    if let Some(parent) = &parent_path {
                        mark_child_complete(
                            &mut dir_infos,
                            &mut pending_children,
                            &mut completed_dirs,
                            &parent_map,
                            &root_path_str,
                            parent,
                            &entry_path_str,
                            None,
                            limit,
                            &mut top_level_pending,
                            &mut completed_top_level,
                            &mut progress,
                        );
                    }
                    continue;
                }
            }

            // Initialize directory info
            dir_infos.insert(entry_path_str.clone(), DirInfo::new(entry_path.clone(), name.clone()));
            parent_map.insert(entry_path_str.clone(), parent_path.clone());

            // Read directory contents
            match read_dir_with_debug(&entry_path, debug_enabled, &debug_file) {
                Ok(read_dir) => {
                    let mut children_paths = Vec::new();

                    for child_result in read_dir {
                        if cancel_flag.load(Ordering::Relaxed) {
                            return Err(ScanError::Cancelled);
                        }

                        match child_result {
                            Ok(child_entry) => {
                                let child_name = child_entry.file_name().to_string_lossy().to_string();
                                if is_windows_device_file(&child_name) {
                                    continue;
                                }
                                let child_path = child_entry.path();
                                if should_skip_system_path(&child_path) {
                                    stats.skipped_system += 1;
                                    continue;
                                }
                                let child_path_str = child_path.to_string_lossy().to_string();

                                queue.push_back((child_path, child_name, Some(entry_path_str.clone()), false));
                                children_paths.push(child_path_str.clone());
                                parent_map.insert(child_path_str, Some(entry_path_str.clone()));
                            }
                            Err(err) => {
                                if err.kind() == ErrorKind::NotFound {
                                    stats.missing_entries += 1;
                                } else if is_permission_denied(&err) {
                                    stats.permission_denied += 1;
                                } else {
                                    stats.metadata_errors += 1;
                                }
                            }
                        }
                    }

                    if children_paths.is_empty() {
                        // Empty directory - complete it immediately
                        if let Some(parent) = &parent_path {
                            let child_result = dir_infos
                                .remove(&entry_path_str)
                                .map(|info| info.finalize(limit));
                            mark_child_complete(
                                &mut dir_infos,
                                &mut pending_children,
                                &mut completed_dirs,
                                &parent_map,
                                &root_path_str,
                                parent,
                                &entry_path_str,
                                child_result,
                                limit,
                                &mut top_level_pending,
                                &mut completed_top_level,
                                &mut progress,
                            );
                        }
                    } else {
                        pending_children.insert(entry_path_str.clone(), children_paths);
                    }
                }
                Err(err) => {
                    if err.kind() == ErrorKind::NotFound {
                        stats.missing_entries += 1;
                    } else if is_permission_denied(&err) {
                        stats.permission_denied += 1;
                    } else {
                        stats.metadata_errors += 1;
                    }

                    // Directory couldn't be read - complete it
                    if let Some(parent) = &parent_path {
                        let child_result = dir_infos
                            .remove(&entry_path_str)
                            .map(|info| info.finalize(limit));
                        mark_child_complete(
                            &mut dir_infos,
                            &mut pending_children,
                            &mut completed_dirs,
                            &parent_map,
                            &root_path_str,
                            parent,
                            &entry_path_str,
                            child_result,
                            limit,
                            &mut top_level_pending,
                            &mut completed_top_level,
                            &mut progress,
                        );
                    }
                }
            }
        }

        if debug_enabled && last_debug_log.elapsed() >= Duration::from_secs(3) {
            eprintln!(
                "[space scan debug] scanned_entries={}, scanned_bytes={}, completed_children={}/{} current={}",
                progress.scanned_entries,
                progress.scanned_bytes,
                progress.completed_children,
                progress.total_children,
                progress.current_path
            );
            last_debug_log = Instant::now();
        }
    }

    // Finalize root
    let root_info = dir_infos.remove(&root_path_str)
        .unwrap_or_else(|| DirInfo::new(root.to_path_buf(), root_name));

    let mut root_summary = root_info.finalize(limit);
    root_summary.scanned_entries = progress.scanned_entries;
    root_summary.scanned_bytes = progress.scanned_bytes;
    root_summary.missing_entries = stats.missing_entries;
    root_summary.permission_denied_entries = stats.permission_denied;
    root_summary.other_errors = stats.metadata_errors;

    // Build final directories map
    let mut directories: HashMap<String, SpaceScanResult> = completed_dirs;
    directories.insert(root_summary.path.clone(), root_summary.clone());

    // Add any remaining directory infos
    for (path, info) in dir_infos {
        directories.insert(path, info.finalize(limit));
    }

    progress.completed_children = progress.total_children;
    progress_callback(progress.clone());

    if stats.missing_entries > 0 {
        eprintln!(
            "space scan: skipped {} entries that disappeared during scanning",
            stats.missing_entries
        );
    }
    if stats.permission_denied > 0 {
        eprintln!(
            "space scan: skipped {} entries due to permission restrictions (run as administrator for full coverage)",
            stats.permission_denied
        );
    }
    if stats.metadata_errors > 0 {
        eprintln!(
            "space scan: encountered {} entries with unreadable metadata",
            stats.metadata_errors
        );
    }
    if stats.reparse_skipped > 0 {
        eprintln!(
            "space scan: skipped {} reparse points/junctions to avoid loops",
            stats.reparse_skipped
        );
        debug_log(
            debug_enabled,
            &debug_file,
            &format!("reparse_skipped={}", stats.reparse_skipped),
        );
    }
    if stats.duplicate_dirs > 0 {
        eprintln!(
            "space scan: skipped {} duplicate directory visits (already scanned)",
            stats.duplicate_dirs
        );
        debug_log(
            debug_enabled,
            &debug_file,
            &format!("duplicate_dirs={}", stats.duplicate_dirs),
        );
    }
    if stats.skipped_system > 0 {
        eprintln!(
            "space scan: skipped {} heavy system paths (WinSxS/Installer/etc)",
            stats.skipped_system
        );
        debug_log(
            debug_enabled,
            &debug_file,
            &format!("skipped_system={}", stats.skipped_system),
        );
    }

    debug_log(
        debug_enabled,
        &debug_file,
        &format!(
            "[done] duration_ms={} scanned_entries={} scanned_bytes={} missing={} denied={} metadata_errors={} reparse_skipped={} duplicate_dirs={} skipped_system={}",
            scan_start.elapsed().as_millis(),
            progress.scanned_entries,
            progress.scanned_bytes,
            stats.missing_entries,
            stats.permission_denied,
            stats.metadata_errors,
            stats.reparse_skipped,
            stats.duplicate_dirs,
            stats.skipped_system
        ),
    );

    Ok(SpaceSnapshot {
        root: root_summary,
        directories,
        _limit: limit,
    })
}

/// Mark a child as complete and propagate size info up to parent
fn mark_child_complete(
    dir_infos: &mut HashMap<String, DirInfo>,
    pending_children: &mut HashMap<String, Vec<String>>,
    completed_dirs: &mut HashMap<String, SpaceScanResult>,
    parent_map: &HashMap<String, Option<String>>,
    root_path: &str,
    parent_path: &str,
    child_path: &str,
    child_result: Option<SpaceScanResult>,
    limit: usize,
    top_level_pending: &mut HashSet<String>,
    completed_top_level: &mut usize,
    progress: &mut ScanProgress,
) {
    // Mark top-level item as completed exactly once
    if top_level_pending.remove(child_path) {
        *completed_top_level += 1;
        progress.completed_children = *completed_top_level;
    }

    // Record completed directory snapshots (used for drill-down)
    if let Some(result) = child_result.as_ref() {
        if result.path != root_path {
            completed_dirs.insert(result.path.clone(), result.clone());
        }
    }

    // Add child info to parent
    if let Some(result) = child_result {
        if let Some(parent_info) = dir_infos.get_mut(parent_path) {
            parent_info.add_subdir(SpaceChild {
                path: result.path,
                name: result.name,
                size: result.total_size,
                is_dir: true,
                file_count: result.file_count,
                dir_count: result.dir_count,
            });
        }
    }

    // Remove from pending list
    let parent_pending_empty = if let Some(pending) = pending_children.get_mut(parent_path) {
        pending.retain(|p| p != child_path);

        // If parent has no more pending children, propagate completion upward
        if pending.is_empty() {
            pending_children.remove(parent_path);
            true
        } else {
            false
        }
    } else {
        true
    };

    // If this parent directory is now complete (and isn't the root), finalize it and propagate
    if parent_pending_empty && parent_path != root_path {
        if let Some(info) = dir_infos.remove(parent_path) {
            let summary = info.finalize(limit);
            if let Some(Some(grand_parent)) = parent_map.get(parent_path) {
                mark_child_complete(
                    dir_infos,
                    pending_children,
                    completed_dirs,
                    parent_map,
                    root_path,
                    grand_parent,
                    parent_path,
                    Some(summary),
                    limit,
                    top_level_pending,
                    completed_top_level,
                    progress,
                );
            }
        }
    }
}

pub fn list_largest_files(root: &Path, limit: usize) -> Result<Vec<TopFileEntry>, ScanError> {
    use std::cmp::Reverse;
    use std::collections::BinaryHeap;

    if !root.exists() {
        return Err(ScanError::Other(format!(
            "Path does not exist: {}",
            root.display()
        )));
    }

    if root.is_file() {
        let metadata = fs::metadata(root)?;
        let name = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| root.display().to_string());
        return Ok(vec![TopFileEntry {
            path: root.to_string_lossy().to_string(),
            name,
            size: metadata.len(),
        }]);
    }

    let mut heap: BinaryHeap<(Reverse<u64>, PathBuf)> = BinaryHeap::new();
    let mut queue: VecDeque<PathBuf> = VecDeque::new();
    queue.push_back(root.to_path_buf());

    while let Some(dir_path) = queue.pop_front() {
        let read_dir = match fs::read_dir(&dir_path) {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        for entry_result in read_dir {
            let entry = match entry_result {
                Ok(e) => e,
                Err(_) => continue,
            };

            if let Some(file_name) = entry.file_name().to_str() {
                if is_windows_device_file(file_name) {
                    continue;
                }
            }

            let path = entry.path();
            let metadata = match fs::symlink_metadata(entry.path()) {
                Ok(m) => m,
                Err(_) => continue,
            };

            if is_symlink_or_reparse(&metadata) {
                continue;
            }

            if metadata.is_dir() {
                queue.push_back(path);
            } else if metadata.is_file() {
                let size = metadata.len();
                heap.push((Reverse(size), path));
                if heap.len() > limit {
                    heap.pop();
                }
            }
        }
    }

    let mut files: Vec<(u64, PathBuf)> = heap
        .into_iter()
        .map(|(Reverse(size), path)| (size, path))
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));

    Ok(files
        .into_iter()
        .map(|(size, path)| {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.display().to_string());
            TopFileEntry {
                path: path.to_string_lossy().to_string(),
                name,
                size,
            }
        })
        .collect())
}

pub fn get_drives() -> Vec<String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if Path::new(&drive).exists() {
                drives.push(drive);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        drives.push("/".to_string());
        for mount in ["/home", "/mnt", "/media"] {
            if Path::new(mount).exists() {
                drives.push(mount.to_string());
            }
        }
    }

    drives
}
