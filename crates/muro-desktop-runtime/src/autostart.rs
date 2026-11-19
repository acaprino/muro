//! Start with Windows: a value of the per-user Run key that starts Muro in the background at
//! sign-in. The key is read and written with `reg.exe`, never through a shell.

use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::path::Path;

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

/// Points an enabled Run value that names another executable at `exe`; a disabled one stays
/// disabled.
pub fn repair(name: &str, exe: &Path) -> Result<()> {
    let state = state(name, exe)?;
    if state["enabled"] == true && state["current"] == false {
        set(name, exe, true)?;
    }
    Ok(())
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
    use anyhow::{Context, Result, anyhow, ensure};
    use std::path::Path;
    use std::process::{Command, Output, Stdio};

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

    /// Whether the string value `name` is exactly `data`. reg.exe prints data in the console
    /// code page, so a path outside ASCII never reads back as written: reg.exe compares it
    /// itself (exact, case-sensitive, data only), and only the ASCII value name and type of
    /// each match are read from its output.
    pub fn holds(name: &str, data: &str) -> Result<bool> {
        let output = reg(&["query", KEY, "/f", data, "/d", "/c", "/e"])?;
        if !found(&output, "search the Run key")? {
            return Ok(false);
        }
        Ok(String::from_utf8_lossy(&output.stdout).lines().any(|line| {
            let mut fields = line.trim_start().splitn(3, "    ");
            fields.next().is_some_and(|n| n.eq_ignore_ascii_case(name))
                && fields.next() == Some("REG_SZ")
        }))
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
