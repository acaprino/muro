use crate::{native, projects, storage::*};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

fn git(args: &[&str], cwd: Option<&Path>) -> Result<String> {
    native::command(
        "git",
        &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        Some(("GIT_TERMINAL_PROMPT", "0")),
        cwd,
    )
    .map(|s| s.trim().to_owned())
}
/// A drive path, a UNC path or a path starting with `/` or `~`, on any platform: a folder on
/// this machine, never a Git URL or an owner/repository.
fn is_local_path(source: &str) -> bool {
    let b = source.as_bytes();
    source.starts_with(['/', '\\', '~'])
        || (b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':')
}
fn source_url(input: &str) -> Result<(url::Url, Option<String>)> {
    let raw = if !input.contains("://") && !input.starts_with("git@") {
        format!("https://github.com/{input}")
    } else {
        input.to_owned()
    };
    let mut url = url::Url::parse(&raw)
        .context("Source must be a local path, HTTPS Git URL or owner/repository")?;
    ensure!(
        matches!(url.scheme(), "https" | "file"),
        "Only HTTPS and local file Git sources are supported"
    );
    ensure!(
        url.username().is_empty() && url.password().is_none(),
        "Do not put credentials in source URLs; configure Git authentication"
    );
    let sub = url.fragment()
        .map(|fragment| percent_encoding::percent_decode_str(fragment).decode_utf8().map(|s| s.into_owned()))
        .transpose()
        .context("The repository path must be UTF-8")?;
    url.set_fragment(None);
    if let Some(ref s) = sub {
        ensure!(
            Path::new(s)
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_))),
            "Source subdirectory must stay inside the repository"
        );
    }
    Ok((url, sub))
}
fn latest_release(url: &url::Url) -> Result<Option<String>> {
    if url.host_str() != Some("github.com") {
        return Ok(None);
    }
    let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
    ensure!(
        parts.len() == 2,
        "Use a repository URL, with #subdirectory when needed"
    );
    let api = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        parts[0],
        parts[1].trim_end_matches(".git")
    );
    let exe = if cfg!(windows) { "curl.exe" } else { "curl" };
    let output = native::command(
        exe,
        &[
            "--silent".into(),
            "--show-error".into(),
            "--location".into(),
            "--max-time".into(),
            "40".into(),
            "--header".into(),
            "Accept: application/vnd.github+json".into(),
            "--user-agent".into(),
            "muro-registry".into(),
            "--write-out".into(),
            "\n%{http_code}".into(),
            api,
        ],
        None,
        None,
    )?;
    let (body, status) = output.rsplit_once('\n').context("Missing HTTP status")?;
    if status == "404" {
        return Ok(None);
    }
    ensure!(
        status == "200",
        "GitHub release lookup failed (HTTP {status}); current installations were preserved"
    );
    let doc: Value = serde_json::from_str(body)?;
    ensure!(
        doc["draft"] == false && doc["prerelease"] == false,
        "GitHub returned a non-stable release"
    );
    Ok(Some(str_field(&doc, "tag_name")?.to_owned()))
}
fn select_ref(plugin: &Value, repo: &Path, url: &url::Url) -> Result<String> {
    match str_field(plugin, "policy")? {
        "pinned" => Ok(str_field(plugin, "pinned_version")?.to_owned()),
        "head" => Ok("HEAD".into()),
        "stable" => {
            if let Some(release) = latest_release(url)? {
                return Ok(release);
            }
            let tags = git(&["tag", "--sort=-version:refname"], Some(repo))?;
            let tags: Vec<_> = tags.lines().filter(|s| !s.trim().is_empty()).collect();
            if tags.is_empty() {
                Ok("HEAD".into())
            } else {
                bail!(
                    "This upstream has tags but no published stable release. Choose an explicit tag with pinned policy; no tag is silently selected."
                )
            }
        }
        _ => bail!("Invalid version policy"),
    }
}
/// The user's home folder: `USERPROFILE` on Windows, `HOME` elsewhere.
fn home_dir() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
}
/// A source that is `~`, or starts with `~/` or `~\`, names a place under `home`. Any other
/// source (`~user` is not the user's own home), or no known `home`, is the path as written.
fn expand_home(source: &str, home: Option<&Path>) -> PathBuf {
    let Some(home) = home else {
        return PathBuf::from(source);
    };
    match source.strip_prefix('~') {
        Some("") => home.to_path_buf(),
        // Every separator goes: a path that starts with one would replace the home on `join`.
        Some(rest) if rest.starts_with(['/', '\\']) => {
            home.join(rest.trim_start_matches(['/', '\\']))
        }
        _ => PathBuf::from(source),
    }
}
fn checkout(root: &Path, plugin: &Value) -> Result<(PathBuf, String, String)> {
    checkout_in(root, plugin, home_dir().as_deref())
}

/// Marks an archive refusal so Sync can keep a failed update out of a plan.
#[derive(Debug)]
pub(crate) struct ProjectSource;

impl std::fmt::Display for ProjectSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Cannot use the .mp plugin source")
    }
}

fn is_mp(path: &Path) -> bool {
    path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("mp"))
}

/// Only the selected folder is inspected. In a store, its .mp owns the release even if a
/// previous release has left adapter folders beside it. Several files require an explicit choice.
fn plugin_source(path: &Path, source: &str) -> Result<PathBuf> {
    if !path.is_dir() {
        ensure!(is_mp(path), "Choose a plugin folder or a .mp project file");
        ensure!(!path.is_symlink(), "A .mp source must be a regular file: {}", path.display());
        return Ok(path.canonicalize()?);
    }
    let folder = path.canonicalize()?;
    let mut files = vec![];
    for entry in fs::read_dir(&folder)? {
        let entry = entry?;
        if is_mp(&entry.path()) && !entry.file_type()?.is_dir() {
            files.push(entry.path());
        }
    }
    files.sort();
    match files.as_slice() {
        [] => Ok(folder),
        [file] => {
            ensure!(
                fs::symlink_metadata(file)?.is_file(),
                "A .mp source must be a regular file: {}", file.display()
            );
            Ok(file.clone())
        }
        _ => {
            let choices: Vec<_> = files.iter().map(|p| {
                if path == Path::new(source) || is_local_path(source) {
                    p.display().to_string()
                } else {
                    narrowed(source, &p.file_name().unwrap_or_default().to_string_lossy())
                }
            }).collect();
            bail!("Choose one .mp file: {}", choices.join(" or "))
        }
    }
}

/// `checkout` for a given home folder, which a test sets and the user's own never changes.
fn checkout_in(
    root: &Path,
    plugin: &Value,
    home: Option<&Path>,
) -> Result<(PathBuf, String, String)> {
    let source = str_field(plugin, "source")?;
    let path = expand_home(source, home);
    if path.exists() {
        let selected = if plugin["project"].is_string() {
            path.canonicalize()?
        } else {
            plugin_source(&path, source).context(ProjectSource)?
        };
        // A file gets its revision from the verified bytes. A folder still uses its tree hash.
        let revision = if selected.is_file() { String::new() } else { tree_hash(&selected)? };
        return Ok((selected, revision, "local".into()));
    }
    let local_name = is_local_path(source) || !source.contains(['/', '\\'])
        || source.starts_with("./") || source.starts_with(".\\");
    if local_name && is_mp(&path) {
        return Err(anyhow::anyhow!("Project file not found: {source}")).context(ProjectSource);
    }
    // A moved or deleted folder must not be looked up as an owner/repository on GitHub.
    ensure!(!is_local_path(source), "Source folder not found: {source}");
    let (url, sub) = source_url(source)?;
    let source_key = hash(&json!(url.as_str()));
    let repos = root.join("sources");
    fs::create_dir_all(&repos)?;
    let repo = repos.join(&source_key).join("repository");
    if !repo.exists() {
        fs::create_dir_all(repo.parent().unwrap())?;
        git(
            &[
                "clone",
                "--mirror",
                "--",
                url.as_str(),
                &repo.to_string_lossy(),
            ],
            None,
        )?;
    } else {
        git(&["fetch", "--prune", "--tags", "origin"], Some(&repo))?;
    }
    let reference = select_ref(plugin, &repo, &url)?;
    ensure!(
        !reference.is_empty() && !reference.starts_with('-') && !reference.contains(['\n', '\r']),
        "Invalid source reference"
    );
    let revision = git(
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
        Some(&repo),
    )?;
    ensure!(
        revision.len() == 40 && revision.chars().all(|c| c.is_ascii_hexdigit()),
        "Expected immutable Git commit"
    );
    let destination = repos.join(&source_key).join(&revision);
    if !destination.exists() {
        let temp = tempfile::tempdir_in(repo.parent().unwrap())?;
        let staged = temp.path().join("checkout");
        git(
            &[
                "clone",
                "--no-checkout",
                "--",
                &repo.to_string_lossy(),
                &staged.to_string_lossy(),
            ],
            None,
        )?;
        git(&["checkout", "--detach", &revision], Some(&staged))?;
        fs::rename(staged, &destination)?;
    }
    let source = if let Some(sub) = sub {
        let candidate = destination.join(&sub).canonicalize()
            .with_context(|| format!("The selected repository revision does not contain {sub}"))?;
        ensure!(
            candidate.starts_with(destination.canonicalize()?),
            "Source subdirectory escapes checkout"
        );
        candidate
    } else {
        destination
    };
    let selected = plugin_source(&source, str_field(plugin, "source")?).context(ProjectSource)?;
    Ok((selected, revision, reference))
}
const HARNESSES: [&str; 5] = ["claude-code", "codex", "opencode", "pi", "hermes"];
/// What a source holds for one harness.
enum Found {
    /// The plugin's folder, and the marketplace entry that lists it.
    One(PathBuf, Option<Value>),
    /// The harness's marketplace lists these plugin folders, relative to the source.
    Many(Vec<String>),
    /// The harness's marketplace lists these plugins, two or more of them in one folder: the
    /// names of the plugins that share a folder, in the marketplace's order.
    Shared(Vec<String>),
    None,
}
/// The plugin of harness `h` in `source`, looked for as Muro and the harness look for it: the
/// layout of a Muro build (`adapters/<harness>`), else the harness's manifest at the root, else the
/// one folder the harness's marketplace at the root lists. The structures of different harnesses
/// live side by side in one source. A marketplace that lists more than one plugin is not chosen
/// from: the person points the source at one (`missing` says how), unless plugins share a folder,
/// which no source can point at. A source with none of them is looked at one folder down for a Muro
/// build (`in_a_folder`).
fn find(h: &str, source: &Path) -> Result<Found> {
    match at_the_root(h, source)? {
        Found::None => in_a_folder(h, source),
        found => Ok(found),
    }
}
/// A Muro build published in a folder of its repository (`<folder>/adapters/<harness>`, as
/// a package's own repository holds it in a folder of its name): the address of the repository is then enough, for
/// every harness, also the ones without a marketplace. Several such folders are not chosen from.
fn in_a_folder(h: &str, source: &Path) -> Result<Found> {
    let base = source.canonicalize()?;
    let mut builds: Vec<(String, PathBuf)> = vec![];
    for entry in fs::read_dir(&base)? {
        let Ok(name) = entry?.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        if let Some(adapter) = inside(&base, &format!("{name}/adapters/{h}"))
            .filter(|adapter| native::identity(h, adapter).is_ok())
        {
            builds.push((name, adapter));
        }
    }
    builds.sort();
    Ok(match builds.len() {
        0 => Found::None,
        1 => Found::One(builds.remove(0).1, None),
        _ => Found::Many(builds.into_iter().map(|(name, _)| name).collect()),
    })
}
fn at_the_root(h: &str, source: &Path) -> Result<Found> {
    let adapter = source.join("adapters").join(h);
    if adapter.is_dir() {
        return Ok(match native::identity(h, &adapter) {
            Ok(_) => Found::One(adapter, None),
            Err(_) => Found::None,
        });
    }
    if native::identity(h, source).is_ok()
        && (!matches!(h, "opencode" | "pi") || read(&source.join("package.json"))?.get(h).is_some())
    {
        return Ok(Found::One(source.to_path_buf(), None));
    }
    let Some(file) = native::marketplace(h).map(|m| source.join(m)) else {
        return Ok(Found::None);
    };
    if !file.is_file() {
        return Ok(Found::None);
    }
    let document =
        read(&file).with_context(|| format!("Invalid marketplace {}", file.display()))?;
    let base = source.canonicalize()?;
    let plugin_root = document["metadata"]["pluginRoot"].as_str();
    let mut listed: Vec<(PathBuf, Value)> = vec![];
    for entry in document["plugins"].as_array().into_iter().flatten() {
        let Some(dir) =
            local_source(h, &entry["source"], plugin_root).and_then(|r| inside(&base, &r))
        else {
            continue;
        };
        // Claude Code installs a folder without a manifest: the entry is then its manifest.
        let bare = h == "claude-code"
            && !dir.join(native::manifest(h)?).exists()
            && entry["name"]
                .as_str()
                .is_some_and(|n| native::valid_name(h, n));
        if bare || native::identity(h, &dir).is_ok() {
            listed.push((dir, entry.clone()));
        }
    }
    // Plugins that name one folder cannot be told apart by pointing the source at it.
    let shared: Vec<String> = listed
        .iter()
        .filter(|(dir, _)| listed.iter().filter(|(other, _)| other == dir).count() > 1)
        .map(|(dir, entry)| {
            entry["name"]
                .as_str()
                .map_or_else(|| relative(&base, dir), str::to_owned)
        })
        .collect();
    if !shared.is_empty() {
        return Ok(Found::Shared(shared));
    }
    Ok(match listed.len() {
        0 => Found::None,
        1 => {
            let (dir, entry) = listed.remove(0);
            Found::One(dir, Some(entry))
        }
        _ => Found::Many(listed.iter().map(|(f, _)| relative(&base, f)).collect()),
    })
}
/// `folder`, a folder of `base`, written relative to it with `/` separators.
fn relative(base: &Path, folder: &Path) -> String {
    folder
        .strip_prefix(base)
        .unwrap_or(folder)
        .to_string_lossy()
        .replace('\\', "/")
}
/// The name and version harness `h` installs the plugin in `dir` under: its manifest's. Claude Code
/// takes what the manifest lacks, the manifest itself included, from the marketplace `entry` that
/// lists it, and with no version anywhere the revision's first 12 characters, as it does for a plugin
/// from a Git repository (the folder Muro installs from is not one: Claude Code would say `unknown`).
fn identity_in(
    h: &str,
    dir: &Path,
    entry: Option<&Value>,
    revision: &str,
) -> Result<(String, String)> {
    let listed = |key: &str| {
        entry
            .and_then(|e| e[key].as_str())
            .filter(|v| !v.is_empty())
    };
    let (name, version) = match (native::identity(h, dir), listed("name")) {
        (Ok(found), _) => found,
        (Err(_), Some(name)) if h == "claude-code" => (name.to_owned(), String::new()),
        (Err(e), _) => return Err(e),
    };
    if !version.is_empty() || h != "claude-code" {
        return Ok((name, version));
    }
    let version = listed("version")
        .map(str::to_owned)
        .unwrap_or_else(|| revision.chars().take(12).collect());
    Ok((name, version))
}
/// The folder a marketplace entry's `source` names inside the marketplace, as the harness writes it:
/// Claude Code `./path`, or a bare name under `metadata.pluginRoot`; Codex `{"source":"local",
/// "path":...}`. Any other source (another repository, a package, an archive) is not in this one.
fn local_source(h: &str, source: &Value, plugin_root: Option<&str>) -> Option<String> {
    match (h, source) {
        ("claude-code", Value::String(s)) if s == "." || s.starts_with("./") => Some(s.clone()),
        ("claude-code", Value::String(s)) if !s.is_empty() && !s.contains(['/', '\\']) => {
            plugin_root.map(|r| format!("{}/{s}", r.trim_end_matches('/')))
        }
        ("codex", Value::Object(o)) if o.get("source").and_then(Value::as_str) == Some("local") => {
            o.get("path").and_then(Value::as_str).map(str::to_owned)
        }
        _ => None,
    }
}
/// The folder `relative` names inside `base` (canonical), or nothing when it leaves it, is not
/// there or is not a folder.
fn inside(base: &Path, relative: &str) -> Option<PathBuf> {
    let path = Path::new(relative);
    if !path
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return None;
    }
    let dir = base.join(path).canonicalize().ok()?;
    (dir.starts_with(base) && dir.is_dir()).then_some(dir)
}
/// `source` narrowed to `folder`, a folder of what it resolves to.
fn narrowed(source: &str, folder: &str) -> String {
    if is_local_path(source) {
        return Path::new(source)
            .join(folder)
            .to_string_lossy()
            .into_owned();
    }
    match source.split_once('#') {
        Some((base, sub)) => format!("{base}#{}/{folder}", sub.trim_end_matches('/')),
        None => format!("{source}#{folder}"),
    }
}
/// Why `plugin` has no build for harness `h`, in words a person can act on.
pub fn missing(plugin: &Value, h: &str) -> String {
    let name = native::harness_name(h);
    if plugin["resolved_project"].is_object() {
        return format!("the .mp file contains no installable variant for {name}");
    }
    let Some(resolved) = plugin["resolved_source"].as_str() else {
        return format!(
            "no {name} build yet: check for updates to look for one in the source, or adapt the plugin with AI"
        );
    };
    match find(h, Path::new(resolved)) {
        Err(e) => return format!("the source's {name} files cannot be read: {e:#}"),
        Ok(Found::Many(folders)) => {
            let source = plugin["source"].as_str().unwrap_or_default();
            let choices: Vec<_> = folders.iter().map(|f| narrowed(source, f)).collect();
            return format!(
                "the source holds {} {name} plugins and Muro does not choose one: set the source to {}",
                folders.len(),
                choices.join(" or ")
            );
        }
        Ok(Found::Shared(names)) => {
            return format!(
                "the source's {name} marketplace defines {} plugins in one folder ({}); Muro cannot install one of them alone yet",
                names.len(),
                names.join(", ")
            );
        }
        Ok(Found::One(..) | Found::None) => {}
    }
    let adapters = format!("adapters/{h}");
    let folder = format!("<folder>/adapters/{h}");
    let looked: Vec<&str> = [
        native::manifest(h).ok(),
        native::marketplace(h),
        Some(adapters.as_str()),
        Some(folder.as_str()),
    ]
    .into_iter()
    .flatten()
    .collect();
    format!(
        "no {name} build: the source has none of {}. Point the source at the plugin's folder (for a repository, add #<folder> to its address), or adapt the plugin with AI",
        looked.join(", ")
    )
}
#[cfg(test)]
fn resolve(root: &Path, plugin: &Value) -> Result<Value> {
    resolve_with_projects(root, plugin, &Value::Null, &projects::no_factory)
}

/// An archive has exactly the factory's layout. Loose sources also support each harness's
/// native manifests and marketplaces.
fn native_distribution(
    harness: &str, source: &Path, revision: &str, project_digest: Option<&str>,
) -> Result<Option<Value>> {
    let found = if project_digest.is_some() {
        let adapter = source.join("adapters").join(harness);
        if !adapter.join("INSTALL.md").is_file() {
            return Ok(None);
        }
        Found::One(adapter, None)
    } else {
        find(harness, source)?
    };
    let Found::One(dir, entry) = found else { return Ok(None) };
    let (name, version) = identity_in(harness, &dir, entry.as_ref(), revision)?;
    let mut build = json!({"harness":harness,"path":dir.canonicalize()?,"name":name,"version":version,
                           "origin":"native","source_revision":revision});
    if let Some(digest) = project_digest {
        ensure!(!version.is_empty(), "The {harness} adapter declares no version");
        build["project_digest"] = json!(digest);
    }
    Ok(Some(build))
}

pub fn resolve_with_projects(
    root: &Path,
    plugin: &Value,
    settings: &Value,
    read_project: &projects::ProjectReader<'_>,
) -> Result<Value> {
    let (selected, mut revision, mut version) = checkout(root, plugin)?;
    let mut next = plugin.clone();
    let entry = next.as_object_mut().context("Expected a plugin")?;
    entry.remove("project_source_error");
    entry.remove("resolved_project");

    let archive = if selected.is_file() {
        let built = read_project(settings, &selected).context(ProjectSource)?;
        if let Some(id) = plugin["project"].as_str() {
            let slug = built.release.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if slug != id {
                return Err(anyhow::anyhow!("The project file now holds {slug}, but this plugin belongs to {id}"))
                    .context(ProjectSource);
            }
        }
        if revision.is_empty() {
            if plugin["policy"] == "pinned" && plugin["pinned_version"].as_str() != Some(built.version.as_str()) {
                let expected = str_field(plugin, "pinned_version")?;
                return Err(anyhow::anyhow!(
                    "The local .mp has version {}, but this plugin is pinned to {expected}", built.version
                )).context(ProjectSource);
            }
            revision.clone_from(&built.digest);
            version.clone_from(&built.version);
        }
        Some(built)
    } else {
        None
    };
    let source = archive.as_ref().map_or(selected.as_path(), |built| built.release.as_path());
    next["resolved_source"] = json!(source);
    next["upstream_revision"] = json!(revision);
    next["upstream_version"] = json!(version);
    next["last_checked"] = event("resolve", "complete", "")["time"].clone();
    // install_project owns the selected target builds and their archive digest. Its source is a
    // cached release folder, not a new discovery of arbitrary native plugins.
    if plugin["project"].is_string() && archive.is_none() {
        return Ok(next);
    }
    let mut distributions = vec![];
    // Explicit artifacts belong to the owner. Resolution only replaces its own discoveries.
    for old in plugin["distributions"].as_array().into_iter().flatten() {
        if old["origin"].is_null() || old["origin"] == "manual" {
            distributions.push(old.clone());
        }
    }
    let custom = crate::instructions::read(root, plugin)?;
    if !custom.files.is_empty() {
        for old in plugin["distributions"].as_array().into_iter().flatten() {
            if old["origin"] == "muro" && old["source_revision"] == revision
                && crate::instructions::distribution_matches(&custom, old)
                && !distributions.iter().any(|d| d["harness"] == old["harness"])
            {
                distributions.push(old.clone());
            }
        }
    }
    let mut offered = vec![];
    let project_digest = archive.as_ref().map(|built| built.digest.as_str());
    for h in HARNESSES {
        // Each harness is independent: a missing or invalid variant leaves the others available.
        let Ok(Some(build)) = native_distribution(h, source, &revision, project_digest) else { continue };
        offered.push(h);
        if !distributions.iter().any(|d| d["harness"] == h) {
            distributions.push(build);
        }
    }
    if let Some(built) = &archive {
        if offered.is_empty() {
            return Err(anyhow::anyhow!("The .mp contains no installable harness variants; build the project in Muro first")).context(ProjectSource);
        }
        next["resolved_project"] = json!({"path":selected,"digest":built.digest,"version":built.version,"harnesses":offered});
    }
    for old in plugin["distributions"].as_array().into_iter().flatten() {
        if old["origin"] == "muro"
            && old["source_revision"] == revision
            && !distributions.iter().any(|d| d["harness"] == old["harness"])
        {
            distributions.push(old.clone());
        }
    }
    next["distributions"] = json!(distributions);
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolution_preserves_custom_folder_and_current_adaptation_over_native() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let custom = root.path().join("instructions");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&custom).unwrap();
        fs::write(source.join("package.json"), r#"{"name":"example","version":"1.0.0","opencode":{}}"#).unwrap();
        fs::write(custom.join("recap.md"), "Report progress").unwrap();
        let mut plugin = json!({"id":"example","source":source,"policy":"stable","custom_instructions_dir":custom,"distributions":[]});
        let first = resolve(root.path(),&plugin).unwrap();
        plugin["distributions"] = json!([{"harness":"opencode","origin":"muro","source_revision":first["upstream_revision"],"version":"1.0.0","path":source,
            "custom_instructions_digest":crate::instructions::read(root.path(),&plugin).unwrap().digest()}]);
        let second = resolve(root.path(),&plugin).unwrap();
        assert_eq!(second["custom_instructions_dir"],plugin["custom_instructions_dir"]);
        assert_eq!(second["distributions"][0]["origin"],"muro");
    }
    #[test]
    fn url_boundaries() {
        assert!(source_url("https://github.com/org/repo#../escape").is_err());
        assert!(source_url("org/repo#%2e%2e/another.mp").is_err());
        assert!(source_url("https://secret@example.com/repo").is_err());
        let (u, s) = source_url("org/repo#plugins/demo").unwrap();
        assert_eq!(u.as_str(), "https://github.com/org/repo");
        assert_eq!(s.as_deref(), Some("plugins/demo"));
        for location in ["org/repo#My Plugin.mp", "org/repo#My%20Plugin.mp"] {
            assert_eq!(source_url(location).unwrap().1.as_deref(), Some("My Plugin.mp"));
        }
    }
    #[test]
    fn missing_local_folder_fails_before_any_repository_lookup() {
        let t = tempfile::tempdir().unwrap();
        let gone = t.path().join("gone").to_string_lossy().into_owned();
        for source in [
            gone.as_str(),
            "/muro-missing-source",
            "~/muro-missing-source",
        ] {
            let plugin = json!({"id":"gone","source":source,"policy":"head","distributions":[]});
            let error = resolve(t.path(), &plugin).unwrap_err();
            assert_eq!(
                format!("{error:#}"),
                format!("Source folder not found: {source}")
            );
        }
        assert!(!t.path().join("sources").exists());
    }
    #[test]
    fn a_leading_tilde_is_the_home_folder() {
        let home = Path::new("home-folder");
        for (source, expanded) in [
            ("~", home.to_path_buf()),
            ("~/", home.to_path_buf()),
            ("~/plugins/x", home.join("plugins").join("x")),
            // Never an absolute path that would replace the home folder when joined.
            ("~//x", home.join("x")),
            (r"~\x", home.join("x")),
        ] {
            assert_eq!(expand_home(source, Some(home)), expanded, "{source}");
        }
        // Other shapes are paths as written: another user's home, a tilde inside a name, and no
        // home folder to expand to.
        for source in ["~other/x", "a/~/x", "~x", "/abs/~", "plain"] {
            assert_eq!(expand_home(source, Some(home)), Path::new(source), "{source}");
        }
        assert_eq!(expand_home("~/x", None), Path::new("~/x"));
    }
    #[test]
    fn a_source_under_the_home_folder_is_found_and_a_missing_one_is_not() {
        let t = tempfile::tempdir().unwrap();
        let home = t.path().join("home");
        let folder = home.join("plugins").join("x");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("input.md"), "content").unwrap();
        let found = json!({"id":"x","source":"~/plugins/x","policy":"head","distributions":[]});
        let (path, _, version) = checkout_in(t.path(), &found, Some(&home)).unwrap();
        assert_eq!(path, folder.canonicalize().unwrap());
        assert_eq!(version, "local");
        // The home folder itself is a folder: it is the source.
        let itself = json!({"id":"x","source":"~","policy":"head","distributions":[]});
        let (path, _, _) = checkout_in(t.path(), &itself, Some(&home)).unwrap();
        assert_eq!(path, home.canonicalize().unwrap());
        // A folder that is not there fails as before, with the source as it was written and
        // without a lookup as a repository.
        for source in ["~/plugins/missing", r"~\plugins\missing"] {
            let plugin = json!({"id":"x","source":source,"policy":"head","distributions":[]});
            let error = checkout_in(t.path(), &plugin, Some(&home)).unwrap_err();
            assert_eq!(
                format!("{error:#}"),
                format!("Source folder not found: {source}")
            );
        }
        assert!(!t.path().join("sources").exists());
    }
    #[test]
    fn local_paths_are_told_from_repositories() {
        for local in [
            r"C:\plugins\demo",
            "d:/plugins/demo",
            r"\\server\share\demo",
            "//server/share/demo",
            "/home/user/demo",
            "~/demo",
        ] {
            assert!(is_local_path(local), "{local}");
        }
        for remote in [
            "org/repo",
            "org/repo#plugins/demo",
            "https://github.com/org/repo",
            "file:///C:/repo",
            "git@github.com:org/repo",
        ] {
            assert!(!is_local_path(remote), "{remote}");
        }
    }
    #[test]
    fn local_changed_source_invalidates_adaptation() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("source");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("input.md"), "first").unwrap();
        let mut plugin = json!({"id":"test","source":src,"policy":"stable","distributions":[]});
        let one = resolve(t.path(), &plugin).unwrap();
        plugin["distributions"] = json!([{"harness":"pi","origin":"muro","source_revision":one["upstream_revision"],"version":"1.0","path":src}]);
        assert_eq!(
            resolve(t.path(), &plugin).unwrap()["distributions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        fs::write(src.join("input.md"), "second").unwrap();
        assert!(
            resolve(t.path(), &plugin).unwrap()["distributions"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn resolution_preserves_explicit_distribution_without_native_manifest() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(
            source.join("package.json"),
            r#"{"name":"explicit-plugin","version":"1.0.0"}"#,
        )
        .unwrap();
        let plugin = json!({"id":"explicit-plugin","source":source,"policy":"stable","distributions":[{"harness":"opencode","path":source,"version":"1.0.0"}]});
        let resolved = resolve(tmp.path(), &plugin).unwrap();
        assert_eq!(resolved["distributions"], plugin["distributions"]);
    }

    // Owner, 2026-11-21: "un plugin per codex o claude code hanno le loro strutture", "muro applica
    // la sua struttura nei suoi adattamenti", "ma possono esistere tutte". Each harness finds its
    // plugin in a source as that harness does; `adapters/<harness>` is only the layout of Muro's
    // own builds; the structures of different harnesses live side by side in one source.
    fn put(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn a_store_and_its_project_file_offer_only_the_variants_in_the_verified_release() {
        let data = tempfile::tempdir().unwrap();
        let store = tempfile::tempdir().unwrap();
        let released = data.path().join("release/demo");
        let file = store.path().join("Demo.MP");
        put(&file, "archive bytes");
        let manifest = r#"{"name":"demo","version":"1.0.0"}"#;
        put(&store.path().join("demo/adapters/pi/package.json"), manifest);
        put(&released.join("adapters/codex/.codex-plugin/plugin.json"), manifest);
        put(&released.join("adapters/codex/INSTALL.md"), "Install Codex");
        put(&released.join("adapters/pi/package.json"), manifest); // no INSTALL.md for Pi
        let digest = projects::file_digest(&file).unwrap();
        for source in [store.path(), file.as_path()] {
            let plugin = json!({"id":"demo","source":source,"policy":"head","distributions":[]});
            let resolved = resolve_with_projects(data.path(), &plugin, &Value::Null, &|_, checked| {
                assert_eq!(checked, file.canonicalize().unwrap());
                Ok(projects::VerifiedBuild { release: released.clone(), digest: digest.clone(), version: "1.0.0".into() })
            }).unwrap();
            assert_eq!(resolved["resolved_project"]["harnesses"], json!(["codex"]));
            assert_eq!(resolved["upstream_revision"], digest);
            assert_eq!(resolved["upstream_version"], "1.0.0");
            let builds = resolved["distributions"].as_array().unwrap();
            assert_eq!(builds.len(), 1);
            assert_eq!(builds[0]["project_digest"], digest);
            assert_eq!(builds[0]["harness"], "codex");
        }
    }

    #[test]
    fn a_store_with_two_project_files_names_both_choices() {
        let store = tempfile::tempdir().unwrap();
        for name in ["a.mp", "B two.MP"] {
            put(&store.path().join(name), "archive");
        }
        let reason = plugin_source(store.path(), "org/store").unwrap_err().to_string();
        assert!(reason.contains("org/store#a.mp") && reason.contains("org/store#B two.MP"), "{reason}");
        assert_eq!(plugin_source(&store.path().join("a.mp"), "org/store#a.mp").unwrap(),
                   store.path().join("a.mp").canonicalize().unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn a_store_cannot_select_an_archive_through_a_link() {
        let store = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), store.path().join("linked.mp")).unwrap();
        assert!(plugin_source(store.path(), "org/store").unwrap_err().to_string().contains("regular file"));
    }
    /// The local folder `source` resolved as a plugin on its latest commit.
    fn resolution(source: &Path) -> Value {
        let data = tempfile::tempdir().unwrap();
        let plugin = json!({"id":"p","source":source,"policy":"head","distributions":[]});
        resolve(data.path(), &plugin).unwrap()
    }
    fn dist(harness: &str, path: &str, version: &str) -> (String, String, String) {
        (harness.into(), path.into(), version.into())
    }
    /// The native distributions resolving the local folder `source` finds: harness, folder relative
    /// to the source, version.
    fn found(source: &Path) -> Vec<(String, String, String)> {
        let resolved = resolution(source);
        let base = source.canonicalize().unwrap();
        resolved["distributions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| {
                let path = Path::new(d["path"].as_str().unwrap());
                let relative = path.strip_prefix(&base).unwrap();
                dist(
                    d["harness"].as_str().unwrap(),
                    &relative.to_string_lossy().replace('\\', "/"),
                    d["version"].as_str().unwrap(),
                )
            })
            .collect()
    }
    #[test]
    fn a_claude_code_marketplace_leads_to_the_plugin_folder_it_lists() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"x","source":"./plugins/x"}]}"#,
        );
        put(
            &s.join("plugins/x/.claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.2.0"}"#,
        );
        assert_eq!(found(s), [dist("claude-code", "plugins/x", "1.2.0")]);
    }
    #[test]
    fn a_codex_marketplace_leads_to_its_local_plugin_folder() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".agents/plugins/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"y","source":{"source":"local","path":"./sub/y"}}]}"#,
        );
        put(
            &s.join("sub/y/.codex-plugin/plugin.json"),
            r#"{"name":"y","version":"0.3.0"}"#,
        );
        assert_eq!(found(s), [dist("codex", "sub/y", "0.3.0")]);
    }
    #[test]
    fn the_structures_of_several_harnesses_live_side_by_side_in_one_source() {
        // Claude Code finds its plugin at the root, Codex through its marketplace, Pi in the layout
        // of a Muro build.
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        );
        put(
            &s.join(".agents/plugins/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"x","source":{"source":"local","path":"./codex"}}]}"#,
        );
        put(
            &s.join("codex/.codex-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.1"}"#,
        );
        put(
            &s.join("adapters/pi/package.json"),
            r#"{"name":"x","version":"1.0.2"}"#,
        );
        assert_eq!(
            found(s),
            [
                dist("claude-code", "", "1.0.0"),
                dist("codex", "codex", "1.0.1"),
                dist("pi", "adapters/pi", "1.0.2")
            ]
        );
    }
    #[test]
    fn a_package_repository_is_found_from_its_address_through_its_root_marketplaces() {
        // A package's own repository: the build in a folder of its name, the marketplaces `muro marketplace`
        // writes at the root. Pi, OpenCode and Hermes have no marketplace there: their builds are found in
        // the folder (the tests on a build in a folder below).
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"sample","plugins":[{"name":"sample","source":"./sample/adapters/claude-code","version":"0.5.2"}]}"#,
        );
        put(
            &s.join(".agents/plugins/marketplace.json"),
            r#"{"name":"sample","plugins":[{"name":"sample","source":{"source":"local","path":"./sample/adapters/codex"}}]}"#,
        );
        for (harness, manifest) in [
            ("claude-code", ".claude-plugin/plugin.json"),
            ("codex", ".codex-plugin/plugin.json"),
            ("pi", "package.json"),
        ] {
            put(
                &s.join("sample/adapters").join(harness).join(manifest),
                r#"{"name":"sample","version":"0.5.2"}"#,
            );
        }
        assert_eq!(
            found(s),
            [
                dist("claude-code", "sample/adapters/claude-code", "0.5.2"),
                dist("codex", "sample/adapters/codex", "0.5.2"),
                dist("pi", "sample/adapters/pi", "0.5.2")
            ]
        );
        assert_eq!(found(&s.join("sample")).len(), 3);
    }
    // Owner, 2026-11-21, on Sync refusing a package from the address of its own repository
    // ("è praticamente inutilizzabile"): the repository as a release left it, the build in a folder of
    // the package's name and no marketplace at the root.
    #[test]
    fn a_muro_build_in_a_folder_of_the_source_is_found_from_the_source_alone() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(&s.join("README.md"), "Sample");
        put(&s.join("releases/sample-v0.5.1.md"), "Notes");
        put(
            &s.join("sample/.claude-plugin/plugin.json"),
            r#"{"name":"sample","version":"0.5.1"}"#,
        );
        for (harness, manifest) in [
            ("claude-code", ".claude-plugin/plugin.json"),
            ("codex", ".codex-plugin/plugin.json"),
            ("pi", "package.json"),
        ] {
            put(
                &s.join("sample/adapters").join(harness).join(manifest),
                r#"{"name":"sample","version":"0.5.1"}"#,
            );
        }
        assert_eq!(
            found(s),
            [
                dist("claude-code", "sample/adapters/claude-code", "0.5.1"),
                dist("codex", "sample/adapters/codex", "0.5.1"),
                dist("pi", "sample/adapters/pi", "0.5.1")
            ]
        );
    }
    #[test]
    fn muro_builds_in_several_folders_are_not_chosen_from() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        for name in ["b", "a"] {
            put(
                &s.join(name).join("adapters/codex/.codex-plugin/plugin.json"),
                &json!({"name":name,"version":"1.0.0"}).to_string(),
            );
        }
        // A hidden folder and a folder whose adapter cannot be read are not builds.
        put(
            &s.join(".cache/adapters/codex/.codex-plugin/plugin.json"),
            r#"{"name":"c","version":"1.0.0"}"#,
        );
        put(&s.join("d/adapters/codex/.codex-plugin/plugin.json"), "{");
        assert!(found(s).is_empty());
        let plugin = json!({"source":"o/r","resolved_source":s});
        assert_eq!(
            missing(&plugin, "codex"),
            "the source holds 2 Codex plugins and Muro does not choose one: set the source to o/r#a or o/r#b"
        );
    }
    #[test]
    fn what_the_root_holds_comes_before_a_build_in_a_folder() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        );
        put(
            &s.join("sub/adapters/claude-code/.claude-plugin/plugin.json"),
            r#"{"name":"x","version":"2.0.0"}"#,
        );
        assert_eq!(found(s), [dist("claude-code", "", "1.0.0")]);
    }
    #[test]
    fn a_bare_name_is_a_folder_under_the_marketplace_plugin_root() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","metadata":{"pluginRoot":"./plugins"},"plugins":[{"name":"x","source":"x"}]}"#,
        );
        put(
            &s.join("plugins/x/.claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        );
        assert_eq!(found(s), [dist("claude-code", "plugins/x", "1.0.0")]);
    }
    #[test]
    fn a_source_starting_with_dot_slash_ignores_the_plugin_root() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","metadata":{"pluginRoot":"./plugins"},"plugins":[{"name":"x","source":"./x"}]}"#,
        );
        put(
            &s.join("x/.claude-plugin/plugin.json"),
            r#"{"name":"x","version":"2.0.0"}"#,
        );
        put(
            &s.join("plugins/x/.claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        );
        assert_eq!(found(s), [dist("claude-code", "x", "2.0.0")]);
    }
    #[test]
    fn marketplace_entries_outside_the_source_or_from_elsewhere_are_not_followed() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path().join("source");
        let outside = t.path().join("outside");
        put(
            &outside.join(".claude-plugin/plugin.json"),
            r#"{"name":"o","version":"1.0.0"}"#,
        );
        // A folder inside the source that a valid entry lists is a plugin even without a manifest,
        // as Claude Code installs it (the tests on manifest-less plugins below).
        let marketplace = json!({"name":"m","plugins":[
            {"name":"a","source":"../outside"},
            {"name":"b","source":"./x/../../outside"},
            {"name":"c","source":{"source":"github","repo":"owner/repository"}},
            {"name":"d","source":"./missing"},
            {"name":"e","source":"outside"},
            {"name":"f","source":outside}]});
        put(
            &s.join(".claude-plugin/marketplace.json"),
            &marketplace.to_string(),
        );
        assert!(found(&s).is_empty());
    }
    #[test]
    fn a_marketplace_listing_several_plugins_is_not_chosen_from() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"a","source":"./plugins/a"},{"name":"b","source":"./plugins/b"}]}"#,
        );
        for name in ["a", "b"] {
            put(
                &s.join("plugins")
                    .join(name)
                    .join(".claude-plugin/plugin.json"),
                &json!({"name":name,"version":"1.0.0"}).to_string(),
            );
        }
        assert!(found(s).is_empty());
        // What the plan says in its place names the sources that choose one.
        for (source, choices) in [
            (
                "https://github.com/o/r",
                "https://github.com/o/r#plugins/a or https://github.com/o/r#plugins/b",
            ),
            ("o/r#sub", "o/r#sub/plugins/a or o/r#sub/plugins/b"),
        ] {
            let plugin = json!({"source":source,"resolved_source":s});
            assert_eq!(
                missing(&plugin, "claude-code"),
                format!(
                    "the source holds 2 Claude Code plugins and Muro does not choose one: set the source to {choices}"
                )
            );
        }
    }
    // anthropics/skills lists four plugins with `"source": "./"`: they were merged into the first one.
    // Plugins that share a folder are refused, and the refusal names them.
    #[test]
    fn plugins_that_share_the_root_folder_are_refused_with_their_names() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"document-skills","source":"./"},{"name":"example-skills","source":"./"}]}"#,
        );
        assert!(found(s).is_empty());
        let plugin = json!({"source":"o/r","resolved_source":s});
        assert_eq!(
            missing(&plugin, "claude-code"),
            "the source's Claude Code marketplace defines 2 plugins in one folder (document-skills, example-skills); Muro cannot install one of them alone yet"
        );
    }
    #[test]
    fn only_the_plugins_that_share_a_folder_are_named_and_they_come_before_a_choice_of_folders() {
        // Three plugins, two of them in one folder, listed in an order that is not alphabetical.
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"b-twin","source":"./twin"},{"name":"solo","source":"./solo"},{"name":"a-twin","source":"./twin"}]}"#,
        );
        put(&s.join("twin/commands/hi.md"), "Say hi.");
        put(&s.join("solo/commands/hi.md"), "Say hi.");
        assert!(found(s).is_empty());
        let plugin = json!({"source":"o/r","resolved_source":s});
        assert_eq!(
            missing(&plugin, "claude-code"),
            "the source's Claude Code marketplace defines 2 plugins in one folder (b-twin, a-twin); Muro cannot install one of them alone yet"
        );
    }
    #[test]
    fn a_plugin_without_a_name_that_shares_a_folder_is_named_by_the_folder() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"first","source":"./plugins/pack"},{"source":"./plugins/pack"}]}"#,
        );
        put(
            &s.join("plugins/pack/.claude-plugin/plugin.json"),
            r#"{"name":"pack","version":"1.0.0"}"#,
        );
        assert!(found(s).is_empty());
        let plugin = json!({"source":"o/r","resolved_source":s});
        assert_eq!(
            missing(&plugin, "claude-code"),
            "the source's Claude Code marketplace defines 2 plugins in one folder (first, plugins/pack); Muro cannot install one of them alone yet"
        );
    }
    #[test]
    fn a_harness_whose_files_cannot_be_read_does_not_stop_the_others() {
        // Claude Code finds its manifest at the root; the Codex marketplace is not JSON.
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        );
        put(&s.join(".agents/plugins/marketplace.json"), "not json");
        assert_eq!(found(s), [dist("claude-code", "", "1.0.0")]);
        let plugin = json!({"source":"o/r","resolved_source":s});
        let reason = missing(&plugin, "codex");
        assert!(
            reason.starts_with("the source's Codex files cannot be read: "),
            "{reason}"
        );
        // And the other way round.
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".codex-plugin/plugin.json"),
            r#"{"name":"x","version":"0.3.0"}"#,
        );
        put(&s.join(".claude-plugin/marketplace.json"), "{");
        assert_eq!(found(s), [dist("codex", "", "0.3.0")]);
        let plugin = json!({"source":"o/r","resolved_source":s});
        let reason = missing(&plugin, "claude-code");
        assert!(
            reason.starts_with("the source's Claude Code files cannot be read: "),
            "{reason}"
        );
    }
    #[test]
    fn a_failure_that_is_not_about_one_harness_still_fails_the_resolution() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        );
        let data = tempfile::tempdir().unwrap();
        let plugin = json!({"id":"p","source":s,"policy":"head","custom_instructions_dir":"relative","distributions":[]});
        let error = resolve(data.path(), &plugin).unwrap_err();
        assert_eq!(
            format!("{error:#}"),
            "custom_instructions_dir must be absolute"
        );
    }
    #[test]
    fn a_source_without_a_build_says_where_muro_looked() {
        let t = tempfile::tempdir().unwrap();
        let plugin = json!({"source":"o/r","resolved_source":t.path()});
        assert_eq!(
            missing(&plugin, "claude-code"),
            "no Claude Code build: the source has none of .claude-plugin/plugin.json, .claude-plugin/marketplace.json, adapters/claude-code, <folder>/adapters/claude-code. Point the source at the plugin's folder (for a repository, add #<folder> to its address), or adapt the plugin with AI"
        );
        assert!(
            missing(&plugin, "pi")
                .contains("none of package.json, adapters/pi, <folder>/adapters/pi.")
        );
        assert!(
            missing(&json!({"source":"o/r"}), "codex")
                .starts_with("no Codex build yet: check for updates")
        );
    }
    // Owner, 2026-11-21, "fixalo": Claude Code installs a plugin without `.claude-plugin/plugin.json`
    // (the marketplace entry is then its manifest) and one whose manifest has no version (the
    // entry's version, else the commit's first 12 characters). Muro refused both.
    fn claude_code(resolved: &Value) -> &Value {
        resolved["distributions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["harness"] == "claude-code")
            .unwrap()
    }
    fn short_revision(resolved: &Value) -> String {
        resolved["upstream_revision"].as_str().unwrap()[..12].to_owned()
    }
    #[test]
    fn a_claude_code_plugin_without_a_manifest_is_named_and_versioned_by_its_marketplace_entry() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"ay","source":"./ay","version":"1.4.0"}]}"#,
        );
        put(
            &s.join("ay/skills/hello/SKILL.md"),
            "---\nname: hello\ndescription: Says hello\n---\n",
        );
        assert_eq!(found(s), [dist("claude-code", "ay", "1.4.0")]);
        assert_eq!(claude_code(&resolution(s))["name"], "ay");
    }
    #[test]
    fn a_manifest_without_a_version_takes_the_version_of_the_marketplace_entry() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"bee","source":"./bee","version":"2.0.0"}]}"#,
        );
        put(
            &s.join("bee/.claude-plugin/plugin.json"),
            r#"{"name":"bee"}"#,
        );
        assert_eq!(found(s), [dist("claude-code", "bee", "2.0.0")]);
        assert_eq!(claude_code(&resolution(s))["name"], "bee");
    }
    #[test]
    fn without_any_version_it_is_the_first_12_characters_of_the_revision() {
        // A manifest without one at the root.
        let t = tempfile::tempdir().unwrap();
        put(
            &t.path().join(".claude-plugin/plugin.json"),
            r#"{"name":"x"}"#,
        );
        let resolved = resolution(t.path());
        assert_eq!(claude_code(&resolved)["version"], short_revision(&resolved));
        // No manifest, and a marketplace entry without one.
        let t = tempfile::tempdir().unwrap();
        put(
            &t.path().join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"sea","source":"./sea"}]}"#,
        );
        put(&t.path().join("sea/commands/hi.md"), "Say hi.");
        let resolved = resolution(t.path());
        assert_eq!(claude_code(&resolved)["version"], short_revision(&resolved));
        assert_eq!(claude_code(&resolved)["name"], "sea");
    }
    #[test]
    fn a_folder_without_a_manifest_is_a_claude_code_plugin_only_when_a_marketplace_lists_it() {
        // Components at the root, with no manifest and no marketplace.
        let t = tempfile::tempdir().unwrap();
        put(
            &t.path().join("skills/hello/SKILL.md"),
            "---\nname: hello\ndescription: Says hello\n---\n",
        );
        assert!(found(t.path()).is_empty());
        // A manifest that cannot be read, and a name Claude Code could not install.
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"m","plugins":[{"name":"broken","source":"./broken"},{"name":"a@b","source":"./named"}]}"#,
        );
        put(&s.join("broken/.claude-plugin/plugin.json"), "{");
        put(&s.join("named/commands/hi.md"), "Say hi.");
        assert!(found(s).is_empty());
    }
    #[test]
    fn the_layout_of_a_muro_build_comes_before_a_manifest_at_the_root() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/plugin.json"),
            r#"{"name":"x","version":"1.0.0"}"#,
        );
        put(
            &s.join("adapters/claude-code/.claude-plugin/plugin.json"),
            r#"{"name":"x","version":"2.0.0"}"#,
        );
        assert_eq!(
            found(s),
            [dist("claude-code", "adapters/claude-code", "2.0.0")]
        );
    }
}
