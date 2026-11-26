//! Projects in the desktop runtime (ADR-0028): the `.mp` files the registry lists, read through the
//! bundled factory (`muro project info`), opened from anywhere and put on the harnesses as a registry
//! plugin. The factory owns the format; the registry owns the list and the plugins; this module
//! connects them and decides nothing about what a project means.
use crate::factory::{Factory, READ_LIMIT};
use anyhow::{Context, Result, bail, ensure};
use muro_registry::projects::{self as list, same_file};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

/// The harness kinds the factory builds an adapter for.
pub const HARNESSES: [&str; 5] = ["claude-code", "codex", "opencode", "pi", "hermes"];

/// Where the factory unpacks each project file once, named by the file's digest. Inside the data
/// directory, so a portable Muro keeps it with its data.
pub fn cache_dir(data: &Path) -> PathBuf {
    data.join("project-cache")
}

fn registry(data: &Path) -> Result<Value> {
    muro_registry::service::request(data, "registry", json!({}))
}

fn missing(path: &str) -> String {
    format!("The project file is missing: {path}")
}

fn listed(registry: &Value) -> &[Value] {
    registry["projects"].as_array().map_or(&[], Vec::as_slice)
}

/// The file of a listed project, checked again as it enters the factory: a path the registry holds is
/// absolute, goes up no folder, ends in `.mp`; and the file is there.
pub fn listed_file(registry: &Value, id: &str) -> Result<PathBuf> {
    let project = listed(registry)
        .iter()
        .find(|project| project["id"] == id)
        .with_context(|| "That project is not in your list")?;
    let path = project["path"].as_str().context("A project needs a path")?;
    list::validate_path(path)?;
    ensure!(Path::new(path).is_file(), "{}", missing(path));
    Ok(PathBuf::from(path))
}

/// Reads the registry, lets `step` say what to save from it, saves that, and starts again from a fresh
/// read when another writer moved the revision in between (three times at most). `None` from `step`
/// is nothing to save. Returns the snapshot the save answered.
fn update(
    data: &Path,
    mut step: impl FnMut(&Value) -> Result<Option<(&'static str, Value)>>,
) -> Result<Option<Value>> {
    for attempt in 0..3 {
        let current = registry(data)?;
        let Some((action, mut payload)) = step(&current)? else {
            return Ok(None);
        };
        payload["revision"] = current["revision"].clone();
        match muro_registry::service::request(data, action, payload) {
            Err(error) if attempt < 2 && format!("{error:#}").contains("revision changed") => {}
            saved => return saved.map(Some),
        }
    }
    unreachable!("the last attempt returns")
}

/// A listed project that cannot be read, as the page shows it: its id and path, and the reason.
fn failed(id: &str, path: &str, error: &str) -> Value {
    json!({"id":id,"path":path,"error":error})
}

/// The summary of one listed file as the page shows it: its id and path, and what `info --summary` says,
/// or the reason it cannot be read. A file that is gone is not worth a factory run.
fn summary(factory: &Factory, data: &Path, id: &str, path: &str) -> Result<Value> {
    if !Path::new(path).is_file() {
        return Ok(failed(id, path, &missing(path)));
    }
    let read = factory.project_info(Path::new(path), &cache_dir(data), true)?;
    if let Some(error) = read["error"].as_str() {
        return Ok(failed(id, path, error));
    }
    let mut shown = read;
    shown["id"] = json!(id);
    shown["path"] = json!(path);
    Ok(shown)
}

/// `projects`: a summary for each listed project, in list order. One bad file is an `error` in its own
/// entry; a factory that cannot run at all is an error of the action.
pub fn projects(data: &Path) -> Result<Value> {
    let current = registry(data)?;
    let items = listed(&current);
    if items.is_empty() {
        return Ok(json!([]));
    }
    let factory = Factory::from_settings(&current["settings"])?;
    let mut shown = vec![];
    for item in items {
        let (id, path) = (item["id"].as_str().unwrap_or(""), item["path"].as_str().unwrap_or(""));
        // A file the factory cannot read at all (it crashed, it ran out of time) is that project's own
        // error: it must not hide the others from the list.
        shown.push(summary(&factory, data, id, path).unwrap_or_else(|error| failed(id, path, &format!("{error:#}"))));
    }
    Ok(json!(shown))
}

/// `project {id}`: the full `info` of a listed project, for its page. A file the factory refuses leaves
/// no unpack of it in the cache.
pub fn project(data: &Path, payload: &Value) -> Result<Value> {
    let id = payload["id"].as_str().unwrap_or("");
    let current = registry(data)?;
    let file = listed_file(&current, id)?;
    Factory::from_settings(&current["settings"])?.project_info(&file, &cache_dir(data), false).inspect_err(|_| {
        discard_unpack(data, &current, &file);
    })
}

/// The unpack of a file the factory refused is deleted: a hostile file is no reason for the cache to hold
/// what it unpacked. Kept when a plugin made from those very bytes is installed from it: that build is
/// what the harnesses were given, whatever the factory says of the file now.
fn discard_unpack(data: &Path, registry: &Value, file: &Path) {
    let Ok(digest) = list::file_digest(file) else { return };
    if distribution_digests(registry).contains(&digest) {
        return;
    }
    let _ = std::fs::remove_dir_all(cache_dir(data).join(digest));
}

/// `open_project {path}`: a project file from anywhere. The factory reads it first; a file that is not a
/// project is refused with its reason and listed nowhere. The project is listed under its plugin's slug,
/// where it is (it is not copied). Opened again, it is the same entry; another file with the same slug is
/// refused, since a plugin of that name is one project.
pub fn open(data: &Path, payload: &Value) -> Result<Value> {
    let path = payload["path"].as_str().context("Choose a project file")?;
    list::validate_path(path)?;
    ensure!(Path::new(path).is_file(), "{}", missing(path));
    let current = registry(data)?;
    let factory = Factory::from_settings(&current["settings"])?;
    let read = match factory.project_info(Path::new(path), &cache_dir(data), true) {
        Ok(read) => read,
        Err(error) => {
            discard_unpack(data, &current, Path::new(path));
            return Err(error);
        }
    };
    if let Some(error) = read["error"].as_str() {
        discard_unpack(data, &current, Path::new(path));
        bail!("{error}");
    }
    let slug = read["plugin"]["slug"].as_str().context("The project names no plugin")?.to_owned();
    let mut shown = read;
    update(data, |current| {
        let items = listed(current);
        if let Some(same) = items.iter().find(|p| p["path"].as_str().is_some_and(|p| same_file(p) == same_file(path))) {
            shown["id"] = same["id"].clone();
            shown["path"] = same["path"].clone();
            return Ok(None);
        }
        if let Some(taken) = items.iter().find(|p| p["id"] == slug.as_str()) {
            bail!(
                "A project for {slug} is already listed: remove it from the list first, or open that one ({})",
                taken["path"].as_str().unwrap_or("")
            );
        }
        shown["id"] = json!(slug);
        shown["path"] = json!(path);
        let mut next = items.to_vec();
        next.push(json!({"id":slug,"path":path}));
        Ok(Some(("save_projects", json!({"projects":next}))))
    })?;
    sweep_cache(data);
    Ok(shown)
}

/// The harness kinds a request names: a nonempty list of known kinds, each once.
/// The targets a request names, each a managed one (a target of the registry that is switched on), each
/// once and in the order named, with the harness kinds they are of, each once in the order they first
/// appear: the distributions to make, one for each kind.
fn named_targets(registry: &Value, payload: &Value) -> Result<(Vec<String>, Vec<String>)> {
    let named = payload["targets"].as_array().context("Name the targets to install on")?;
    let (mut ids, mut kinds): (Vec<String>, Vec<String>) = (vec![], vec![]);
    for item in named {
        let id = item.as_str().context("A target is its id")?;
        let target = registry["targets"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|target| target["id"] == id)
            .with_context(|| format!("No harness is managed under the id {id}"))?;
        let name = target["name"].as_str().unwrap_or(id);
        ensure!(target["enabled"] == true, "{name} is paused: switch it on in Sync first");
        let kind = target["harness"].as_str().unwrap_or("");
        ensure!(HARNESSES.contains(&kind), "No Muro adapter for the harness {kind}");
        if !ids.iter().any(|known| known == id) {
            ids.push(id.to_owned());
        }
        if !kinds.iter().any(|known| known == kind) {
            kinds.push(kind.to_owned());
        }
    }
    ensure!(!ids.is_empty(), "Name at least one target to install on");
    Ok((ids, kinds))
}

fn plugin_of<'a>(registry: &'a Value, id: &str) -> Option<&'a Value> {
    registry["plugins"].as_array()?.iter().find(|p| p["id"] == id)
}

/// `extract_project {id, harness, folder}`: the plugin the project's file carries for one harness, written by the
/// factory into `folder/<harness>/` (`muro project extract`, ADR-0035). The file is read and never written, and
/// nothing already in `folder` is overwritten. Answers what the command printed, `{harness, folders}`; what it
/// refused is its sentence, without the command's own prefix.
pub fn extract(data: &Path, payload: &Value) -> Result<Value> {
    let current = registry(data)?;
    let file = listed_file(&current, payload["id"].as_str().unwrap_or(""))?;
    let result = extract_file(data, &current["settings"], &file, payload, None);
    sweep_cache(data);
    result
}

/// Exports one of the archive variants shown in Sync, including for repositories pinned to a Git revision.
pub fn extract_plugin(data: &Path, payload: &Value) -> Result<Value> {
    muro_registry::service::with_registry(data, |current| {
        let id = payload["id"].as_str().context("Choose a plugin")?;
        let plugin = plugin_of(current, id).context("That plugin is no longer in your list")?;
        if let Some(reason) = plugin["project_source_error"].as_str() {
            bail!("Check the plugin source again before exporting. {reason}");
        }
        let archive = &plugin["resolved_project"];
        let path = archive["path"].as_str().context("Check for updates to find a Muro project file to export")?;
        let digest = archive["digest"].as_str().context("Check for updates to verify this project file")?;
        ensure!(payload.get("digest").is_none_or(|expected| expected == digest),
                "The checked plugin changed. Reopen Export to choose its current version.");
        ensure!(archive["harnesses"].as_array().is_some_and(|kinds| kinds.contains(&payload["harness"])),
                "This project file has no export for the selected harness");
        extract_file(data, &current["settings"], Path::new(path), payload, Some(digest))
    })
}

fn extract_file(data: &Path, settings: &Value, file: &Path, payload: &Value, digest: Option<&str>) -> Result<Value> {
    let harness = payload["harness"].as_str().unwrap_or("");
    ensure!(HARNESSES.contains(&harness), "No Muro adapter for the harness {harness}");
    let folder = payload["folder"].as_str().unwrap_or("").trim();
    ensure!(Path::new(folder).is_absolute(), "Name the folder to extract into by its full path");
    let mut args = vec!["project".to_owned(), "extract".into(), file.to_string_lossy().into_owned(), "--harness".into(), harness.to_owned(),
        "--out".into(), folder.to_owned(), "--cache".into(), cache_dir(data).to_string_lossy().into_owned()];
    if let Some(digest) = digest {
        args.extend(["--expect-digest".into(), digest.to_owned()]);
    }
    let done = Factory::from_settings(settings)?.json(&args, "Extracting the plugin", &|| false, READ_LIMIT);
    done.map_err(|error| {
        let reason = format!("{error:#}");
        anyhow::anyhow!("{}", reason.strip_prefix("Project extract failed: ").unwrap_or(&reason).to_owned())
    })
}

/// `install_project {id, targets}`: puts the project's built plugin on the targets named (ids of the
/// registry's managed harnesses), from the release inside the file as it is now. In one place it saves the
/// registry plugin `<slug>` (its field `project` is the project's id) with one distribution for each
/// harness kind of those targets, taken from the cached unpack of the file and recording the file's digest,
/// and sets the plugin's targets to exactly those ids. A target not named is not made a target, and
/// stays what it was: switching one harness on never turns on another of its kind. (A target that is
/// paused and already the plugin's stays: the page shows no switch for it, so a request cannot speak for it.)
/// The plugin inside the file is first checked against the package beside it (`muro project verify`): a
/// file whose plugin was not built from its own package is refused. The next plan installs it, and a plan
/// finds the builds stale when the file changes (`Project file changed: open the project again`). A plugin
/// of that name that is not this project's is never touched. A copy of the plugin already installed on a
/// named target, under the name the build declares, is taken over: it is the project's from then on, and
/// a plugin of the list that held it lets that target go.
pub fn install(data: &Path, payload: &Value) -> Result<Value> {
    let id = payload["id"].as_str().unwrap_or("");
    let current = registry(data)?;
    let (target_ids, kinds) = named_targets(&current, payload)?;
    let file = listed_file(&current, id)?;
    let factory = Factory::from_settings(&current["settings"])?;
    let read = factory.project_info(&file, &cache_dir(data), true)?;
    if let Some(error) = read["error"].as_str() {
        bail!("{error}");
    }
    let slug = read["plugin"]["slug"].as_str().context("The project names no plugin")?;
    ensure!(slug == id, "The project file now holds the plugin {slug}, not {id}; open the project again");
    let (name, digest) = (
        read["plugin"]["name"].as_str().unwrap_or(slug),
        read["digest"].as_str().context("The factory gave no digest")?,
    );
    let root = cache_dir(data).join(digest);
    let release = root.join("release").join(slug);
    ensure!(release.is_dir(), "This project has no built plugin yet: it is built when the project is harmonized");
    factory.project_verify(&file, &cache_dir(data))?;
    let mut builds = vec![];
    for kind in &kinds {
        let adapter = release.join("adapters").join(kind);
        ensure!(adapter.is_dir(), "This project's build has no adapter for {kind}");
        let adapter = adapter.canonicalize()?;
        let (native_name, version) = list::build_identity(kind, &adapter)
            .with_context(|| format!("The {kind} build of this project cannot be read"))?;
        builds.push((kind.clone(), adapter, version, native_name));
    }
    // The folder `release/` of the unpack, not the plugin inside it: a registry source that holds
    // `adapters/<harness>` is resolved into native distributions of its own, which carry no record of
    // the project file; this one holds none, so what is recorded below is what a resolve keeps.
    let source = root.join("release").to_string_lossy().into_owned();
    if let Some(old) = plugin_of(&current, id) {
        ensure!(
            old["project"] == id,
            "A plugin named {id} is already in your list and is not this project's; remove it first"
        );
    }
    // A plugin whose source is another unpack of the file (or that was never resolved) starts over:
    // the registry takes a new source only with its old builds and resolved metadata cleared, and it
    // resolves the folder itself, so the revision the builds record is the registry's own.
    let resolved = plugin_of(&current, id)
        .is_some_and(|old| old["source"] == source.as_str() && old["upstream_revision"].is_string());
    let follows_archive = plugin_of(&current, id).is_some_and(|old| old["resolved_project"].is_object());
    if follows_archive {
        crate::request(data, "resolve", json!({"id":id}))?;
    } else if !resolved {
        update(data, |reg| {
            if let Some(old) = plugin_of(reg, id) {
                ensure!(old["project"] == id && old["resolved_project"].is_null(), "The plugin changed. Open the project again.");
            }
            let mut plugin = plugin_of(reg, id).cloned().unwrap_or_else(|| {
                json!({"id":id,"name":name,"policy":"head","pinned_version":"","targets":[]})
            });
            plugin["source"] = json!(source);
            plugin["project"] = json!(id);
            plugin["distributions"] = json!([]);
            if let Some(object) = plugin.as_object_mut() {
                for key in ["resolved_source", "upstream_revision", "upstream_version", "last_checked"] {
                    object.remove(key);
                }
            }
            Ok(Some(("save_plugin", json!({"plugin":plugin}))))
        })?;
        crate::request(data, "resolve", json!({"id":id}))?;
    }
    let saved = update(data, |reg| {
        let mut plugin = plugin_of(reg, id).cloned().context("The plugin disappeared")?;
        ensure!(plugin["project"] == id, "The plugin changed. Open the project again.");
        let revision = plugin["upstream_revision"].as_str().context("The project's folder was not resolved")?.to_owned();
        let mut targets: Vec<Value> = target_ids.iter().map(|target| json!(target)).collect();
        for held in plugin["targets"].as_array().into_iter().flatten() {
            let paused = reg["targets"].as_array().into_iter().flatten().any(|t| t["id"] == *held && t["enabled"] != true);
            if paused && !targets.contains(held) {
                targets.push(held.clone());
            }
        }
        if plugin["resolved_project"].is_object() {
            ensure!(plugin["resolved_project"]["digest"] == digest, "The project file changed. Open the project again.");
        } else {
            ensure!(!follows_archive && plugin["source"] == source.as_str(), "The plugin source changed. Open the project again.");
            let distributions: Vec<Value> = builds.iter().map(|(kind, adapter, version, _)| {
                json!({"harness":kind,"path":adapter.to_string_lossy(),"version":version,"origin":"muro",
                       "source_revision":revision,"project_digest":digest})
            }).collect();
            plugin["distributions"] = json!(distributions);
        }
        plugin["targets"] = json!(targets);
        Ok(Some(("save_plugin", json!({"plugin":plugin}))))
    })?;
    let plugin = saved
        .as_ref()
        .and_then(|snapshot| plugin_of(&snapshot["registry"], id))
        .cloned()
        .context("The plugin was not saved")?;
    // A copy of the same plugin already on a named target (the person installed it, or another plugin
    // of the list holds it) becomes this project's, so the next plan replaces it with the build instead
    // of installing a second copy beside it (`take_over` of the registry).
    for target in &target_ids {
        let kind = current["targets"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|t| t["id"] == target.as_str())
            .and_then(|t| t["harness"].as_str())
            .unwrap_or("");
        let Some((_, _, _, native_name)) = builds.iter().find(|build| build.0 == kind) else {
            continue;
        };
        update(data, |_| {
            Ok(Some(("take_over", json!({"plugin_id":id,"target_id":target,"name":native_name}))))
        })?;
    }
    sweep_cache(data);
    Ok(json!({"id":id,"plugin":plugin,"digest":digest,"harnesses":kinds,"targets":target_ids}))
}

// --- removing a project, and keeping the cache to what is used ----------------------------------------

/// `remove_project {id}`: the project leaves the list (never its file) and the cache folders nothing
/// needs any more are removed.
pub fn remove(data: &Path, payload: &Value) -> Result<Value> {
    let result = muro_registry::service::request(data, "remove_project", payload.clone())?;
    sweep_cache(data);
    Ok(result)
}

/// How old a leftover must be before a start removes it: an unpack or a simulation of a day ago did not
/// outlive its process.
const STALE: Duration = Duration::from_secs(24 * 60 * 60);

/// The digests of the builds the registry's plugins carry: the unpack that holds one is what the
/// harnesses were given, so it stays however its project file has changed since.
fn distribution_digests(registry: &Value) -> HashSet<String> {
    registry["plugins"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|plugin| plugin["resolved_project"]["digest"].as_str().into_iter().chain(
            plugin["distributions"].as_array().into_iter().flatten().filter_map(|d| d["project_digest"].as_str())))
        .map(str::to_owned)
        .collect()
}

/// The digests of the unpacks the cache keeps: that of each listed project's file as it is now, and
/// those of the builds installed.
fn kept_digests(registry: &Value) -> HashSet<String> {
    let mut kept = distribution_digests(registry);
    for project in listed(registry) {
        if let Some(digest) = project["path"].as_str().and_then(|path| list::file_digest(Path::new(path)).ok()) {
            kept.insert(digest);
        }
    }
    kept
}

/// The name of a cache folder the factory made for a file: the SHA-256 of its bytes. Any other name is
/// not this module's to remove.
fn is_digest(name: &str) -> bool {
    name.len() == 64 && name.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Removes the cache folders named by a digest that is neither a listed project's current file nor an
/// installed build's. Best effort: a folder that cannot be removed now is tried at the next sweep, and a
/// registry that cannot be read leaves the cache as it is.
pub fn sweep_cache(data: &Path) {
    let _ = muro_registry::service::with_registry(data, |current| {
        let kept = kept_digests(current);
        for entry in std::fs::read_dir(cache_dir(data))?.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_digest(&name) && !kept.contains(&name) && entry.path().is_dir() {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
        Ok(())
    });
}

/// Removes what in `folder` is older than a day at `now` and whose name `named` accepts.
fn remove_stale(folder: &Path, named: impl Fn(&str) -> bool, now: SystemTime) {
    let Ok(entries) = std::fs::read_dir(folder) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let old = entry.metadata().and_then(|meta| meta.modified()).is_ok_and(|time| now.duration_since(time).is_ok_and(|age| age > STALE));
        if named(&name) && old {
            let path = entry.path();
            let _ = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
        }
    }
}

/// At start: the unpack staging folders the factory left (`.muro-unpack-*`, a process that ended in the
/// middle of an unpack) and the simulations' work folders (`simulations/<run>`) older than a day are
/// removed, and so is every cache folder no project and no build needs (`sweep_cache`).
pub fn sweep(data: &Path) {
    sweep_at(data, SystemTime::now());
}

/// `sweep` as of `now`.
pub fn sweep_at(data: &Path, now: SystemTime) {
    remove_stale(&cache_dir(data), |name| name.starts_with(".muro-unpack-"), now);
    remove_stale(&data.join("simulations"), |_| true, now);
    sweep_cache(data);
}

// --- small actions -----------------------------------------------------------------------------

/// The filter a page asks the file dialog for, as it writes it for a person: `Muro project (*.mp)`.
/// The name before the parentheses, and the extensions of the `*.ext` patterns inside them, separated by
/// `;`, `,` or a space. An empty filter is no filter. Anything else is refused, so the dialog is never
/// built from text it was not meant to take.
pub fn dialog_filter(filter: &str) -> Result<Option<(String, Vec<String>)>> {
    let filter = filter.trim();
    if filter.is_empty() {
        return Ok(None);
    }
    const SHAPE: &str = "The file filter must look like: Name (*.ext)";
    let (name, rest) = filter.rsplit_once('(').context(SHAPE)?;
    let patterns = rest.strip_suffix(')').context(SHAPE)?;
    let name = name.trim();
    ensure!(
        (1..=60).contains(&name.chars().count()) && !name.chars().any(char::is_control),
        "{SHAPE}"
    );
    let mut extensions = vec![];
    for pattern in patterns.split([';', ',', ' ']).filter(|p| !p.is_empty()) {
        let extension = pattern.strip_prefix("*.").context(SHAPE)?;
        ensure!(
            (1..=10).contains(&extension.len()) && extension.chars().all(|c| c.is_ascii_alphanumeric()),
            "{SHAPE}"
        );
        extensions.push(extension.to_owned());
    }
    ensure!((1..=8).contains(&extensions.len()), "{SHAPE}");
    Ok(Some((name.to_owned(), extensions)))
}

/// `env_present {name}`: whether the environment variable named is set (and not empty) for Muro, which
/// is where the factory reads the AI key. The value is never read into the answer.
pub fn env_present(payload: &Value) -> Result<Value> {
    let name = payload["name"].as_str().unwrap_or("");
    muro_registry::ai::validate_key_env(name)?;
    Ok(json!({"set":std::env::var_os(name).is_some_and(|value| !value.is_empty())}))
}

/// The folder `open_folder` may open for `path`: the folder of a listed project's file, named by the
/// file or by the folder. Anything else is refused.
pub fn folder_to_open(registry: &Value, path: &str) -> Result<PathBuf> {
    let wanted = same_file(path);
    for project in listed(registry) {
        let Some(file) = project["path"].as_str() else { continue };
        let Some(folder) = Path::new(file).parent() else { continue };
        if same_file(file) == wanted || same_file(&folder.to_string_lossy()) == wanted {
            return Ok(folder.to_path_buf());
        }
    }
    bail!("Only the folder of a project in your list can be opened")
}

/// `open_folder {path}`: the file manager on the folder of a listed project.
pub fn open_folder(data: &Path, payload: &Value) -> Result<Value> {
    let folder = folder_to_open(&registry(data)?, payload["path"].as_str().unwrap_or(""))?;
    ensure!(folder.is_dir(), "The folder is missing: {}", folder.display());
    crate::open_in_file_manager(&folder)?;
    Ok(json!({"path":folder}))
}
