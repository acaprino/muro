//! The lines the notification-area menu shows, read from a registry `snapshot`.

use serde_json::Value;

/// The state line: `In sync · checked HH:MM`, `N changes waiting · checked HH:MM`, or
/// `Not checked yet` when the registry has never been checked or has changed since (the
/// recorded `sync.revision` is not the registry's). A check that left only blockers reads
/// `Needs attention`: a harness that cannot be read is not in sync. `clock` turns the time of
/// the last check, in epoch seconds, into the text shown; without one the line says no time.
pub fn state_line(snapshot: &Value, clock: impl Fn(u64) -> Option<String>) -> String {
    let sync = &snapshot["sync"];
    let checked = sync["last_check"]
        .as_str()
        .and_then(|time| time.parse().ok());
    let (Some(checked), Some(pending)) = (checked, sync["pending"].as_u64()) else {
        return "Not checked yet".into();
    };
    if sync["revision"].is_null() || sync["revision"] != snapshot["registry"]["revision"] {
        return "Not checked yet".into();
    }
    let state = match pending {
        0 if sync["blockers"].as_u64().unwrap_or(0) > 0 => "Needs attention".into(),
        0 => "In sync".to_string(),
        1 => "1 change waiting".into(),
        n => format!("{n} changes waiting"),
    };
    match clock(checked) {
        Some(time) => format!("{state} · checked {time}"),
        None => state,
    }
}

/// The menu item that turns automatic sync off, or back on when it is off.
pub fn pause_label(snapshot: &Value) -> &'static str {
    if snapshot["registry"]["settings"]["auto_sync"] == true {
        "Pause automatic sync"
    } else {
        "Resume automatic sync"
    }
}

/// `HH:MM` on this machine's clock for `epoch` seconds since 1970. Windows only: elsewhere
/// there is no local time to read without another dependency, and the line shows none.
pub fn local_clock(epoch: u64) -> Option<String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{FILETIME, SYSTEMTIME};
        use windows_sys::Win32::System::Time::{
            FileTimeToSystemTime, SystemTimeToTzSpecificLocalTime,
        };
        // A FILETIME counts 100-nanosecond intervals from 1601-01-01.
        let ticks = epoch.checked_add(11_644_473_600)?.checked_mul(10_000_000)?;
        let file = FILETIME {
            dwLowDateTime: ticks as u32,
            dwHighDateTime: (ticks >> 32) as u32,
        };
        // Plain integers, all zero: the calls below fill them in.
        let (mut utc, mut local) = unsafe {
            (
                std::mem::zeroed::<SYSTEMTIME>(),
                std::mem::zeroed::<SYSTEMTIME>(),
            )
        };
        // A null zone is the current one, daylight saving as of that moment.
        let converted = unsafe {
            FileTimeToSystemTime(&file, &mut utc) != 0
                && SystemTimeToTzSpecificLocalTime(std::ptr::null(), &utc, &mut local) != 0
        };
        converted.then(|| format!("{:02}:{:02}", local.wHour, local.wMinute))
    }
    #[cfg(not(windows))]
    {
        let _ = epoch;
        None
    }
}
