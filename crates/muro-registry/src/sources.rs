use crate::{native, storage::*};
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
    let sub = url.fragment().map(str::to_owned);
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
/// `checkout` for a given home folder, which a test sets and the user's own never changes.
fn checkout_in(
    root: &Path,
    plugin: &Value,
    home: Option<&Path>,
) -> Result<(PathBuf, String, String)> {
    let source = str_field(plugin, "source")?;
    let path = expand_home(source, home);
    if path.is_dir() {
        let path = path.canonicalize()?;
        return Ok((path.clone(), tree_hash(&path)?, "local".into()));
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
        let candidate = destination.join(sub).canonicalize()?;
        ensure!(
            candidate.starts_with(destination.canonicalize()?),
            "Source subdirectory escapes checkout"
        );
        candidate
    } else {
        destination
    };
    Ok((source, revision, reference))
}
const HARNESSES: [&str; 5] = ["claude-code", "codex", "opencode", "pi", "hermes"];
/// What a source holds for one harness.
enum Found {
    /// The plugin's folder.
    One(PathBuf),
    /// The harness's marketplace lists these plugin folders, relative to the source.
    Many(Vec<String>),
    None,
}
/// The plugin of harness `h` in `source`, looked for as Muro and the harness look for it: the
/// layout of a Muro build (`adapters/<harness>`), else the harness's manifest at the root, else the
/// one folder the harness's marketplace at the root lists. The structures of different harnesses
/// live side by side in one source. A marketplace that lists more than one plugin is not chosen
/// from: the person points the source at one (`missing` says how).
fn find(h: &str, source: &Path) -> Result<Found> {
    let adapter = source.join("adapters").join(h);
    if adapter.is_dir() {
        return Ok(match native::identity(h, &adapter) {
            Ok(_) => Found::One(adapter),
            Err(_) => Found::None,
        });
    }
    if native::identity(h, source).is_ok()
        && (!matches!(h, "opencode" | "pi") || read(&source.join("package.json"))?.get(h).is_some())
    {
        return Ok(Found::One(source.to_path_buf()));
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
    let mut folders: Vec<PathBuf> = vec![];
    for entry in document["plugins"].as_array().into_iter().flatten() {
        let Some(dir) =
            local_source(h, &entry["source"], plugin_root).and_then(|r| inside(&base, &r))
        else {
            continue;
        };
        if native::identity(h, &dir).is_ok() && !folders.contains(&dir) {
            folders.push(dir);
        }
    }
    Ok(match folders.len() {
        0 => Found::None,
        1 => Found::One(folders.remove(0)),
        _ => Found::Many(
            folders
                .iter()
                .map(|f| {
                    f.strip_prefix(&base)
                        .unwrap_or(f)
                        .to_string_lossy()
                        .replace('\\', "/")
                })
                .collect(),
        ),
    })
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
    let Some(resolved) = plugin["resolved_source"].as_str() else {
        return format!(
            "no {name} build yet: check for updates to look for one in the source, or adapt the plugin with AI"
        );
    };
    if let Ok(Found::Many(folders)) = find(h, Path::new(resolved)) {
        let source = plugin["source"].as_str().unwrap_or_default();
        let choices: Vec<_> = folders.iter().map(|f| narrowed(source, f)).collect();
        return format!(
            "the source's {name} marketplace lists {} plugins and Muro does not choose one: set the source to {}",
            folders.len(),
            choices.join(" or ")
        );
    }
    let adapters = format!("adapters/{h}");
    let looked: Vec<&str> = [
        native::manifest(h).ok(),
        native::marketplace(h),
        Some(adapters.as_str()),
    ]
    .into_iter()
    .flatten()
    .collect();
    format!(
        "no {name} build: the source has none of {}. Point the source at the plugin's folder (for a repository, add #<folder> to its address), or adapt the plugin with AI",
        looked.join(", ")
    )
}
pub fn resolve(root: &Path, plugin: &Value) -> Result<Value> {
    let (source, revision, version) = checkout(root, plugin)?;
    let mut next = plugin.clone();
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
    for h in HARNESSES {
        if distributions.iter().any(|d| d["harness"] == h) {
            continue;
        }
        if let Found::One(dir) = find(h, &source)? {
            let (_, native_version) = native::identity(h, &dir)?;
            distributions.push(json!({"harness":h,"path":dir.canonicalize()?.to_string_lossy(),"version":native_version,"origin":"native","source_revision":revision}));
        }
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
    next["resolved_source"] = json!(source);
    next["upstream_revision"] = json!(revision);
    next["upstream_version"] = json!(version);
    next["last_checked"] = event("resolve", "complete", "")["time"].clone();
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
        assert!(source_url("https://secret@example.com/repo").is_err());
        let (u, s) = source_url("org/repo#plugins/demo").unwrap();
        assert_eq!(u.as_str(), "https://github.com/org/repo");
        assert_eq!(s.as_deref(), Some("plugins/demo"));
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
    fn dist(harness: &str, path: &str, version: &str) -> (String, String, String) {
        (harness.into(), path.into(), version.into())
    }
    /// The native distributions resolving the local folder `source` finds: harness, folder relative
    /// to the source, version.
    fn found(source: &Path) -> Vec<(String, String, String)> {
        let data = tempfile::tempdir().unwrap();
        let plugin = json!({"id":"p","source":source,"policy":"head","distributions":[]});
        let resolved = resolve(data.path(), &plugin).unwrap();
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
        // acaprino/marionette: the build in marionette/, the marketplaces `muro marketplace` writes
        // at the root. Pi, OpenCode and Hermes have no marketplace there: their builds are reached
        // with #marionette.
        let t = tempfile::tempdir().unwrap();
        let s = t.path();
        put(
            &s.join(".claude-plugin/marketplace.json"),
            r#"{"name":"marionette","plugins":[{"name":"marionette","source":"./marionette/adapters/claude-code","version":"0.5.2"}]}"#,
        );
        put(
            &s.join(".agents/plugins/marketplace.json"),
            r#"{"name":"marionette","plugins":[{"name":"marionette","source":{"source":"local","path":"./marionette/adapters/codex"}}]}"#,
        );
        for (harness, manifest) in [
            ("claude-code", ".claude-plugin/plugin.json"),
            ("codex", ".codex-plugin/plugin.json"),
            ("pi", "package.json"),
        ] {
            put(
                &s.join("marionette/adapters").join(harness).join(manifest),
                r#"{"name":"marionette","version":"0.5.2"}"#,
            );
        }
        assert_eq!(
            found(s),
            [
                dist("claude-code", "marionette/adapters/claude-code", "0.5.2"),
                dist("codex", "marionette/adapters/codex", "0.5.2")
            ]
        );
        assert_eq!(found(&s.join("marionette")).len(), 3);
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
        put(&s.join("x/keep.txt"), "");
        let marketplace = json!({"name":"m","plugins":[
            {"name":"a","source":"../outside"},
            {"name":"b","source":"./x/../../outside"},
            {"name":"c","source":{"source":"github","repo":"owner/repository"}},
            {"name":"d","source":"./missing"},
            {"name":"e","source":"outside"},
            {"name":"f","source":outside},
            {"name":"g","source":"./x"}]});
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
                    "the source's Claude Code marketplace lists 2 plugins and Muro does not choose one: set the source to {choices}"
                )
            );
        }
    }
    #[test]
    fn a_source_without_a_build_says_where_muro_looked() {
        let t = tempfile::tempdir().unwrap();
        let plugin = json!({"source":"o/r","resolved_source":t.path()});
        assert_eq!(
            missing(&plugin, "claude-code"),
            "no Claude Code build: the source has none of .claude-plugin/plugin.json, .claude-plugin/marketplace.json, adapters/claude-code. Point the source at the plugin's folder (for a repository, add #<folder> to its address), or adapt the plugin with AI"
        );
        assert!(missing(&plugin, "pi").contains("none of package.json, adapters/pi."));
        assert!(
            missing(&json!({"source":"o/r"}), "codex")
                .starts_with("no Codex build yet: check for updates")
        );
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
