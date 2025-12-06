# How to Fix "Process token does not include SeDebugPrivilege" Warning

## What is this warning?

The warning "Process token does not include SeDebugPrivilege" appears because your application is trying to access low-level system performance counters for accurate CPU and temperature monitoring, but doesn't have the necessary Windows privileges.

## Why does it happen?

Windows has special privileges that control what applications can do:
- **SeDebugPrivilege**: Allows reading detailed process/system information
- **SeBackupPrivilege**: Allows bypassing file security to read any file

Your app tries to enable these for better telemetry, but by default, regular user applications don't have them.

## How to fix it:

### Option 1: Run as Administrator (Easiest)
1. Right-click on `unbox-7zip.exe`
2. Select "Run as administrator"
3. The warning will disappear

### Option 2: Grant Privileges to Your User Account (Permanent)

**WARNING: This modifies system security policy. Only do this if you understand the implications.**

1. Press `Win + R`, type `secpol.msc`, press Enter
2. Navigate to: **Local Policies** → **User Rights Assignment**
3. Find **"Debug programs"** (this is SeDebugPrivilege)
4. Double-click it
5. Click **"Add User or Group"**
6. Type your username, click **"Check Names"**, then **OK**
7. Click **OK** to close the dialog
8. **Restart your computer** for changes to take effect

### Option 3: Modify the App (Remove the privilege request)

If you don't need precise CPU monitoring, you can remove the privilege request:

1. Open `src-tauri/src/lib.rs`
2. Find the lines that call `enable_monitoring_privileges()` and `enable_backup_privilege()`
3. Comment them out or remove them
4. Rebuild the app with `npm run tauri build`

## What happens if you ignore it?

**Nothing critical!** The app will still work fine. The warning just means:
- CPU usage might be slightly less accurate (uses a fallback method)
- Some system files might not be scannable in the Space app
- Temperature sensors might not be available

## Is it safe to grant these privileges?

- **For development**: Yes, if you trust yourself
- **For production/distribution**: **NO** - users should not grant these privileges to third-party apps
- **Best practice**: The app should work without these privileges (which it does!)

## Technical Details

The app tries to enable:
1. **SeDebugPrivilege** - For reading Windows Performance Counters (CPU usage per core)
2. **SeBackupPrivilege** - For scanning all files including system-protected ones

Both are optional and the app gracefully falls back to standard APIs if not available.

## Recommended Solution

**For normal use**: Just ignore the warning. The app works fine without these privileges.

**For development/testing**: Run as administrator when you need full system access.

**For production**: Remove the privilege requests from the code since end users won't have these privileges anyway.
