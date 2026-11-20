//! The list of projects the registry keeps (`registry.projects`: `{id, path}` of each `.mp` file) and
//! what a plugin made from a project needs to stay true to it (ADR-0028). The registry never opens a
//! `.mp`: the factory does. It only holds where the files are and compares their digest.
use crate::storage::id;
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    cell::RefCell,
    collections::HashMap,
    io::Read,
    path::{Component, Path},
};

/// What a plan says of a plugin whose project file is not the one its builds were made from.
pub const CHANGED: &str = "Project file changed: open the project again";

/// The most projects a registry lists: a list that long is a mistake, and each one costs a read.
const LIMIT: usize = 500;

/// The id of the project every Muro ships: the runtime puts it in the list, and it is the one project
/// the list never drops. Its file is a copy that is the person's own; the list entry stays.
pub const DEFAULT_ID: &str = "marionette";

/// What `remove` says when asked to drop the project every Muro ships.
pub const DEFAULT_STAYS: &str = "The default project stays in the list";

/// The list without the project `key`: only the entry goes, never the file. The default project is refused,
/// and so is an id the list does not hold.
pub fn remove(list: &Value, key: &str) -> Result<Value> {
    ensure!(key != DEFAULT_ID, DEFAULT_STAYS);
    let items = list.as_array().context("projects must be an array")?;
    ensure!(items.iter().any(|item| item["id"] == key), "That project is not in your list");
    Ok(json!(items.iter().filter(|item| item["id"] != key).cloned().collect::<Vec<_>>()))
}

/// A path as it is compared for being the same file: Windows paths ignore case, take either slash and
/// end with or without one. Two paths name one file when their `same_file` are equal.
pub fn same_file(path: &str) -> String {
    if cfg!(windows) {
        path.replace('/', "\\").trim_end_matches('\\').to_lowercase()
    } else {
        path.to_owned()
    }
}

/// The version a built adapter folder declares for `harness`, read by the registry's own reader: the
/// value a distribution of that folder must record, or the plan refuses it.
pub fn build_version(harness: &str, adapter: &Path) -> Result<String> {
    Ok(crate::native::identity(harness, adapter)?.1)
}

/// The list a request asks to save, as the registry keeps it: each project is `{id, path}` and nothing
/// else; the id is a valid ID and unique; the path is absolute, goes up no folder and names a `.mp`
/// file, and no two projects name the same file.
pub fn validate_list(list: &Value) -> Result<Value> {
    let items = list.as_array().context("projects must be an array")?;
    ensure!(items.len() <= LIMIT, "Too many projects");
    let mut ids = std::collections::HashSet::new();
    let mut files = std::collections::HashSet::new();
    let mut checked = vec![];
    for item in items {
        let object = item.as_object().context("A project is an object with an id and a path")?;
        ensure!(
            object.keys().all(|key| key == "id" || key == "path"),
            "A project holds only an id and a path"
        );
        let key = item["id"].as_str().context("A project needs an id")?;
        id(key)?;
        let path = item["path"].as_str().context("A project needs a path")?;
        validate_path(path)?;
        ensure!(ids.insert(key.to_owned()), "Two projects have the id {key}");
        ensure!(files.insert(same_file(path)), "Two projects name the file {path}");
        checked.push(json!({"id":key,"path":path}));
    }
    Ok(json!(checked))
}

/// An absolute path that goes up no folder and ends in `.mp`: the one rule for a project file, also
/// applied by the runtime before it hands a path to the factory.
pub fn validate_path(path: &str) -> Result<()> {
    let file = Path::new(path);
    ensure!(file.is_absolute(), "A project path must be absolute");
    ensure!(
        !file.components().any(|part| part == Component::ParentDir),
        "A project path must not go up a folder"
    );
    ensure!(
        file.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("mp")),
        "A project file ends in .mp"
    );
    Ok(())
}

/// The SHA-256 of the file as lowercase hex: the digest `muro project info` reports, which names the
/// project's identity (the same bytes, the same project).
pub fn file_digest(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)
        .with_context(|| format!("Cannot read the project file {}", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            return Ok(format!("{:x}", digest.finalize()));
        }
        digest.update(&buffer[..read]);
    }
}

/// Whether the builds of the plugins made from projects are still the ones the files give. A plan
/// asks it for each plugin and harness, and each file is read once.
pub struct Currency<'a> {
    registry: &'a Value,
    digests: RefCell<HashMap<String, std::result::Result<String, String>>>,
}

impl<'a> Currency<'a> {
    pub fn new(registry: &'a Value) -> Self {
        Self {
            registry,
            digests: RefCell::new(HashMap::new()),
        }
    }

    /// Fails with what the plan shows as a blocker when `plugin` is made from a project and its build
    /// for `harness` was not made from that project's file as it is now. Not a project's plugin, or no
    /// build for the harness (the plan says that itself): nothing to check. A build that records no
    /// digest, a project no longer in the list and a file that cannot be read are all changed.
    pub fn check(&self, plugin: &Value, harness: &str) -> Result<()> {
        let Some(project) = plugin["project"].as_str() else {
            return Ok(());
        };
        let Some(build) = plugin["distributions"]
            .as_array()
            .and_then(|all| all.iter().find(|d| d["harness"] == harness))
        else {
            return Ok(());
        };
        let listed = self.registry["projects"]
            .as_array()
            .and_then(|all| all.iter().find(|p| p["id"] == project));
        let Some(path) = listed.and_then(|p| p["path"].as_str()) else {
            bail!("{CHANGED} (it is no longer in your list)");
        };
        let current = self
            .digests
            .borrow_mut()
            .entry(path.to_owned())
            .or_insert_with(|| file_digest(Path::new(path)).map_err(|e| format!("{e:#}")))
            .clone();
        match current {
            Ok(digest) if build["project_digest"].as_str() == Some(digest.as_str()) => Ok(()),
            Ok(_) => bail!(CHANGED),
            Err(reason) => bail!("{CHANGED} ({reason})"),
        }
    }
}
