#[cfg(target_os = "windows")]
fn enable_privileges(names: &[&str]) -> Result<(), String> {
    use std::iter;
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::{
                CloseHandle, GetLastError, SetLastError, ERROR_NOT_ALL_ASSIGNED, HANDLE, LUID,
                WIN32_ERROR,
            },
            Security::{
                AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES,
                SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
            },
            System::Threading::{GetCurrentProcess, OpenProcessToken},
        },
    };

    unsafe {
        let mut token: HANDLE = HANDLE::default();
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        )
        .map_err(|e| format!("OpenProcessToken failed: {e}"))?;

        let result = (|| {
            for &name in names {
                let mut luid = LUID::default();
                let wide: Vec<u16> = name.encode_utf16().chain(iter::once(0)).collect();
                LookupPrivilegeValueW(None, PCWSTR(wide.as_ptr()), &mut luid)
                    .map_err(|e| format!("LookupPrivilegeValueW failed for {name}: {e}"))?;

                let tp = TOKEN_PRIVILEGES {
                    PrivilegeCount: 1,
                    Privileges: [LUID_AND_ATTRIBUTES {
                        Luid: luid,
                        Attributes: SE_PRIVILEGE_ENABLED,
                    }],
                };

                SetLastError(WIN32_ERROR(0));
                AdjustTokenPrivileges(token, false, Some(&tp), 0, None, None)
                    .map_err(|e| format!("AdjustTokenPrivileges failed for {name}: {e}"))?;

                if GetLastError() == ERROR_NOT_ALL_ASSIGNED {
                    return Err(format!(
                        "Process token does not include {name}. Please grant this privilege to the current user or run as administrator."
                    ));
                }
            }
            Ok(())
        })();

        if let Err(e) = CloseHandle(token) {
            eprintln!("CloseHandle failed: {e}");
        }

        result
    }
}

#[cfg(target_os = "windows")]
pub fn enable_backup_privilege() -> Result<(), String> {
    enable_privileges(&["SeBackupPrivilege"])
}

// Removed enable_monitoring_privileges - no longer needed
// Specs telemetry now uses fallback methods that don't require privileges

#[cfg(not(target_os = "windows"))]
pub fn enable_backup_privilege() -> Result<(), String> {
    Ok(())
}
