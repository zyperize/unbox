use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering as CmpOrdering;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use sysinfo::{Components, Disks, Networks, ProcessesToUpdate, System};
use tauri::Emitter;
use uuid::Uuid;

#[cfg(target_os = "windows")]
use wmi::WMIConnection;

#[cfg(target_os = "windows")]
use wmi::COMLibrary;

#[cfg(target_os = "windows")]
use nvml_wrapper::{enum_wrappers::device::TemperatureSensor, Nvml};

mod scanner;
mod telemetry;
mod unbox;
#[cfg(target_os = "windows")]
mod windows_privileges;

static SYS: Lazy<Mutex<System>> = Lazy::new(|| Mutex::new(System::new_all()));
static DISKS: Lazy<Mutex<Disks>> = Lazy::new(|| Mutex::new(Disks::new_with_refreshed_list()));
static COMPONENTS: Lazy<Mutex<Components>> =
    Lazy::new(|| Mutex::new(Components::new_with_refreshed_list()));
static NETWORKS: Lazy<Mutex<Networks>> =
    Lazy::new(|| Mutex::new(Networks::new_with_refreshed_list()));
static ACTIVE_SCANS: Lazy<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static SPACE_SNAPSHOTS: Lazy<Mutex<HashMap<String, Arc<scanner::SpaceSnapshot>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static SPACE_PROGRESS: Lazy<Mutex<HashMap<String, scanner::ScanProgress>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[cfg(target_os = "windows")]
fn monitor_privilege_warning() -> Option<String> {
    // Removed privilege requests - Specs works fine with fallback telemetry
    None
}

#[cfg(not(target_os = "windows"))]
fn monitor_privilege_warning() -> Option<String> {
    None
}

#[derive(Debug, Serialize)]
struct CpuSnapshot {
    name: String,
    usage: f32,
    clock_mhz: u64,
    logical_cores: usize,
    physical_cores: usize,
    per_core_usage: Vec<f32>,
}

#[derive(Debug, Serialize)]
struct GpuSnapshot {
    name: String,
    vendor: Option<String>,
    driver_version: Option<String>,
    memory_total: Option<u64>,
    memory_used: Option<u64>,
    utilization: Option<f32>,
    temperature: Option<f32>,
    #[serde(skip_serializing)]
    luid_key: Option<String>,
}

#[derive(Debug, Serialize)]
struct MemorySnapshot {
    total: u64,
    used: u64,
    swap_total: u64,
    swap_used: u64,
}

#[derive(Debug, Serialize)]
struct DiskSnapshot {
    mount: String,
    name: String,
    file_system: String,
    total: u64,
    used: u64,
}

#[derive(Debug, Serialize, Default)]
struct TempsSnapshot {
    cpu: Option<f32>,
    gpu: Option<f32>,
    warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessSnapshot {
    pid: u32,
    name: String,
    cpu_usage: f32,
    memory_kb: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkSnapshot {
    interface_name: String,
    received_bytes: u64,
    transmitted_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpecsSnapshot {
    cpu: CpuSnapshot,
    gpus: Vec<GpuSnapshot>,
    memory: MemorySnapshot,
    disks: Vec<DiskSnapshot>,
    temps: TempsSnapshot,
    top_processes: Vec<ProcessSnapshot>,
    network: Vec<NetworkSnapshot>,
    uptime_seconds: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanStartedPayload {
    job_id: String,
    path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanProgressPayload {
    job_id: String,
    progress: scanner::ScanProgress,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanCompletePayload {
    job_id: String,
    result: scanner::SpaceScanResult,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanCancelledPayload {
    job_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanErrorPayload {
    job_id: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveStatPayload {
    path: String,
    total_bytes: u64,
    available_bytes: u64,
}

#[tauri::command]
fn specs_snapshot() -> Result<SpecsSnapshot, String> {
    let mut sys = SYS
        .lock()
        .map_err(|_| "System metrics unavailable".to_string())?;

    sys.refresh_cpu_frequency();
    sys.refresh_memory();

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_frequency = sys.cpus().first().map(|cpu| cpu.frequency()).unwrap_or(0);
    let logical_cores = sys.cpus().len();
    let physical_cores = sys.physical_core_count().unwrap_or(logical_cores);

    let cpu_load_sample = telemetry::sample_cpu_load(Some(&mut sys));
    let (cpu_usage, per_core_usage) = if let Some(sample) = cpu_load_sample {
        (sample.total, sample.per_core)
    } else {
        sys.refresh_cpu_usage();
        let fallback = sys
            .cpus()
            .iter()
            .map(|cpu| cpu.cpu_usage())
            .collect::<Vec<_>>();
        let usage = if fallback.is_empty() {
            sys.global_cpu_usage()
        } else {
            let total: f32 = fallback.iter().copied().sum();
            total / fallback.len() as f32
        };
        (usage, fallback)
    };
    let cpu = CpuSnapshot {
        name: cpu_brand,
        usage: cpu_usage,
        clock_mhz: cpu_frequency,
        logical_cores,
        physical_cores,
        per_core_usage,
    };

    let memory = MemorySnapshot {
        total: sys.total_memory(),
        used: sys.used_memory(),
        swap_total: sys.total_swap(),
        swap_used: sys.used_swap(),
    };

    drop(sys);

    let privilege_warning = monitor_privilege_warning();

    let mut gpus = load_wmi_gpus();
    enrich_gpu_metrics(&mut gpus);
    append_gpu_engine_usage(&mut gpus);
    augment_gpus_with_nvml(&mut gpus);

    let disks = {
        let mut disks_guard = DISKS
            .lock()
            .map_err(|_| "Disk metrics unavailable".to_string())?;
        disks_guard.refresh();
        disks_guard
            .list()
            .iter()
            .map(|disk| {
                let total = disk.total_space();
                let available = disk.available_space();
                DiskSnapshot {
                    mount: disk.mount_point().to_string_lossy().to_string(),
                    name: disk.name().to_string_lossy().to_string(),
                    file_system: disk.file_system().to_string_lossy().to_string(),
                    total,
                    used: total.saturating_sub(available),
                }
            })
            .collect::<Vec<_>>()
    };

    let mut temps = collect_temperatures(&mut gpus)?;
    if temps.cpu.is_none() {
        temps.cpu = cpu_temperature_from_wmi();
    }
    if temps.gpu.is_none() {
        temps.gpu = gpus
            .iter()
            .filter_map(|gpu| gpu.temperature)
            .max_by(|a, b| a.partial_cmp(b).unwrap_or(CmpOrdering::Equal));
    }
    temps.warning = privilege_warning;

    // Get top processes by CPU usage
    let top_processes = {
        let mut sys_guard = SYS
            .lock()
            .map_err(|_| "System metrics unavailable".to_string())?;
        sys_guard.refresh_processes(ProcessesToUpdate::All);
        let mut procs: Vec<ProcessSnapshot> = sys_guard
            .processes()
            .iter()
            .map(|(pid, proc)| ProcessSnapshot {
                pid: pid.as_u32(),
                name: proc.name().to_string_lossy().to_string(),
                cpu_usage: proc.cpu_usage(),
                memory_kb: proc.memory() / 1024,
            })
            .filter(|p| p.cpu_usage > 0.1 || p.memory_kb > 10_000)
            .collect();
        procs.sort_by(|a, b| {
            b.cpu_usage
                .partial_cmp(&a.cpu_usage)
                .unwrap_or(CmpOrdering::Equal)
        });
        procs.truncate(10);
        procs
    };

    // Get network interfaces
    let network = {
        let mut nets_guard = NETWORKS
            .lock()
            .map_err(|_| "Network metrics unavailable".to_string())?;
        nets_guard.refresh();
        nets_guard
            .iter()
            .filter(|(name, _)| !name.starts_with("vEthernet") && !name.contains("Loopback"))
            .map(|(name, data)| NetworkSnapshot {
                interface_name: name.clone(),
                received_bytes: data.total_received(),
                transmitted_bytes: data.total_transmitted(),
            })
            .collect::<Vec<_>>()
    };

    // Get uptime
    let uptime_seconds = System::uptime();

    Ok(SpecsSnapshot {
        cpu,
        gpus,
        memory,
        disks,
        temps,
        top_processes,
        network,
        uptime_seconds,
    })
}

#[cfg(target_os = "windows")]
#[derive(Debug, Deserialize)]
#[serde(rename = "Win32_VideoController")]
struct Win32VideoController {
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "AdapterCompatibility")]
    adapter_compatibility: Option<String>,
    #[serde(rename = "DriverVersion")]
    driver_version: Option<String>,
    #[serde(rename = "AdapterRAM")]
    adapter_ram: Option<u64>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Deserialize)]
#[serde(rename = "Win32_PerfFormattedData_Counters_ThermalZoneInformation")]
struct ThermalZoneInformation {
    #[serde(rename = "HighPrecisionTemperature")]
    high_precision_temperature: Option<u32>,
    #[serde(rename = "Temperature")]
    temperature: Option<u32>,
}

#[cfg(target_os = "windows")]
fn load_wmi_gpus() -> Vec<GpuSnapshot> {
    let com = match COMLibrary::new() {
        Ok(com) => com,
        Err(_) => return Vec::new(),
    };

    let connection = match WMIConnection::new(com.into()) {
        Ok(conn) => conn,
        Err(_) => return Vec::new(),
    };

    let controllers: Vec<Win32VideoController> = match connection.query() {
        Ok(result) => result,
        Err(_) => return Vec::new(),
    };

    controllers
        .into_iter()
        .map(|controller| {
            let name = controller
                .name
                .clone()
                .unwrap_or_else(|| "Unknown GPU".to_string());
            let vendor = controller.adapter_compatibility.clone().and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            });
            let driver = controller.driver_version.clone().and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            });

            GpuSnapshot {
                name,
                vendor,
                driver_version: driver,
                memory_total: controller.adapter_ram,
                memory_used: None,
                utilization: None,
                temperature: None,
                luid_key: None,
            }
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn load_wmi_gpus() -> Vec<GpuSnapshot> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn enrich_gpu_metrics(gpus: &mut Vec<GpuSnapshot>) {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::core::Interface;
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIAdapter1, IDXGIAdapter3, IDXGIFactory4, DXGI_ADAPTER_DESC1,
        DXGI_MEMORY_SEGMENT_GROUP_LOCAL, DXGI_QUERY_VIDEO_MEMORY_INFO,
    };

    if gpus.is_empty() {
        return;
    }

    unsafe {
        let factory = match CreateDXGIFactory1::<IDXGIFactory4>() {
            Ok(factory) => factory,
            Err(_) => return,
        };

        let mut index = 0;
        loop {
            let adapter: IDXGIAdapter1 = match factory.EnumAdapters1(index) {
                Ok(adapter) => adapter,
                Err(_) => break,
            };
            index += 1;

            let adapter3: IDXGIAdapter3 = match adapter.cast() {
                Ok(a) => a,
                Err(_) => continue,
            };

            let desc: DXGI_ADAPTER_DESC1 = match adapter.GetDesc1() {
                Ok(desc) => desc,
                Err(_) => continue,
            };

            let description = {
                let slice = &desc.Description;
                let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
                OsString::from_wide(&slice[..end])
                    .to_string_lossy()
                    .to_string()
            };
            let description_lower = description.to_lowercase();

            let mut info = DXGI_QUERY_VIDEO_MEMORY_INFO::default();
            if adapter3
                .QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &mut info)
                .is_err()
            {
                continue;
            }

            let usage = info.CurrentUsage as u64;
            let budget = info.Budget as u64;

            if let Some(gpu) = gpus.iter_mut().find(|gpu| {
                let gpu_name = gpu.name.to_lowercase();
                gpu_name.contains(&description_lower) || description_lower.contains(&gpu_name)
            }) {
                gpu.luid_key = Some(format_adapter_luid(&desc.AdapterLuid));
                if usage > 0 {
                    gpu.memory_used = Some(usage);
                }
                if gpu.memory_total.is_none() && budget > 0 {
                    gpu.memory_total = Some(budget);
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn enrich_gpu_metrics(_: &mut Vec<GpuSnapshot>) {}

#[cfg(target_os = "windows")]
fn format_adapter_luid(luid: &windows::Win32::Foundation::LUID) -> String {
    format!(
        "luid_0x{high:08x}_0x{low:08x}",
        high = luid.HighPart as u32,
        low = luid.LowPart
    )
}

#[cfg(target_os = "windows")]
fn append_gpu_engine_usage(gpus: &mut [GpuSnapshot]) {
    let usage_map = telemetry::gpu_engine_usage();
    if usage_map.is_empty() {
        return;
    }

    let mut applied_any = false;
    for gpu in gpus.iter_mut() {
        if let Some(luid) = gpu.luid_key.as_ref() {
            if let Some(value) = usage_map.get(luid) {
                gpu.utilization = Some(*value);
                applied_any = true;
            }
        }
    }

    if !applied_any && usage_map.len() == 1 {
        if let Some(value) = usage_map.values().next() {
            if let Some(first_gpu) = gpus.iter_mut().next() {
                first_gpu.utilization = Some(*value);
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn append_gpu_engine_usage(_: &mut [GpuSnapshot]) {}

#[cfg(target_os = "windows")]
fn augment_gpus_with_nvml(gpus: &mut Vec<GpuSnapshot>) {
    let nvml = match Nvml::init() {
        Ok(instance) => instance,
        Err(_) => return,
    };

    let count = match nvml.device_count() {
        Ok(value) => value,
        Err(_) => return,
    };

    for index in 0..count {
        let device = match nvml.device_by_index(index) {
            Ok(dev) => dev,
            Err(_) => continue,
        };

        let name = device.name().unwrap_or_else(|_| "NVIDIA GPU".to_string());
        let name_lower = name.to_lowercase();
        let mem_info = device.memory_info().ok();
        let utilization = device
            .utilization_rates()
            .ok()
            .map(|rates| rates.gpu as f32)
            .map(|value| value.clamp(0.0, 100.0));
        let temperature = device
            .temperature(TemperatureSensor::Gpu)
            .ok()
            .map(|value| value as f32);

        if let Some(entry) = gpus.iter_mut().find(|gpu| {
            let gpu_name = gpu.name.to_lowercase();
            gpu_name.contains(&name_lower) || name_lower.contains(&gpu_name)
        }) {
            if let Some(info) = mem_info {
                entry.memory_total = Some(info.total);
                entry.memory_used = Some(info.used);
            }
            if utilization.is_some() {
                entry.utilization = utilization;
            }
            if temperature.is_some() {
                entry.temperature = temperature;
            }
            if entry.vendor.is_none() {
                entry.vendor = Some("NVIDIA".to_string());
            }
        } else {
            gpus.push(GpuSnapshot {
                name,
                vendor: Some("NVIDIA".to_string()),
                driver_version: None,
                memory_total: mem_info.as_ref().map(|info| info.total),
                memory_used: mem_info.map(|info| info.used),
                utilization,
                temperature,
                luid_key: None,
            });
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn augment_gpus_with_nvml(_: &mut Vec<GpuSnapshot>) {}

#[cfg(target_os = "windows")]
fn cpu_temperature_from_wmi() -> Option<f32> {
    let com = COMLibrary::new().ok()?;
    let connection = WMIConnection::new(com.into()).ok()?;
    let zones: Vec<ThermalZoneInformation> = connection.query().ok()?;

    zones
        .into_iter()
        .filter_map(|zone| {
            zone.high_precision_temperature
                .map(|raw| (raw as f32 / 10.0) - 273.15)
                .or_else(|| zone.temperature.map(|raw| (raw as f32) - 273.15))
        })
        .filter(|temp| temp.is_finite() && *temp > -40.0 && *temp < 150.0)
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(CmpOrdering::Equal))
}

#[cfg(not(target_os = "windows"))]
fn cpu_temperature_from_wmi() -> Option<f32> {
    None
}

fn collect_temperatures(gpus: &mut Vec<GpuSnapshot>) -> Result<TempsSnapshot, String> {
    let mut components = COMPONENTS
        .lock()
        .map_err(|_| "Temperature metrics unavailable".to_string())?;
    components.refresh();

    let mut temps = TempsSnapshot::default();

    for component in components.list() {
        let label = component.label();
        let label_lower = label.to_lowercase();

        if temps.cpu.is_none() && label_lower.contains("cpu") {
            temps.cpu = Some(component.temperature());
        }

        if label_lower.contains("gpu") || label_lower.contains("graphics") {
            if temps.gpu.is_none() {
                temps.gpu = Some(component.temperature());
            }

            if !label.is_empty() {
                let normalized_label = label.trim().to_string();
                let already_tracked = gpus.iter_mut().find(|gpu| {
                    let gpu_name_lower = gpu.name.to_lowercase();
                    gpu_name_lower.contains(&label_lower)
                        || label_lower.contains(&gpu_name_lower)
                        || gpu_name_lower.contains("gpu")
                });

                if let Some(existing) = already_tracked {
                    if existing.temperature.is_none() {
                        existing.temperature = Some(component.temperature());
                    }
                    if existing.vendor.is_none() && normalized_label.contains("nvidia") {
                        existing.vendor = Some("NVIDIA".to_string());
                    } else if existing.vendor.is_none() && normalized_label.contains("amd") {
                        existing.vendor = Some("AMD".to_string());
                    } else if existing.vendor.is_none() && normalized_label.contains("intel") {
                        existing.vendor = Some("Intel".to_string());
                    }
                } else {
                    gpus.push(GpuSnapshot {
                        name: normalized_label,
                        vendor: None,
                        driver_version: None,
                        memory_total: None,
                        memory_used: None,
                        utilization: None,
                        temperature: Some(component.temperature()),
                        luid_key: None,
                    });
                }
            }
        }
    }

    Ok(temps)
}

#[tauri::command]
fn space_scan_start<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    path: String,
    job_id: Option<String>,
) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        // Try to enable SeBackupPrivilege for scanning protected files
        // Silently ignore if not available - scanner works fine without it for normal files
        let _ = windows_privileges::enable_backup_privilege();
    }

    let job_id = job_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let cancel_flag = Arc::new(AtomicBool::new(false));

    {
        let mut registry = ACTIVE_SCANS
            .lock()
            .map_err(|_| "Scan registry unavailable".to_string())?;
        registry.insert(job_id.clone(), cancel_flag.clone());
    }

    let started_payload = ScanStartedPayload {
        job_id: job_id.clone(),
        path: path.clone(),
    };
    let _ = app_handle.emit("space-scan-started", started_payload);

    let handle_for_thread = app_handle.clone();
    let job_id_for_thread = job_id.clone();
    let cancel_for_thread = cancel_flag.clone();
    let path_for_thread = path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let progress_handle = handle_for_thread.clone();
        let job_id_for_progress = job_id_for_thread.clone();

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            scanner::summarize_directory(
                Path::new(&path_for_thread),
                |progress| {
                    if let Ok(mut progress_map) = SPACE_PROGRESS.lock() {
                        progress_map.insert(job_id_for_progress.clone(), progress.clone());
                    }
                    let _ = progress_handle.emit(
                        "space-scan-progress",
                        ScanProgressPayload {
                            job_id: job_id_for_progress.clone(),
                            progress,
                        },
                    );
                },
                120,
                &cancel_for_thread,
            )
        }));

        if let Ok(mut registry) = ACTIVE_SCANS.lock() {
            registry.remove(&job_id_for_thread);
        }
        if let Ok(mut progress_map) = SPACE_PROGRESS.lock() {
            progress_map.remove(&job_id_for_thread);
        }

        match result {
            Ok(Ok(snapshot)) => {
                let root_summary = snapshot.root.clone();

                if let Ok(mut store) = SPACE_SNAPSHOTS.lock() {
                    store.insert(job_id_for_progress.clone(), Arc::new(snapshot));
                }

                let _ = handle_for_thread.emit(
                    "space-scan-complete",
                    ScanCompletePayload {
                        job_id: job_id_for_progress.clone(),
                        result: root_summary,
                    },
                );
            }
            Ok(Err(scanner::ScanError::Cancelled)) => {
                let _ = handle_for_thread.emit(
                    "space-scan-cancelled",
                    ScanCancelledPayload {
                        job_id: job_id_for_progress.clone(),
                    },
                );
            }
            Ok(Err(err)) => {
                let _ = handle_for_thread.emit(
                    "space-scan-error",
                    ScanErrorPayload {
                        job_id: job_id_for_progress.clone(),
                        message: err.to_string(),
                    },
                );
            }
            Err(_) => {
                let _ = handle_for_thread.emit(
                    "space-scan-error",
                    ScanErrorPayload {
                        job_id: job_id_for_progress.clone(),
                        message: "Scanner panicked while traversing the filesystem".to_string(),
                    },
                );
            }
        }
    });

    Ok(job_id)
}

#[tauri::command]
fn space_scan_cancel(job_id: String) -> Result<(), String> {
    let cancel_flag = {
        let registry = ACTIVE_SCANS
            .lock()
            .map_err(|_| "Scan registry unavailable".to_string())?;
        registry.get(&job_id).cloned()
    };

    if let Some(flag) = cancel_flag {
        flag.store(true, Ordering::Relaxed);
    }

    if let Ok(mut snapshots) = SPACE_SNAPSHOTS.lock() {
        snapshots.remove(&job_id);
    }

    Ok(())
}

#[tauri::command]
fn space_scan_snapshot(job_id: String, path: String) -> Result<scanner::SpaceScanResult, String> {
    let snapshots = SPACE_SNAPSHOTS
        .lock()
        .map_err(|_| "Snapshot registry unavailable".to_string())?;
    let snapshot = snapshots
        .get(&job_id)
        .ok_or_else(|| "Scan not found".to_string())?;

    if let Some(result) = snapshot.get(&path).cloned() {
        return Ok(result);
    }

    let normalized = Path::new(&path).to_path_buf();
    let normalized_key = normalized.to_string_lossy().to_string();
    let mut candidate = snapshot.get(&normalized_key).cloned();

    #[cfg(target_os = "windows")]
    {
        if candidate.is_none()
            && !normalized_key.is_empty()
            && normalized_key.len() >= 2
            && normalized_key.as_bytes()[1] == b':'
        {
            let mut chars: Vec<char> = normalized_key.chars().collect();
            if let Some(first) = chars.first_mut() {
                if first.is_ascii_lowercase() {
                    *first = first.to_ascii_uppercase();
                    let alt: String = chars.into_iter().collect();
                    candidate = snapshot.get(&alt).cloned();
                }
            }
        }
    }

    candidate.ok_or_else(|| "Path not found in snapshot".to_string())
}

#[tauri::command]
fn space_scan_status(job_id: String) -> Option<scanner::ScanProgress> {
    SPACE_PROGRESS
        .lock()
        .ok()
        .and_then(|map| map.get(&job_id).cloned())
}

#[tauri::command]
fn space_scan_release(job_id: String) -> Result<(), String> {
    if let Ok(mut snapshots) = SPACE_SNAPSHOTS.lock() {
        snapshots.remove(&job_id);
    }
    if let Ok(mut progress_map) = SPACE_PROGRESS.lock() {
        progress_map.remove(&job_id);
    }
    Ok(())
}

#[tauri::command]
fn space_drives() -> Vec<String> {
    scanner::get_drives()
}

#[tauri::command]
fn space_drive_stats() -> Result<Vec<DriveStatPayload>, String> {
    let mut disks = DISKS
        .lock()
        .map_err(|_| "Disk metrics unavailable".to_string())?;
    disks.refresh_list();
    disks.refresh();

    #[cfg(target_os = "windows")]
    let candidates = scanner::get_drives();
    #[cfg(not(target_os = "windows"))]
    let candidates = scanner::get_drives();

    let mut stats = Vec::new();

    for candidate in candidates {
        let mount = Path::new(&candidate);
        let mut matched = None;
        for disk in disks.iter() {
            if disk.mount_point() == mount {
                matched = Some(disk);
                break;
            }
        }

        if let Some(disk) = matched {
            stats.push(DriveStatPayload {
                path: candidate.clone(),
                total_bytes: disk.total_space(),
                available_bytes: disk.available_space(),
            });
            continue;
        }

        #[cfg(target_os = "windows")]
        {
            use std::ffi::OsStr;
            use std::os::windows::ffi::OsStrExt;
            use std::ptr::addr_of_mut;
            use windows::core::PCWSTR;
            use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

            let mut path_wide: Vec<u16> = OsStr::new(&candidate)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let mut free_bytes_available = 0u64;
            let mut total_number_of_bytes = 0u64;
            let mut total_number_of_free_bytes = 0u64;

            let ok = unsafe {
                GetDiskFreeSpaceExW(
                    PCWSTR::from_raw(path_wide.as_mut_ptr()),
                    Some(addr_of_mut!(free_bytes_available)),
                    Some(addr_of_mut!(total_number_of_bytes)),
                    Some(addr_of_mut!(total_number_of_free_bytes)),
                )
            };

            if ok.is_ok() {
                stats.push(DriveStatPayload {
                    path: candidate.clone(),
                    total_bytes: total_number_of_bytes,
                    available_bytes: total_number_of_free_bytes,
                });
                continue;
            }
        }

        stats.push(DriveStatPayload {
            path: candidate.clone(),
            total_bytes: 0,
            available_bytes: 0,
        });
    }

    Ok(stats)
}

#[tauri::command]
fn space_top_files(
    path: String,
    limit: Option<usize>,
) -> Result<Vec<scanner::TopFileEntry>, String> {
    let limit = limit.unwrap_or(15).clamp(1, 200);
    scanner::list_largest_files(Path::new(&path), limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn space_delete_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("Path does not exist".to_string());
    }

    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn space_reveal_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("Path does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let status = if target.is_dir() {
            Command::new("explorer").arg(&path).status()
        } else {
            let arg = format!("/select,\"{}\"", path.replace('"', "\"\""));
            Command::new("explorer").arg(arg).status()
        }
        .map_err(|e| e.to_string())?;

        if status.success() {
            return Ok(());
        } else {
            return Err(format!(
                "Explorer exited with status {}",
                status.code().unwrap_or(-1)
            ));
        }
    }

    #[cfg(target_os = "macos")]
    {
        let status = if target.is_dir() {
            Command::new("open").arg(&path).status()
        } else {
            Command::new("open").arg("-R").arg(&path).status()
        }
        .map_err(|e| e.to_string())?;

        if status.success() {
            return Ok(());
        } else {
            return Err(format!(
                "open exited with status {}",
                status.code().unwrap_or(-1)
            ));
        }
    }

    #[cfg(target_os = "linux")]
    {
        let directory = if target.is_dir() {
            target
        } else {
            target.parent().unwrap_or(target)
        };
        let status = Command::new("xdg-open")
            .arg(directory)
            .status()
            .map_err(|e| e.to_string())?;

        if status.success() {
            return Ok(());
        } else {
            return Err(format!(
                "xdg-open exited with status {}",
                status.code().unwrap_or(-1)
            ));
        }
    }

    #[allow(unreachable_code)]
    Err("Reveal path not supported on this platform".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Removed early privilege request - SeBackupPrivilege is now requested only when Space scanning starts

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            unbox::get_directory_contents,
            unbox::get_home_directory,
            unbox::get_common_directories,
            unbox::get_app_path,
            unbox::extract_archive,
            unbox::create_archive,
            unbox::search_files,
            unbox::get_recent_zip_files,
            unbox::register_context_menu,
            unbox::unregister_context_menu,
            unbox::copy_file,
            unbox::move_file,
            unbox::delete_file,
            unbox::create_folder,
            specs_snapshot,
            space_scan_start,
            space_scan_cancel,
            space_scan_snapshot,
            space_scan_release,
            space_scan_status,
            space_drives,
            space_drive_stats,
            space_top_files,
            space_delete_path,
            space_reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
