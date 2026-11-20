//! NDJSON process boundary used by the native desktop and command-line clients.
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

pub fn executable_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    }
}
pub fn bundled_tool(name: &str) -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().context("Executable directory")?;
    for candidate in [
        dir.join("tools").join(executable_name(name)),
        dir.join(executable_name(name)),
    ] {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    bail!(
        "Bundled CLI is missing: {} (beside {} or under tools)",
        executable_name(name),
        exe.display()
    )
}
pub fn default_data_dir(executable: &Path) -> Result<PathBuf> {
    if let Some(value) = std::env::var_os("MURO_DATA_DIR").filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(value));
    }
    let parent = executable.parent().context("Executable directory")?;
    let base = if parent.file_name().is_some_and(|n| n == "tools") {
        parent.parent().context("Portable root")?
    } else {
        parent
    };
    if base.join("portable.marker").is_file() {
        return Ok(base.join("data"));
    }
    #[cfg(windows)]
    {
        return Ok(PathBuf::from(
            std::env::var_os("APPDATA").context("APPDATA is unset; pass --data")?,
        )
        .join("dev.muro.registry"));
    }
    #[cfg(not(windows))]
    {
        Ok(std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
            })
            .join("muro"))
    }
}
pub fn prepare_environment() -> Result<()> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().context("Executable directory")?;
    let tools = if dir.file_name().is_some_and(|n| n == "tools") {
        dir.to_owned()
    } else {
        dir.join("tools")
    };
    let mut paths = vec![
        tools.clone(),
        tools.join("git/cmd"),
        tools.join("git/usr/bin"),
        tools.join("git/ucrt64/bin"),
        tools.join("git/bin"),
        tools.join("git/mingw64/bin"),
        tools.join("curl/bin"),
    ];
    paths.extend(std::env::split_paths(
        &std::env::var_os("PATH").unwrap_or_default(),
    ));
    // CLI startup, before any request worker or host probe thread exists.
    unsafe {
        std::env::set_var("PATH", std::env::join_paths(paths)?);
    }
    Ok(())
}
fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
}
pub fn discover_via_cli(cache: &Path) -> Result<Value> {
    let mut cmd = Command::new(bundled_tool("mukade")?);
    cmd.args(["muro-discover", "--cache"]).arg(cache);
    hidden(&mut cmd);
    let output = cmd.output().context("Cannot invoke bundled Mukade")?;
    ensure!(
        output.status.success(),
        "Mukade discovery failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: Value =
        serde_json::from_slice(&output.stdout).context("Mukade returned invalid JSON")?;
    ensure!(result.is_array(), "Mukade discovery must return an array");
    Ok(result)
}
pub fn resolve_executable(harness: &str) -> Result<String> {
    let mut cmd = Command::new(bundled_tool("mukade")?);
    cmd.args(["muro-resolve", harness]);
    hidden(&mut cmd);
    let output = cmd.output()?;
    ensure!(
        output.status.success(),
        "Mukade resolve failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let v: Value = serde_json::from_slice(&output.stdout)?;
    Ok(v["executable"]
        .as_str()
        .context("Mukade omitted executable")?
        .into())
}

/// Whether the registry refused a request because another writer held it. It refuses before it
/// does anything, so the same request can be sent again.
pub fn is_busy(error: &anyhow::Error) -> bool {
    format!("{error:#}").contains(muro_registry::service::BUSY)
}
/// Runs `attempt` again, every `step`, while it fails because the registry is busy, for `limit`
/// at most; then the error is returned as it is. Any other result is returned at once.
pub fn retry_while_busy<T>(
    limit: Duration,
    step: Duration,
    mut attempt: impl FnMut() -> Result<T>,
) -> Result<T> {
    let end = Instant::now() + limit;
    loop {
        match attempt() {
            Err(error) if is_busy(&error) && Instant::now() < end => thread::sleep(step),
            result => return result,
        }
    }
}

type Reply = std::result::Result<Value, String>;
#[cfg(windows)]
struct ChildJob(isize);
#[cfg(windows)]
impl ChildJob {
    fn attach(child: &Child) -> Result<Self> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            ensure!(!handle.is_null(), "Cannot create CLI process job");
            let guard = Self(handle as isize);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            ensure!(
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const _,
                    std::mem::size_of_val(&info) as u32
                ) != 0,
                "Cannot configure CLI process job"
            );
            ensure!(
                AssignProcessToJobObject(handle, child.as_raw_handle()) != 0,
                "Cannot attach CLI process job"
            );
            Ok(guard)
        }
    }
}
#[cfg(windows)]
impl Drop for ChildJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}
struct Inner {
    input: Mutex<ChildStdin>,
    child: Mutex<Child>,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>,
    sequence: AtomicU64,
    #[cfg(windows)]
    _job: ChildJob,
}
impl Drop for Inner {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
#[derive(Clone)]
pub struct Client(Arc<Inner>);
impl Client {
    pub fn spawn(executable: &Path, data: &Path) -> Result<Self> {
        let mut command = Command::new(executable);
        command
            .arg("--data")
            .arg(data)
            .arg("serve")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        hidden(&mut command);
        let mut child = command
            .spawn()
            .with_context(|| format!("Cannot launch {}", executable.display()))?;
        #[cfg(windows)]
        let job = match ChildJob::attach(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        let input = child.stdin.take().context("CLI stdin")?;
        let output = child.stdout.take().context("CLI stdout")?;
        let pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let replies = pending.clone();
        thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                let Ok(value) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(id) = value["id"].as_u64() {
                    if let Some(sender) = replies.lock().unwrap().remove(&id) {
                        let result = if value["ok"] == true {
                            Ok(value["result"].clone())
                        } else {
                            Err(value["error"]
                                .as_str()
                                .unwrap_or("CLI request failed")
                                .into())
                        };
                        let _ = sender.send(result);
                    }
                }
            }
            for (_, sender) in replies.lock().unwrap().drain() {
                let _ = sender.send(Err("Muro CLI stopped; restart the app to reconnect".into()));
            }
        });
        Ok(Self(Arc::new(Inner {
            input: Mutex::new(input),
            child: Mutex::new(child),
            pending,
            sequence: AtomicU64::new(1),
            #[cfg(windows)]
            _job: job,
        })))
    }
    pub fn request(&self, action: &str, payload: Value) -> Result<Value> {
        let id = self.0.sequence.fetch_add(1, Ordering::Relaxed);
        let (send, receive) = mpsc::channel();
        self.0.pending.lock().unwrap().insert(id, send);
        let result = (|| -> Result<()> {
            let mut input = self.0.input.lock().unwrap();
            serde_json::to_writer(
                &mut *input,
                &json!({"id":id,"action":action,"payload":payload}),
            )?;
            input.write_all(b"\n")?;
            input.flush()?;
            Ok(())
        })();
        if let Err(error) = result {
            self.0.pending.lock().unwrap().remove(&id);
            return Err(error);
        }
        match receive.recv_timeout(std::time::Duration::from_secs(600)) {
            Ok(result) => result.map_err(anyhow::Error::msg),
            Err(error) => {
                self.0.pending.lock().unwrap().remove(&id);
                bail!(
                    "CLI response unavailable ({error}); inspect activity before retrying because the operation may still be running"
                )
            }
        }
    }
}

pub fn serve(data: &Path) -> Result<()> {
    use fs2::FileExt;
    std::fs::create_dir_all(data)?;
    let lease = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(data.join("cli-server.lock"))?;
    lease
        .try_lock_exclusive()
        .context("A Muro CLI server already owns this data directory")?;
    initialize(data)?;
    // The project cache and the simulations' folders are tidied once, when the server starts: what no project
    // and no installed build needs, and what a process that ended in the middle left behind.
    crate::projects::sweep(data);
    crate::jobs::recover(data)?;
    let stdout = Arc::new(Mutex::new(std::io::stdout()));
    let mut workers = vec![];
    for line in std::io::stdin().lock().lines() {
        let line = line?;
        let output = stdout.clone();
        let data = data.to_owned();
        workers.push(thread::spawn(move || {
            let input: Result<Value> = serde_json::from_str(&line).map_err(Into::into);
            let id = input
                .as_ref()
                .ok()
                .map(|v| v["id"].clone())
                .unwrap_or(Value::Null);
            let response =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<Value> {
                    let input = input?;
                    ensure!(input["id"].is_u64(), "id must be an unsigned integer");
                    let action = input["action"].as_str().context("Missing action")?;
                    crate::request(
                        &data,
                        action,
                        input.get("payload").cloned().unwrap_or(json!({})),
                    )
                }))
                .unwrap_or_else(|_| {
                    Err(anyhow::anyhow!(
                        "CLI worker panicked; inspect registry integrity"
                    ))
                });
            let value = match response {
                Ok(value) => json!({"id":id,"ok":true,"result":value}),
                Err(error) => json!({"id":id,"ok":false,"error":format!("{error:#}")}),
            };
            let mut out = output.lock().unwrap();
            let _ = serde_json::to_writer(&mut *out, &value);
            let _ = out.write_all(b"\n");
            let _ = out.flush();
        }));
        workers.retain(|worker| !worker.is_finished());
    }
    for worker in workers {
        let _ = worker.join();
    }
    Ok(())
}

pub fn once(data: &Path, action: &str, payload: Value) -> Result<Value> {
    initialize(data)?;
    let result = crate::request(data, action, payload)?;
    if action != "adapt" {
        return Ok(result);
    }
    let id = result["id"].as_str().context("Adaptation omitted job ID")?;
    loop {
        let jobs = crate::jobs::list(data)?;
        if let Some(job) = jobs.iter().find(|j| j["id"] == id) {
            if job["status"] != "running" {
                return Ok(job.clone());
            }
        }
        thread::sleep(std::time::Duration::from_millis(250));
    }
}
fn initialize(data: &Path) -> Result<()> {
    relocate_owned_paths(data)?;
    let exe = std::env::current_exe()?;
    let dir = exe.parent().context("Executable directory")?;
    let base = if dir.file_name().is_some_and(|n| n == "tools") {
        dir.parent().context("Portable root")?
    } else {
        dir
    };
    let resource = base.join("resources");
    let factory = resource.join("factory");
    let python = resource.join("python").join(executable_name("python"));
    if factory.join("muro_build.py").is_file()
        && python.is_file()
        && (base.join("portable.marker").is_file() || !data.join("registry.json").exists())
    {
        let registry = crate::request(data, "registry", json!({}))?;
        let mut settings = registry["settings"].clone();
        if settings["python"] != json!(python) || settings["factory_path"] != json!(factory) {
            settings["python"] = json!(python);
            settings["factory_path"] = json!(factory);
            crate::request(
                data,
                "settings",
                json!({"revision":registry["revision"],"settings":settings}),
            )?;
        }
    }
    // The project Muro ships is put in the person's list once. A failure here is no reason to keep
    // Muro from starting: it is reported, and the next start tries again.
    if let Err(error) = crate::projects::install_default(data, &resource) {
        eprintln!("Default project: {error:#}");
    }
    Ok(())
}
fn atomic_json(path: &Path, value: &Value) -> Result<()> {
    use std::io::Write;
    let mut file = tempfile::NamedTempFile::new_in(path.parent().context("Parent directory")?)?;
    file.write_all(&serde_json::to_vec_pretty(value)?)?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|e| e.error)?;
    Ok(())
}
fn read_json(path: &Path) -> Result<Value> {
    Ok(serde_json::from_slice(&std::fs::read(path)?)?)
}
fn relocate_owned_paths(data: &Path) -> Result<()> {
    use fs2::FileExt;
    std::fs::create_dir_all(data)?;
    let current = data.canonicalize()?;
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(data.join("writer.lock"))?;
    lock.try_lock_exclusive()
        .context("Registry is busy during portable relocation")?;
    let location = data.join("data-location.json");
    if location.exists() {
        let previous = read_json(&location)?;
        let old = PathBuf::from(
            previous["path"]
                .as_str()
                .context("Invalid previous data location")?,
        );
        if old != current {
            let registry_file = data.join("registry.json");
            if registry_file.exists() {
                let mut registry = read_json(&registry_file)?;
                let before = (registry["plugins"].clone(), registry["projects"].clone());
                // A project file kept in the data directory (the one Muro ships) moves with it.
                if let Some(projects) = registry["projects"].as_array_mut() {
                    for project in projects {
                        rebase(&mut project["path"], &old, &current);
                    }
                }
                if let Some(plugins) = registry["plugins"].as_array_mut() {
                    for plugin in plugins {
                        for key in ["source", "resolved_source"] {
                            rebase(&mut plugin[key], &old, &current);
                        }
                        if let Some(path) = plugin.get_mut("custom_instructions_dir") {
                            rebase(path, &old, &current);
                        }
                        if let Some(distributions) = plugin["distributions"].as_array_mut() {
                            for d in distributions {
                                rebase(&mut d["path"], &old, &current);
                            }
                        }
                    }
                }
                if (registry["plugins"].clone(), registry["projects"].clone()) != before {
                    registry["revision"] =
                        json!(registry["revision"].as_u64().context("Registry revision")? + 1);
                    atomic_json(&registry_file, &registry)?;
                }
            }
            let receipts_file = data.join("receipts.json");
            if receipts_file.exists() {
                let mut receipts = read_json(&receipts_file)?;
                for receipt in receipts
                    .as_object_mut()
                    .context("Invalid receipts")?
                    .values_mut()
                {
                    rebase(&mut receipt["path"], &old, &current);
                }
                atomic_json(&receipts_file, &receipts)?;
            }
            // Target roots and native IDs name actual installations on this machine and remain intact.
            // A new plan replaces their old artifact pointers after relocation.
            let inventory = data.join("inventory.json");
            if inventory.is_file() {
                std::fs::remove_file(inventory)?;
            }
            let plans = data.join("plans");
            if plans.is_dir() {
                for file in std::fs::read_dir(&plans)? {
                    let file = file?;
                    if file.file_type()?.is_file()
                        && file.path().extension().is_some_and(|e| e == "json")
                    {
                        std::fs::remove_file(file.path())?;
                    }
                }
            }
        }
    }
    atomic_json(&location, &json!({"path":current}))
}
fn rebase(value: &mut Value, old: &Path, current: &Path) {
    if let Some(raw) = value.as_str() {
        let raw = ordinary_windows_path(Path::new(raw));
        let old = ordinary_windows_path(old);
        let current = ordinary_windows_path(current);
        if let Ok(relative) = raw.strip_prefix(&old) {
            if relative
                .components()
                .all(|part| part != std::path::Component::ParentDir)
            {
                *value = json!(current.join(relative));
            }
        }
    }
}
fn ordinary_windows_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let raw = path.to_string_lossy();
        if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = raw.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path.to_owned()
}

pub fn main_args(args: Vec<String>) -> Result<()> {
    prepare_environment()?;
    if args.is_empty() || args.iter().any(|a| a == "--help" || a == "-h") {
        println!(
            "muroctl [--data DIRECTORY] serve\nmuroctl [--data DIRECTORY] request ACTION [--input PAYLOAD.json]\nserve uses correlated NDJSON requests. One-shot adapt waits for completion.\nActions and payloads: docs/desktop-cli.md, section \"Request actions\"."
        );
        return Ok(());
    }
    let mut args = args.into_iter();
    let first = args.next().context("Missing command")?;
    let (data, command) = if first == "--data" {
        (
            PathBuf::from(args.next().context("Missing data directory")?),
            args.next().context("Missing command")?,
        )
    } else {
        (default_data_dir(&std::env::current_exe()?)?, first)
    };
    match command.as_str() {
        "serve" => {
            ensure!(args.next().is_none(), "Unexpected serve arguments");
            serve(&data)
        }
        "request" => {
            let action = args.next().context("Missing action")?;
            let payload = match args.next() {
                None => json!({}),
                Some(flag) if flag == "--input" => {
                    let path = args.next().context("Missing input JSON file")?;
                    serde_json::from_slice(&std::fs::read(path)?)?
                }
                _ => bail!("Expected --input PAYLOAD.json"),
            };
            ensure!(args.next().is_none(), "Unexpected arguments");
            println!("{}", once(&data, &action, payload)?);
            Ok(())
        }
        _ => bail!("Unknown command {command}; use --help"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_names() {
        assert!(executable_name("muroctl").starts_with("muroctl"));
    }
    #[test]
    fn default_directory_respects_override() {
        if let Some(value) = std::env::var_os("MURO_DATA_DIR").filter(|v| !v.is_empty()) {
            assert_eq!(
                default_data_dir(Path::new("C:/Muro/Muro.exe")).unwrap(),
                PathBuf::from(value)
            );
        }
    }
    #[test]
    fn relocation_only_changes_owned_plugin_paths() {
        let t = tempfile::tempdir().unwrap();
        let old = t.path().join("old");
        let new = t.path().join("new");
        std::fs::create_dir_all(&new).unwrap();
        let outside = t.path().join("external");
        atomic_json(&new.join("data-location.json"), &json!({"path":old})).unwrap();
        atomic_json(&new.join("registry.json"),&json!({"revision":2,"plugins":[{"source":"https://example.com/repo","resolved_source":old.join("sources/source"),"custom_instructions_dir":old.join("custom-instructions/example"),"distributions":[{"path":old.join("artifacts/x")}]}],"targets":[{"root":outside}]})).unwrap();
        atomic_json(
            &new.join("receipts.json"),
            &json!({"entry":{"path":old.join("artifacts/x"),"native_id":"old-native-id"}}),
        )
        .unwrap();
        relocate_owned_paths(&new).unwrap();
        let reg = read_json(&new.join("registry.json")).unwrap();
        assert_eq!(reg["revision"], 3);
        assert_eq!(reg["targets"][0]["root"], json!(outside));
        assert_eq!(
            Path::new(reg["plugins"][0]["distributions"][0]["path"].as_str().unwrap()),
            ordinary_windows_path(&new.canonicalize().unwrap()).join("artifacts").join("x")
        );
        assert_eq!(Path::new(reg["plugins"][0]["custom_instructions_dir"].as_str().unwrap()),
                   ordinary_windows_path(&new.canonicalize().unwrap()).join("custom-instructions/example"));
        assert_eq!(
            read_json(&new.join("receipts.json")).unwrap()["entry"]["native_id"],
            "old-native-id"
        );
        relocate_owned_paths(&new).unwrap();
        assert_eq!(
            read_json(&new.join("registry.json")).unwrap()["revision"],
            3
        );
    }
    #[test]
    fn relocation_moves_the_project_files_kept_in_the_data_directory_and_no_other() {
        let t = tempfile::tempdir().unwrap();
        let (old, new) = (t.path().join("old"), t.path().join("new"));
        std::fs::create_dir_all(&new).unwrap();
        let elsewhere = t.path().join("documents").join("mine.mp");
        atomic_json(&new.join("data-location.json"), &json!({"path":old})).unwrap();
        atomic_json(
            &new.join("registry.json"),
            &json!({"revision":5,"plugins":[],"targets":[],"projects":[
                {"id":"marionette","path":old.join("projects").join("marionette.mp")},
                {"id":"mine","path":elsewhere}]}),
        )
        .unwrap();
        relocate_owned_paths(&new).unwrap();
        let reg = read_json(&new.join("registry.json")).unwrap();
        assert_eq!(reg["revision"], 6);
        assert_eq!(
            Path::new(reg["projects"][0]["path"].as_str().unwrap()),
            ordinary_windows_path(&new.canonicalize().unwrap()).join("projects").join("marionette.mp")
        );
        assert_eq!(reg["projects"][1]["path"], json!(elsewhere), "a file the person keeps elsewhere stays");
        relocate_owned_paths(&new).unwrap();
        assert_eq!(read_json(&new.join("registry.json")).unwrap()["revision"], 6, "a second pass changes nothing");
    }
    #[cfg(windows)]
    #[test]
    fn relocation_matches_regular_artifact_paths_with_verbatim_location() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old");
        let new = temp.path().join("new");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        let location = old.canonicalize().unwrap();
        let ordinary = ordinary_windows_path(&location);
        let artifact = ordinary.join("artifacts/demo");
        atomic_json(&new.join("data-location.json"), &json!({"path":location})).unwrap();
        atomic_json(
            &new.join("registry.json"),
            &json!({"revision":1,"plugins":[{"distributions":[{"path":artifact}]}],"targets":[]}),
        )
        .unwrap();
        relocate_owned_paths(&new).unwrap();
        let registry = read_json(&new.join("registry.json")).unwrap();
        assert_eq!(
            registry["plugins"][0]["distributions"][0]["path"],
            json!(ordinary_windows_path(&new.canonicalize().unwrap()).join("artifacts/demo"))
        );
    }
}
