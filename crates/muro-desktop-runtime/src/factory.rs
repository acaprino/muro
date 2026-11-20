//! The bundled factory, run for projects. Python and the factory folder are found the way AI
//! adaptation finds them (`jobs::factory_tools`: the registry's settings), and every command runs
//! through `exec` (process tree, cancellation, time limit). The factory prints JSON on stdout and, when
//! it could not do what it was asked, a reason on stderr with exit code 1 (docs/cli.md).
use crate::exec::{self, Captured};
use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

/// What a factory command that only reads a file may take.
pub const READ_LIMIT: Duration = Duration::from_secs(120);

pub struct Factory {
    python: String,
    root: PathBuf,
}

impl Factory {
    pub fn from_settings(settings: &Value) -> Result<Self> {
        let (python, root) = crate::jobs::factory_tools(settings)?;
        ensure!(
            !mukade::exe::is_batch(&python),
            "Choose an executable, not a batch launcher"
        );
        Ok(Self { python, root })
    }

    /// The Python executable and the arguments that start `muro_build.py` with `args`: the factory's
    /// launcher, which also answers the subcommands (`project ...`, `mcp`). Python runs in UTF-8
    /// mode, whatever the machine's locale: the factory prints JSON with its own characters.
    pub fn invocation(&self, args: &[String]) -> (String, Vec<String>) {
        let mut all = vec![
            "-X".to_owned(),
            "utf8".to_owned(),
            self.root.join("muro_build.py").to_string_lossy().into_owned(),
        ];
        all.extend(args.iter().cloned());
        (self.python.clone(), all)
    }

    pub fn command(&self, args: &[String]) -> Command {
        let (python, all) = self.invocation(args);
        let mut command = Command::new(python);
        command.args(all).current_dir(&self.root);
        command
    }

    /// Runs `args` to its end and returns what it printed.
    pub fn run(&self, args: &[String], what: &str, cancelled: &dyn Fn() -> bool, limit: Duration) -> Result<Captured> {
        exec::capture(self.command(args), what, cancelled, limit)
    }

    /// Runs `args`, which must print one JSON document and exit 0; exit 1 is the factory saying why it
    /// could not, and that reason is the error.
    pub fn json(&self, args: &[String], what: &str, cancelled: &dyn Fn() -> bool, limit: Duration) -> Result<Value> {
        let done = self.run(args, what, cancelled, limit)?;
        if !done.status.success() {
            let reason = done.stderr.trim();
            bail!("{}", if reason.is_empty() { format!("{what} failed ({})", done.status) } else { reason.to_owned() });
        }
        serde_json::from_str(done.stdout.trim()).with_context(|| format!("{what} did not print JSON"))
    }

    /// `muro project verify FILE`: the plugin the file carries was built from the package it carries.
    /// The factory's reason is the error, without the command's own prefix.
    pub fn project_verify(&self, file: &Path, cache: &Path) -> Result<()> {
        let args = vec!["project".to_owned(), "verify".into(), file.to_string_lossy().into_owned(), "--cache".into(), cache.to_string_lossy().into_owned()];
        match self.json(&args, "Checking the project's plugin", &|| false, READ_LIMIT) {
            Ok(_) => Ok(()),
            Err(error) => {
                let reason = format!("{error:#}");
                bail!("{}", reason.strip_prefix("Project verify failed: ").unwrap_or(&reason))
            }
        }
    }

    /// `muro project info FILE --summary` (or the full info) through the cache folder.
    pub fn project_info(&self, file: &Path, cache: &Path, summary: bool) -> Result<Value> {
        let mut args = vec!["project".to_owned(), "info".to_owned(), file.to_string_lossy().into_owned()];
        if summary {
            args.push("--summary".into());
        }
        args.extend(["--cache".into(), cache.to_string_lossy().into_owned()]);
        self.json(&args, "Reading the project", &|| false, READ_LIMIT)
    }
}
