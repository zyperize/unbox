use once_cell::sync::Lazy;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use sysinfo::System;

#[derive(Debug, Clone)]
pub struct CpuLoadSample {
    pub total: f32,
    pub per_core: Vec<f32>,
}

pub fn sample_cpu_load(sys: Option<&mut System>) -> Option<CpuLoadSample> {
    #[cfg(target_os = "windows")]
    {
        let _ = sys;
        windows_cpu_sample()
    }

    #[cfg(not(target_os = "windows"))]
    {
        sys.and_then(|system| {
            system.refresh_cpu_usage();
            if system.cpus().is_empty() {
                None
            } else {
                let per_core = system
                    .cpus()
                    .iter()
                    .map(|cpu| cpu.cpu_usage())
                    .collect::<Vec<_>>();
                Some(CpuLoadSample {
                    total: system.global_cpu_usage(),
                    per_core,
                })
            }
        })
    }
}

#[cfg(target_os = "windows")]
fn windows_cpu_sample() -> Option<CpuLoadSample> {
    use windows::Wdk::System::SystemInformation::{
        NtQuerySystemInformation, SYSTEM_INFORMATION_CLASS,
    };
    use windows::Win32::Foundation::{STATUS_INFO_LENGTH_MISMATCH, STATUS_SUCCESS};
    use windows::Win32::System::WindowsProgramming::SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION;

    const SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION_CLASS: SYSTEM_INFORMATION_CLASS =
        SYSTEM_INFORMATION_CLASS(8);

    #[derive(Clone)]
    struct CpuTimes {
        idle: u64,
        kernel: u64,
        user: u64,
    }

    static LAST_SAMPLE: Lazy<Mutex<Vec<CpuTimes>>> = Lazy::new(|| Mutex::new(Vec::new()));

    fn query_processor_info() -> Option<Vec<SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION>> {
        let mut capacity = 32usize;

        loop {
            let mut buffer = vec![SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION::default(); capacity];
            let buffer_size = (buffer.len()
                * std::mem::size_of::<SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION>())
                as u32;
            let mut bytes_returned: u32 = 0;

            let status = unsafe {
                NtQuerySystemInformation(
                    SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION_CLASS,
                    buffer.as_mut_ptr() as *mut _,
                    buffer_size,
                    &mut bytes_returned,
                )
            };

            match status {
                s if s == STATUS_INFO_LENGTH_MISMATCH => {
                    capacity *= 2;
                    continue;
                }
                s if s == STATUS_SUCCESS => {
                    let count = (bytes_returned as usize)
                        / std::mem::size_of::<SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION>();
                    buffer.truncate(count);
                    return Some(buffer);
                }
                _ => return None,
            }
        }
    }

    let counters = query_processor_info()?;
    if counters.is_empty() {
        return None;
    }

    let mut guard = LAST_SAMPLE.lock().ok()?;
    if guard.len() != counters.len() {
        *guard = counters
            .iter()
            .map(|info| CpuTimes {
                idle: info.IdleTime as u64,
                kernel: info.KernelTime as u64,
                user: info.UserTime as u64,
            })
            .collect();
        return None;
    }

    let mut total_busy: f64 = 0.0;
    let mut total_time: f64 = 0.0;
    let mut per_core = Vec::with_capacity(counters.len());

    for (idx, info) in counters.iter().enumerate() {
        let prev = &mut guard[idx];
        let idle = info.IdleTime as u64;
        let kernel = info.KernelTime as u64;
        let user = info.UserTime as u64;

        let idle_delta = idle.saturating_sub(prev.idle);
        let kernel_delta = kernel.saturating_sub(prev.kernel);
        let user_delta = user.saturating_sub(prev.user);
        let total_delta = (kernel_delta + user_delta).max(1);
        let busy_delta = total_delta.saturating_sub(idle_delta);

        let usage = if total_delta > 0 {
            (busy_delta as f64 / total_delta as f64 * 100.0) as f32
        } else {
            0.0
        };

        per_core.push(usage);
        total_busy += busy_delta as f64;
        total_time += total_delta as f64;

        prev.idle = idle;
        prev.kernel = kernel;
        prev.user = user;
    }

    if total_time <= 0.0 {
        return None;
    }

    let total = ((total_busy / total_time) * 100.0).clamp(0.0, 100.0) as f32;
    Some(CpuLoadSample { total, per_core })
}

#[cfg(target_os = "windows")]
#[derive(Debug, Deserialize)]
#[serde(rename = "Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine")]
struct Win32GpuEngineCounter {
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "UtilizationPercentage")]
    utilization_percentage: Option<u32>,
}

#[cfg(target_os = "windows")]
pub fn gpu_engine_usage() -> HashMap<String, f32> {
    use wmi::{COMLibrary, WMIConnection};

    let com = match COMLibrary::new() {
        Ok(instance) => instance,
        Err(_) => return HashMap::new(),
    };
    let connection = match WMIConnection::new(com.into()) {
        Ok(conn) => conn,
        Err(_) => return HashMap::new(),
    };

    let counters: Vec<Win32GpuEngineCounter> = match connection.query() {
        Ok(list) => list,
        Err(_) => return HashMap::new(),
    };

    let mut usage_by_luid: HashMap<String, f32> = HashMap::new();
    for counter in counters {
        let name = match counter.name {
            Some(value) => value.to_lowercase(),
            None => continue,
        };

        let luid = match extract_luid_key(&name) {
            Some(key) => key,
            None => continue,
        };

        let utilization = counter.utilization_percentage.unwrap_or(0) as f32;
        if utilization <= 0.0 {
            continue;
        }

        usage_by_luid
            .entry(luid)
            .and_modify(|current| {
                *current = (*current + utilization).min(100.0);
            })
            .or_insert(utilization.min(100.0));
    }

    usage_by_luid
}

#[cfg(not(target_os = "windows"))]
pub fn gpu_engine_usage() -> HashMap<String, f32> {
    HashMap::new()
}

#[cfg(target_os = "windows")]
fn extract_luid_key(name: &str) -> Option<String> {
    let luid_token = "luid_";
    let start = name.find(luid_token)?;
    let rest = &name[start..];
    let end = rest.find("_phys").unwrap_or(rest.len());
    Some(rest[..end].to_string())
}
