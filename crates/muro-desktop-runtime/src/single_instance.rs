//! One running Muro for each data directory. The first Muro to start creates a named signal and
//! waits on it; a Muro started later finds the signal, raises it and ends, so a second launch
//! shows the window of the one that runs instead of starting a second backend.
//!
//! The name comes from the data directory, so a portable copy and a development build, which
//! use other directories, stay independent. The signal is an event of the user's own session:
//! it goes with the last process that holds it, so a crashed Muro leaves nothing behind.

use std::path::Path;

/// The name of the signal of `data`: the namespace of the user's session and a hash of the
/// directory. The path is hashed, never written into the name, so no path can bring a character
/// Windows refuses (a backslash would name another namespace). The hash is FNV-1a over a
/// normalized spelling of the path, written out here because a running Muro and the one that
/// asks it to show its window may be different builds: `std`'s hashers promise nothing across
/// releases.
pub fn name(data: &Path) -> String {
    // Without touching the disk: the directory may not exist yet. `absolute` settles `/`, `..`
    // and a relative path; Windows paths do not tell capitals apart, and `\\?\` is the same
    // path spelled for long names.
    let absolute = std::path::absolute(data).unwrap_or_else(|_| data.to_path_buf());
    let spelled = absolute.to_string_lossy().to_lowercase();
    let spelled = spelled.strip_prefix(r"\\?\").unwrap_or(&spelled);
    let spelled = spelled.trim_end_matches(['\\', '/']);
    let hash = spelled
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
        });
    format!(r"Local\MuroShow-{hash:016x}")
}

#[cfg(windows)]
pub use windows::Signal;

#[cfg(windows)]
mod windows {
    use anyhow::{Result, bail, ensure};
    use std::{path::Path, time::Duration};
    use windows_sys::Win32::Foundation::{
        CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::System::Threading::{
        CreateEventW, INFINITE, SetEvent, WaitForSingleObject,
    };

    /// A handle to the signal of one data directory. Raising it and waiting on it work from any
    /// thread; the signal closes with the last handle to it.
    pub struct Signal {
        /// The event's handle, kept as an integer: it is only ever passed back to Windows.
        handle: usize,
    }

    impl Signal {
        /// Opens the signal of `data`, creating it when no Muro of that directory runs. The
        /// flag tells which: `true` when this process created it, so it is the first Muro.
        pub fn open(data: &Path) -> Result<(Self, bool)> {
            let name: Vec<u16> = super::name(data).encode_utf16().chain([0]).collect();
            // Auto-reset: one raise shows the window once and is kept until somebody waits, so
            // a raise that comes while the first Muro is still starting is not lost.
            let handle = unsafe { CreateEventW(std::ptr::null(), 0, 0, name.as_ptr()) };
            // Read at once: the next call may change it.
            let error = unsafe { GetLastError() };
            ensure!(
                !handle.is_null(),
                "Cannot create the Muro signal (error {error})"
            );
            Ok((
                Self {
                    handle: handle as usize,
                },
                error != ERROR_ALREADY_EXISTS,
            ))
        }

        /// Asks the Muro that waits on this signal to show its window.
        pub fn raise(&self) -> Result<()> {
            ensure!(
                unsafe { SetEvent(self.handle as _) } != 0,
                "Cannot raise the Muro signal (error {})",
                unsafe { GetLastError() }
            );
            Ok(())
        }

        /// Blocks until the signal is raised, or for `limit` when there is one: `true` when it
        /// was raised, `false` when the time ran out.
        pub fn wait(&self, limit: Option<Duration>) -> Result<bool> {
            let milliseconds = limit.map_or(INFINITE, |limit| {
                // INFINITE is the largest value; a limit is always below it.
                u32::try_from(limit.as_millis()).map_or(INFINITE - 1, |ms| ms.min(INFINITE - 1))
            });
            match unsafe { WaitForSingleObject(self.handle as _, milliseconds) } {
                WAIT_OBJECT_0 => Ok(true),
                WAIT_TIMEOUT => Ok(false),
                other => bail!(
                    "Cannot wait for the Muro signal (result {other}, error {})",
                    unsafe { GetLastError() }
                ),
            }
        }
    }

    impl Drop for Signal {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.handle as _) };
        }
    }
}
