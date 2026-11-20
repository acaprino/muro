//! Projects in the desktop runtime (ADR-0028): the `.mp` files the registry lists, read through the
//! bundled factory (`muro project info`), opened from anywhere, put on the harnesses as a registry
//! plugin, and the default project Muro ships. The factory owns the format; the registry owns the
//! list and the plugins; this module connects them and decides nothing about what a project means.
use crate::factory::Factory;
use anyhow::{Context, Result, bail, ensure};
use muro_registry::projects::{self as list, same_file};
use serde_json::{Value, json};
use std::{
    io::Write,
    path::{Path, PathBuf},
};

/// The harness kinds the factory builds an adapter for.
pub const HARNESSES: [&str; 5] = ["claude-code", "codex", "opencode", "pi", "hermes"];
/// The project every Muro ships, and the name of its file.
const DEFAULT_ID: &str = "marionette";

/// Where the factory unpacks each project file once, named by the file's digest. Inside the data
/// directory, so a portable Muro keeps it with its data.
pub fn cache_dir(data: &Path) -> PathBuf {
    data.join("project-cache")
}

/// Where the project Muro ships is kept: a copy that is the person's own from then on.
pub fn projects_dir(data: &Path) -> PathBuf {
    data.join("projects")
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

/// The summary of one listed file as the page shows it: its id and path, and what `info --summary` says,
/// or the reason it cannot be read. A file that is gone is not worth a factory run.
fn summary(factory: &Factory, data: &Path, id: &str, path: &str) -> Result<Value> {
    if !Path::new(path).is_file() {
        return Ok(json!({"id":id,"path":path,"error":missing(path)}));
    }
    let read = factory.project_info(Path::new(path), &cache_dir(data), true)?;
    if let Some(error) = read["error"].as_str() {
        return Ok(json!({"id":id,"path":path,"error":error}));
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
        shown.push(summary(&factory, data, id, path).unwrap_or_else(|error| json!({"id":id,"path":path,"error":format!("{error:#}")})));
    }
    Ok(json!(shown))
}

/// `project {id}`: the full `info` of a listed project, for its page.
pub fn project(data: &Path, payload: &Value) -> Result<Value> {
    let current = registry(data)?;
    let file = listed_file(&current, payload["id"].as_str().unwrap_or(""))?;
    Factory::from_settings(&current["settings"])?.project_info(&file, &cache_dir(data), false)
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
    let read = factory.project_info(Path::new(path), &cache_dir(data), true)?;
    if let Some(error) = read["error"].as_str() {
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
                "A project named {slug} is already in your list ({}); remove it or open the other file",
                taken["path"].as_str().unwrap_or("")
            );
        }
        shown["id"] = json!(slug);
        shown["path"] = json!(path);
        let mut next = items.to_vec();
        next.push(json!({"id":slug,"path":path}));
        Ok(Some(("save_projects", json!({"projects":next}))))
    })?;
    Ok(shown)
}

/// The harness kinds a request names: a nonempty list of known kinds, each once.
fn kinds(payload: &Value) -> Result<Vec<String>> {
    let named = payload["harnesses"].as_array().context("Name the harnesses to install on")?;
    let mut kinds: Vec<String> = vec![];
    for kind in named {
        let kind = kind.as_str().context("A harness is its name")?;
        ensure!(HARNESSES.contains(&kind), "No Muro adapter for the harness {kind}");
        if !kinds.iter().any(|known| known == kind) {
            kinds.push(kind.to_owned());
        }
    }
    ensure!(!kinds.is_empty(), "Name at least one harness to install on");
    Ok(kinds)
}

fn plugin_of<'a>(registry: &'a Value, id: &str) -> Option<&'a Value> {
    registry["plugins"].as_array()?.iter().find(|p| p["id"] == id)
}

/// `install_project {id, harnesses}`: puts the project's built plugin on the harnesses named, from the
/// release inside the file as it is now. In one place it saves the registry plugin `<slug>` (its field
/// `project` is the project's id) with one distribution for each kind named, taken from the cached
/// unpack of the file and recording the file's digest, and sets the plugin's targets: every enabled
/// target of each kind named, and none of a kind left out. The next plan installs it, and a plan finds
/// the builds stale when the file changes (`Project file changed: open the project again`). A plugin
/// of that name that is not this project's is never touched.
pub fn install(data: &Path, payload: &Value) -> Result<Value> {
    let id = payload["id"].as_str().unwrap_or("");
    let kinds = kinds(payload)?;
    let current = registry(data)?;
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
    let mut builds = vec![];
    for kind in &kinds {
        let adapter = release.join("adapters").join(kind);
        ensure!(adapter.is_dir(), "This project's build has no adapter for {kind}");
        let adapter = adapter.canonicalize()?;
        let version = list::build_version(kind, &adapter)
            .with_context(|| format!("The {kind} build of this project cannot be read"))?;
        builds.push((kind.clone(), adapter, version));
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
    if !resolved {
        update(data, |reg| {
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
        muro_registry::service::request(data, "resolve", json!({"id":id}))?;
    }
    let mut unmanaged = vec![];
    let saved = update(data, |reg| {
        let mut plugin = plugin_of(reg, id).cloned().context("The plugin disappeared")?;
        let revision = plugin["upstream_revision"].as_str().context("The project's folder was not resolved")?.to_owned();
        let held: Vec<&Value> = plugin["targets"].as_array().into_iter().flatten().collect();
        let (mut targets, mut distributions) = (vec![], vec![]);
        unmanaged = vec![];
        for kind in &kinds {
            let mut of_kind = false;
            for target in reg["targets"].as_array().into_iter().flatten().filter(|t| t["harness"] == kind.as_str()) {
                // Every enabled target of a kind named; a disabled one only where the plugin already is.
                if target["enabled"] == true || held.contains(&&target["id"]) {
                    targets.push(target["id"].clone());
                }
                of_kind |= target["enabled"] == true;
            }
            if !of_kind {
                unmanaged.push(kind.clone());
            }
        }
        for (kind, adapter, version) in &builds {
            distributions.push(json!({
                "harness":kind,"path":adapter.to_string_lossy(),"version":version,"origin":"muro",
                "source_revision":revision,"project_digest":digest}));
        }
        plugin["distributions"] = json!(distributions);
        plugin["targets"] = json!(targets);
        Ok(Some(("save_plugin", json!({"plugin":plugin}))))
    })?;
    let plugin = saved
        .as_ref()
        .and_then(|snapshot| plugin_of(&snapshot["registry"], id))
        .cloned()
        .context("The plugin was not saved")?;
    Ok(json!({"id":id,"plugin":plugin,"digest":digest,"harnesses":kinds,"unmanaged":unmanaged}))
}

// --- the project Muro ships ------------------------------------------------------------------

/// What `install_default` found and did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DefaultProject {
    /// This Muro carries no default project (a build made without resources).
    NotBundled,
    /// Done before, or a file of the person's own is there: kept as it is, listed or not (it may have
    /// been removed on purpose).
    AlreadyThere,
    /// Another project of the list already has the id: the person's own, left alone.
    IdTaken,
    /// Copied into the data directory and listed.
    Installed,
}

/// The mark that the default project was put in this data directory once: a project the person
/// removed or deleted is not brought back at every start.
fn installed_mark(data: &Path) -> PathBuf {
    projects_dir(data).join(".default-installed")
}

/// First start: the project Muro ships (`<resources>/projects/marionette.mp`) is copied to
/// `<data>/projects/marionette.mp` and listed, once. An existing file there is never replaced, changed
/// or listed again: it is the person's own, which may be newer or edited. The entry is listed before
/// the file is copied and the mark is written last, so a start that ended in between is finished by the
/// next one, and the file only ever appears whole.
pub fn install_default(data: &Path, resources: &Path) -> Result<DefaultProject> {
    let bundled = resources.join("projects").join(format!("{DEFAULT_ID}.mp"));
    if !bundled.is_file() {
        return Ok(DefaultProject::NotBundled);
    }
    let folder = projects_dir(data);
    let mark = installed_mark(data);
    if mark.exists() {
        return Ok(DefaultProject::AlreadyThere);
    }
    let target = folder.join(format!("{DEFAULT_ID}.mp"));
    std::fs::create_dir_all(&folder)?;
    if std::fs::symlink_metadata(&target).is_ok() {
        std::fs::write(&mark, b"")?;
        return Ok(DefaultProject::AlreadyThere);
    }
    let path = target.to_string_lossy().into_owned();
    let mut taken = false;
    update(data, |reg| {
        let items = listed(reg);
        if items.iter().any(|p| p["path"].as_str().is_some_and(|p| same_file(p) == same_file(&path))) {
            return Ok(None);
        }
        if items.iter().any(|p| p["id"] == DEFAULT_ID) {
            taken = true;
            return Ok(None);
        }
        let mut next = items.to_vec();
        next.push(json!({"id":DEFAULT_ID,"path":path}));
        Ok(Some(("save_projects", json!({"projects":next}))))
    })?;
    if taken {
        std::fs::write(&mark, b"")?;
        return Ok(DefaultProject::IdTaken);
    }
    let mut copy = tempfile::NamedTempFile::new_in(&folder)?;
    std::io::copy(&mut std::fs::File::open(&bundled)?, &mut copy)?;
    copy.flush()?;
    copy.as_file().sync_all()?;
    let result = match copy.persist_noclobber(&target) {
        Ok(_) => DefaultProject::Installed,
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => DefaultProject::AlreadyThere,
        Err(error) => return Err(error.error.into()),
    };
    std::fs::write(&mark, b"")?;
    Ok(result)
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
