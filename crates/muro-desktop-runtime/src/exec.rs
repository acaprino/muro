//! The one way the runtime runs a long child process: no console window, no input, its whole process
//! tree ended when it is cancelled, runs out of time or the runtime ends (Windows job object), and
//! its output left to the caller's files so a chatty process can never block on a full pipe.
//! AI adaptation (`jobs`), the factory commands (`factory`) and the simulator (`simulate`) all run
//! through `supervise`; none keeps a loop of its own.
use anyhow::{Context, Result, bail};
use std::{
    io::{Read, Seek, SeekFrom},
    process::{Command, ExitStatus, Stdio},
    time::{Duration, Instant},
};

/// Why a process was ended by the supervisor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stop {
    Cancelled,
    TimedOut,
}

/// How a supervised process ended.
pub enum Ended {
    /// It exited by itself, successfully or not.
    Finished(ExitStatus),
    /// It was killed, with the processes it started.
    Stopped(Stop),
}

/// How often a running process is looked at.
const POLL: Duration = Duration::from_millis(200);

/// Starts `command` (input closed, no window; its output is whatever the caller set) and waits for it
/// for `limit` at most, looking at `cancelled` while it runs. A process that is cancelled or out of
/// time is killed with the processes it started.
pub fn supervise(mut command: Command, cancelled: &dyn Fn() -> bool, limit: Duration) -> Result<Ended> {
    command.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let program = command.get_program().to_string_lossy().into_owned();
    let mut child = command
        .spawn()
        .with_context(|| format!("Cannot start {program}"))?;
    #[cfg(windows)]
    let _process_tree = match crate::process_tree::ProcessTree::attach(&child) {
        Ok(tree) => tree,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(Ended::Finished(status));
        }
        let stop = if cancelled() {
            Some(Stop::Cancelled)
        } else if start.elapsed() > limit {
            Some(Stop::TimedOut)
        } else {
            None
        };
        if let Some(stop) = stop {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(Ended::Stopped(stop));
        }
        std::thread::sleep(POLL);
    }
}

/// A process `capture` stopped at its limit. What it had done by then is not known: a caller whose process
/// changes something outside this computer says so (`out_of_time`).
#[derive(Debug)]
pub struct OutOfTime(String);

impl std::fmt::Display for OutOfTime {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for OutOfTime {}

/// Whether `error` is a process that ran out of time (`OutOfTime`), or was caused by one.
pub fn out_of_time(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| cause.is::<OutOfTime>())
}

/// What a process that ran to its end printed.
pub struct Captured {
    pub status: ExitStatus,
    pub stdout: String,
    pub stderr: String,
}

/// `supervise` with the output kept: each stream goes to an unnamed temporary file, read once the
/// process has ended. A process that was cancelled or ran out of time is an error naming `what`; the
/// second is an `OutOfTime`.
pub fn capture(mut command: Command, what: &str, cancelled: &dyn Fn() -> bool, limit: Duration) -> Result<Captured> {
    let out = tempfile::tempfile()?;
    let err = tempfile::tempfile()?;
    command
        .stdout(Stdio::from(out.try_clone()?))
        .stderr(Stdio::from(err.try_clone()?));
    let status = match supervise(command, cancelled, limit)? {
        Ended::Finished(status) => status,
        Ended::Stopped(Stop::Cancelled) => bail!("{what} was cancelled"),
        Ended::Stopped(Stop::TimedOut) => {
            return Err(OutOfTime(format!("{what} ran out of time ({} seconds)", limit.as_secs())).into());
        }
    };
    let read = |mut file: std::fs::File| -> Result<String> {
        let mut bytes = vec![];
        file.seek(SeekFrom::Start(0))?;
        file.read_to_end(&mut bytes)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    };
    Ok(Captured {
        status,
        stdout: read(out)?,
        stderr: read(err)?,
    })
}
