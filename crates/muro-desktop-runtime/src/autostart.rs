//! Start with Windows: a value of the per-user Run key that starts Muro in the background at
//! sign-in. The key is written with `reg.exe`, never through a shell, and a value is read by its
//! name: whether it exists with `reg.exe`, its text through the registry API.

use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

/// The Run value that starts `exe` in the background; the path is always quoted.
pub fn command(exe: &Path) -> String {
    format!("\"{}\" --background", exe.display())
}

/// `{"supported","enabled","current"}`: whether the Run value `name` exists, and whether it
/// holds `command(exe)`.
pub fn state(name: &str, exe: &Path) -> Result<Value> {
    value_name(name)?;
    #[cfg(windows)]
    {
        let enabled = run_key::exists(name)?;
        let current = enabled && run_key::holds(name, &command(exe))?;
        Ok(json!({"supported":true,"enabled":enabled,"current":current}))
    }
    #[cfg(not(windows))]
    {
        let _ = exe;
        Ok(json!({"supported":false,"enabled":false,"current":false}))
    }
}

/// Writes or removes the Run value `name` and returns the new state.
pub fn set(name: &str, exe: &Path, enabled: bool) -> Result<Value> {
    value_name(name)?;
    #[cfg(windows)]
    {
        if enabled {
            run_key::write(name, exe)?;
        } else if run_key::exists(name)? {
            run_key::delete(name)?;
        }
        state(name, exe)
    }
    #[cfg(not(windows))]
    {
        let _ = (exe, enabled);
        anyhow::bail!("Start with Windows is available on Windows only")
    }
}

/// The executable a Run value names, when the value is a command in the form `command` writes:
/// a quoted path and then whatever follows it. Any other form names nothing with no doubt (an
/// unquoted path may hold spaces, so where it ends is a guess).
pub fn named_executable(command: &str) -> Option<PathBuf> {
    let (path, _) = command.strip_prefix('"')?.split_once('"')?;
    (!path.is_empty()).then(|| PathBuf::from(path))
}

/// Points the Run value `name` at `exe` when it is enabled and the executable it names is gone
/// (Muro was moved or removed, so Windows would start nothing at sign-in). A value that names
/// another executable that still exists is another copy's, and stays: while a development build
/// or a portable copy runs, the installed Muro remains the one that starts with Windows. So
/// does a value that is not a command Muro could have written, whatever it points at, and a
/// disabled value, which stays disabled.
pub fn repair(name: &str, exe: &Path) -> Result<()> {
    let state = state(name, exe)?;
    if state["enabled"] == true && state["current"] == false && names_a_missing_executable(name)? {
        set(name, exe, true)?;
    }
    Ok(())
}

/// Whether the Run value `name` is a command that names an executable no longer on disk. Only a
/// path that is not there (or is a folder) counts as gone: a drive that cannot be reached at the
/// moment, or a file the user may not read, says nothing about the file.
fn names_a_missing_executable(name: &str) -> Result<bool> {
    #[cfg(windows)]
    {
        let Some(command) = run_key::read(name)? else {
            return Ok(false);
        };
        let Some(executable) = named_executable(&command) else {
            return Ok(false);
        };
        Ok(match std::fs::metadata(&executable) {
            Ok(entry) => !entry.is_file(),
            Err(error) => error.kind() == std::io::ErrorKind::NotFound,
        })
    }
    #[cfg(not(windows))]
    {
        let _ = name;
        Ok(false)
    }
}

/// A value name reg.exe cannot take for a switch or a key path.
fn value_name(name: &str) -> Result<()> {
    ensure!(
        !name.is_empty()
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
        "Invalid Run value name: {name:?}"
    );
    Ok(())
}

#[cfg(windows)]
mod run_key {
    use anyhow::{Context, Result, anyhow, bail, ensure};
    use std::path::Path;
    use std::process::{Command, Output, Stdio};
    use windows_sys::Win32::Foundation::{
        ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_SUCCESS, ERROR_UNSUPPORTED_TYPE,
    };
    use windows_sys::Win32::System::Registry::{
        HKEY_CURRENT_USER, REG_ROUTINE_FLAGS, REG_SZ, REG_VALUE_TYPE, RRF_NOEXPAND,
        RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ, RegGetValueW,
    };

    const KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

    /// Runs the system's reg.exe with `args` as separate arguments, without a console window.
    fn reg(args: &[&str]) -> Result<Output> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // The full path: a bare name is looked up next to Muro's own executable first.
        let windows = std::env::var_os("SystemRoot").context("SystemRoot is not set")?;
        Command::new(Path::new(&windows).join("System32").join("reg.exe"))
            .args(args)
            .stdin(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .context("Cannot run reg.exe")
    }

    fn failure(output: &Output, what: &str) -> anyhow::Error {
        anyhow!(
            "reg.exe could not {what} (exit {:?}): {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        )
    }

    /// For a query: exit code 0 is a match; 1 is a missing value or no match, which reg.exe
    /// does not tell apart from its other failures.
    fn found(output: &Output, what: &str) -> Result<bool> {
        match output.status.code() {
            Some(0) => Ok(true),
            Some(1) => Ok(false),
            _ => Err(failure(output, what)),
        }
    }

    fn done(output: &Output, what: &str) -> Result<()> {
        if output.status.success() {
            Ok(())
        } else {
            Err(failure(output, what))
        }
    }

    pub fn exists(name: &str) -> Result<bool> {
        found(&reg(&["query", KEY, "/v", name])?, "read the Run key")
    }

    /// Whether the value `name` is a REG_SZ that is exactly `data` (case-sensitive). Read by its
    /// name, like `read`: a search through the whole key (`reg query /f`) passes over a value that
    /// is there while another program adds or deletes a value of the key, and reg.exe prints data
    /// in the console code page, where a path outside it reads as another path.
    pub fn holds(name: &str, data: &str) -> Result<bool> {
        // Both string types, not expanded, so that the type read is the one stored.
        let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND;
        Ok(matches!(get(name, flags)?, Some((REG_SZ, text)) if text == data))
    }

    /// The string value `name` exactly as stored (REG_EXPAND_SZ with its variables expanded, as
    /// Windows starts it), or `None` when there is no such value or it is not a string. Read
    /// through the registry API, which gives UTF-16: the output of reg.exe is in the console
    /// code page, and a path outside it would read as another path.
    pub fn read(name: &str) -> Result<Option<String>> {
        Ok(get(name, RRF_RT_REG_SZ)?.map(|(_, text)| text))
    }

    /// The value `name` read by its name with `flags`, and the type it was read as, or `None`
    /// when there is no such value or it is of a type `flags` does not take.
    fn get(name: &str, flags: REG_ROUTINE_FLAGS) -> Result<Option<(REG_VALUE_TYPE, String)>> {
        let wide = |text: &str| text.encode_utf16().chain([0]).collect::<Vec<u16>>();
        let subkey = wide(KEY.trim_start_matches(r"HKCU\"));
        let value = wide(name);
        // Room for a usual path; when it is not enough the call says how much it needs.
        let mut buffer = vec![0u16; 512];
        loop {
            let mut kind: REG_VALUE_TYPE = 0;
            let mut bytes = u32::try_from(buffer.len() * 2)?;
            let status = unsafe {
                RegGetValueW(
                    HKEY_CURRENT_USER,
                    subkey.as_ptr(),
                    value.as_ptr(),
                    flags,
                    &mut kind,
                    buffer.as_mut_ptr().cast(),
                    &mut bytes,
                )
            };
            match status {
                ERROR_SUCCESS => {
                    // The size counts the terminator that the call writes.
                    let text = &buffer[..(bytes as usize / 2).min(buffer.len())];
                    let end = text
                        .iter()
                        .position(|&unit| unit == 0)
                        .unwrap_or(text.len());
                    return String::from_utf16(&text[..end])
                        .map(|text| Some((kind, text)))
                        .context("The Run value is not valid Unicode");
                }
                ERROR_MORE_DATA => buffer.resize((bytes as usize).div_ceil(2) + 1, 0),
                ERROR_FILE_NOT_FOUND | ERROR_UNSUPPORTED_TYPE => return Ok(None),
                error => bail!("Cannot read the Run value (error {error})"),
            }
        }
    }

    pub fn write(name: &str, exe: &Path) -> Result<()> {
        let path = exe
            .to_str()
            .context("The executable path is not valid Unicode")?;
        ensure!(
            exe.is_absolute() && !path.contains('"'),
            "Start with Windows needs an absolute executable path without quotes: {path}"
        );
        let data = super::command(exe);
        let output = reg(&["add", KEY, "/v", name, "/t", "REG_SZ", "/d", &data, "/f"])?;
        done(&output, "write the Run key")
    }

    pub fn delete(name: &str) -> Result<()> {
        done(
            &reg(&["delete", KEY, "/v", name, "/f"])?,
            "delete the Run value",
        )
    }
}
