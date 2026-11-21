# muro/cli.py
"""CLI entry points: `muro <command>` (also `python -m muro`) and the legacy
`muro_build.py` flag interface, which keeps working unchanged."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from .core import (
    validate_plugin_identity,
    parse_capability,
    parse_router,
)
from .sources import check_sources, licenses_in
from .release import build_release
from .factory import harmonize_prompt, prepare_intake, review_prompt


def _load_capabilities(cap_dir: Path) -> list:
    """Load all capabilities from directory."""
    capabilities = []
    for f in sorted(cap_dir.glob("*.md")):
        capabilities.append(parse_capability(f))
    return capabilities


def _load_router(router_path: Path) -> list:
    """Parse ROUTER.md table into RouterRow objects."""
    return parse_router(router_path)


def _read_manifest(manifest_arg: Path) -> tuple[dict, Path, Path] | None:
    manifest_path = manifest_arg.resolve()
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        return None
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return manifest, manifest_path, manifest_path.parent


def _run_check_sources(manifest: dict, project_root: Path, offline_pins: bool) -> int:
    errs = validate_plugin_identity(manifest.get("plugin", {}))
    errs += check_sources(manifest, project_root, offline_pins=offline_pins)
    if errs:
        for e in errs:
            print(e, file=sys.stderr)
        return 1
    skipped = offline_pins and any(
        isinstance(s, dict) and isinstance(s.get("repo_url"), str) and s["repo_url"].startswith("https://")
        for s in manifest.get("sources", [])
    )
    if skipped:
        print("OK: manifest pins and local sources valid; skipped remote fetch (--offline-pins)")
    else:
        print("OK: all sources and plugin identity valid")
    return 0


def _run_validate(manifest: dict, project_root: Path) -> int:
    cap_dir = project_root / "capabilities"
    router_path = project_root / "ROUTER.md"
    capabilities = _load_capabilities(cap_dir)
    router_rows = _load_router(router_path)
    from .delivery import allows_empty_catalog, load_delivery, unregistered_active_hooks, validate_delivery
    delivery_doc = load_delivery(project_root)
    source_ids = {s.get("id") for s in manifest.get("sources", []) if isinstance(s, dict)}
    from .core import validate_capabilities_and_router
    errs = validate_capabilities_and_router(
        capabilities,
        router_rows,
        plugin_slug=manifest.get("plugin", {}).get("slug"),
        allow_empty=allows_empty_catalog(delivery_doc, capabilities, source_ids),
    )
    from .entries import load_entries, validate_entries
    entries_doc = load_entries(project_root)
    if entries_doc is not None:
        errs += validate_entries(entries_doc, capabilities, manifest.get("plugin", {}))
    if delivery_doc is None:
        errs += unregistered_active_hooks(capabilities)
    else:
        errs += validate_delivery(delivery_doc, capabilities, source_ids)
    # Without the repository only plain intake-only paths can be checked here; the build checks every match.
    from .factory import _helper_name, unpackaged_reference_errors
    for src in manifest.get("sources", []):
        if isinstance(src, dict) and isinstance(src.get("intake_only_paths"), list):
            plain = [_helper_name(src.get("id", ""), p) for p in src["intake_only_paths"]
                     if isinstance(p, str) and not any(char in p for char in "*?[")]
            errs += unpackaged_reference_errors(capabilities, src.get("id", ""), plain)
    if errs:
        for e in errs:
            print(e, file=sys.stderr)
        return 1
    print("OK: capabilities and ROUTER.md valid")
    return 0


def _run_build(manifest_path: Path, project_root: Path, out: Path | None, host_roots: list[Path]) -> int:
    try:
        dist = build_release(manifest_path, project_root, out.resolve() if out else project_root / "dist",
                             host_roots=host_roots)
        print(f"Built {dist}")
        return 0
    except Exception as e:
        print(f"Build failed: {e}", file=sys.stderr)
        return 1


def _run_eval(project_root: Path, prepare: bool, decisions: Path | None) -> int:
    from .evals import prepare_eval, score_eval
    try:
        if prepare:
            print(prepare_eval(project_root, project_root / ".muro" / "factory" / "eval"))
            return 0
        report = score_eval(project_root, decisions.resolve())
    except (OSError, ValueError) as e:
        print(f"Eval failed: {e}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] == report["total"] else 1


def _run_intake(manifest: dict, project_root: Path, source_id: str) -> int:
    source = next((s for s in manifest.get("sources", []) if s.get("id") == source_id), None)
    if not source:
        print(f"Unknown source: {source_id}", file=sys.stderr)
        return 1
    try:
        result = prepare_intake(source, project_root, project_root / ".muro" / "factory" / "intake")
        print(result)
        return 0
    except (OSError, ValueError) as e:
        print(f"Intake preparation failed: {e}", file=sys.stderr)
        return 1


def _run_harmonize(project_root: Path) -> int:
    try:
        print(harmonize_prompt(project_root, project_root / ".muro" / "factory" / "harmonization"))
        return 0
    except (OSError, ValueError) as e:
        print(f"Harmonization preparation failed: {e}", file=sys.stderr)
        return 1


def _run_review(project_root: Path) -> int:
    try:
        print(review_prompt(project_root, project_root / ".muro" / "factory" / "review"))
        return 0
    except (OSError, ValueError) as e:
        print(f"Review preparation failed: {e}", file=sys.stderr)
        return 1


def _run_baseline(manifest: dict, project_root: Path, as_json: bool) -> int:
    from .baseline import baseline_report, render_json, render_text
    rows = baseline_report(manifest, project_root)
    print(render_json(rows) if as_json else render_text(rows))
    return 0 if all(row["status"] in {"current", "frozen"} for row in rows) else 1


def _run_init(directory: Path, repo_url: str, *, slug: str | None, license_name: str,
              goal: str, selected: list[str], release: str | None, head: bool) -> int:
    from .scaffold import scaffold_package
    try:
        print(scaffold_package(directory, repo_url, slug=slug, license_name=license_name,
                               goal=goal, selected=selected, release=release, head=head))
        return 0
    except (OSError, ValueError) as e:
        print(f"Init failed: {e}", file=sys.stderr)
        return 1


def _run_install(adapter_dir: Path, harness: str, home: Path) -> int:
    from .installer import install_adapter
    try:
        for line in install_adapter(adapter_dir, harness, home):
            print(line)
        return 0
    except (OSError, ValueError) as e:
        print(f"Install failed: {e}", file=sys.stderr)
        return 1


def _run_marketplace(repository: Path, folder: str) -> int:
    from .adapters import write_repository_marketplaces
    try:
        for path in write_repository_marketplaces(repository, folder):
            print(f"Wrote {path}")
        return 0
    except (OSError, ValueError) as e:
        print(f"marketplace failed: {e}", file=sys.stderr)
        return 1


def _run_license_check(folder: Path) -> int:
    """`muro license-check FOLDER`: the license files of a folder, as JSON; the bare reason on stderr when none."""
    if not folder.is_dir():
        print(f"folder not found: {folder}", file=sys.stderr)
        return 1
    licenses = licenses_in(folder)
    if not licenses:
        print("no file in the source is the complete MIT or Apache-2.0 text the factory accepts", file=sys.stderr)
        return 1
    _print_json({"licenses": licenses})
    return 0


def _run_project(args: argparse.Namespace) -> int:
    """`muro project pack|unpack|info|verify|new|edit|commit`: the `.mp` file (muro/project.py, muro/project_work.py)."""
    from . import project
    try:
        if args.project_command == "pack":
            loaded = _read_manifest(args.manifest)
            if loaded is None:
                return 1
            _manifest, _manifest_path, project_root = loaded
            print(project.pack(project_root, args.out, sources_cache=args.sources_cache,
                               release_dir=args.release))
        elif args.project_command == "unpack":
            print(project.unpack(args.mp, args.out))
        elif args.project_command == "verify":
            project.verify(args.mp, args.cache or project.default_cache_root())
            _print_json({"verified": True})
        elif args.project_command in _WRITE_COMMANDS:
            return _run_project_write(args)
        else:
            read = project.summary if args.summary else project.info
            print(json.dumps(read(args.mp, args.cache or project.default_cache_root()),
                             ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError) as e:
        print(f"Project {args.project_command} failed: {e}", file=sys.stderr)
        return 1


_WRITE_COMMANDS = ("new", "edit", "commit")


def _repository_args(args: argparse.Namespace):
    """The `repository` an edit or a new project asks for: kept (no option), taken away, or set."""
    from . import project_work
    if getattr(args, "no_repository", False):
        if args.repository:
            raise ValueError("--repository and --no-repository exclude each other")
        return None
    if args.repository:
        return project_work.repository(args.repository, args.branch, args.tag_prefix)
    if args.branch is not None or args.tag_prefix is not None:
        raise ValueError("--branch and --tag-prefix need --repository")
    return project_work._KEEP


def _run_project_write(args: argparse.Namespace) -> int:
    """`muro project new|edit|commit`: writing a project (muro/project_work.py)."""
    from . import project_work
    if args.project_command == "new":
        repo = _repository_args(args)
        print(project_work.new_workspace(args.folder, name=args.name, slug=args.slug, author=args.author,
                                         repo=None if repo is project_work._KEEP else repo, version=args.version))
        return 0
    if args.project_command == "edit":
        changes = {}
        for key in ("name", "author"):
            if getattr(args, key) is not None:
                changes[key] = getattr(args, key)
        repo = _repository_args(args)
        if repo is not project_work._KEEP:
            changes["repo"] = repo
        if args.records is not None:
            document = _read_json_file(args.records, "records")
            changes["records"] = document.get("records") if isinstance(document, dict) else document
        if args.changelog is not None:
            changes["changelog"] = Path(args.changelog).read_text(encoding="utf-8")
        _print_json(project_work.edit(args.mp, expect_digest=args.expect_digest, **changes))
        return 0
    summary = Path(args.summary).read_text(encoding="utf-8") if args.summary else ""
    try:
        _print_json(project_work.commit(args.folder, args.out, expect_digest=args.expect_digest, create=args.create,
                                        step=args.step, operation=args.operation, summary=summary,
                                        engine=args.engine, budget_usd=args.budget))
    except (KeyError, TypeError, AttributeError) as e:      # a package the AI wrote in a shape the build cannot read
        raise ValueError(f"the package cannot be built: {type(e).__name__}: {e}") from None
    return 0


_SIMULATE_COMMANDS = ("simulate", "simulate-prepare", "simulate-check")


def _simulation_package(mp: Path | None, manifest: Path | None, cache: Path | None) -> Path | None:
    """The package folder a simulation reads: a `.mp` unpacked once through the cache, or a manifest's folder.

    None when the manifest is missing (already reported, like every command that reads one).
    """
    if mp is not None and manifest is not None:
        raise ValueError("name a project file or a manifest, not both")
    if mp is not None:
        from . import project
        return project.cached(Path(mp), Path(cache) if cache else project.default_cache_root())
    loaded = _read_manifest(Path(manifest) if manifest else Path("sources.json"))
    return loaded[2] if loaded else None


def _print_json(document: dict) -> None:
    print(json.dumps(document, ensure_ascii=False, indent=2))


def _run_simulate_prepare(mp: Path | None, manifest: Path | None, cache: Path | None, task: str, stack: list) -> int:
    """What the classifier needs for one request (muro/simulate.py `prepare`), as JSON."""
    from .simulate import prepare
    package = _simulation_package(mp, manifest, cache)
    if package is None:
        return 1
    _print_json(prepare(package, task, stack))
    return 0


def _run_simulate_check(mp: Path | None, manifest: Path | None, cache: Path | None, context, answer) -> int:
    """The AI's answer validated as a runtime decision (`check`), as JSON. An invalid answer is a result: exit 0."""
    from .simulate import check
    package = _simulation_package(mp, manifest, cache)
    if package is None:
        return 1
    _print_json(check(package, context, answer))
    return 0


def _run_simulate(mp: Path | None, manifest: Path | None, cache: Path | None, task: str, stack: list,
                  api_base: str, model: str, api_key_env: str | None) -> int:
    """One request through an OpenAI-compatible endpoint (`simulate_api`), as JSON."""
    from .simulate import simulate_api
    package = _simulation_package(mp, manifest, cache)
    if package is None:
        return 1
    _print_json(simulate_api(package, task, stack, api_base=api_base, model=model, api_key_env=api_key_env))
    return 0


def _read_json_file(path: Path, what: str):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"the {what} file is not valid JSON: {e}") from None


def _run_simulation(args: argparse.Namespace) -> int:
    """`muro project simulate|simulate-prepare|simulate-check`: the simulator (muro/simulate.py)."""
    try:
        if args.project_command == "simulate-prepare":
            return _run_simulate_prepare(args.mp, args.manifest, args.cache, args.task, args.stack)
        if args.project_command == "simulate-check":
            return _run_simulate_check(args.mp, args.manifest, args.cache,
                                       _read_json_file(args.context, "context"), _read_json_file(args.answer, "answer"))
        return _run_simulate(args.mp, args.manifest, args.cache, args.task, args.stack,
                             args.api_base, args.model, args.api_key_env)
    except (OSError, ValueError) as e:
        print(f"Simulation failed: {e}", file=sys.stderr)
        return 1


def _captured(fn) -> tuple[int, str]:
    """Run a command function with stdout/stderr captured; errors become (1, text).

    The one capture helper for the CLI and the MCP server. The exception net
    matters: an agent repair round feeds the returned text back to the model,
    so a parse error must come back as a report, never as a crash.
    """
    import io
    from contextlib import redirect_stderr, redirect_stdout
    buffer = io.StringIO()
    with redirect_stdout(buffer), redirect_stderr(buffer):
        try:
            code = fn()
        except (OSError, ValueError) as exc:
            print(exc, file=sys.stderr)
            code = 1
    return code, buffer.getvalue().strip()


def _intake_check(manifest: dict, project_root: Path) -> tuple[int, str]:
    """Shape check after an API intake: the written artifacts must parse.

    The full catalog validation belongs after harmonization, when ROUTER.md exists.
    """
    errs: list[str] = []
    capabilities: list = []
    try:
        capabilities = _load_capabilities(project_root / "capabilities")
    except (OSError, ValueError) as e:
        errs.append(str(e))
    from .delivery import load_delivery, validate_delivery
    try:
        document = load_delivery(project_root)
        if document is not None:
            source_ids = {s.get("id") for s in manifest.get("sources", []) if isinstance(s, dict)}
            errs += validate_delivery(document, capabilities, source_ids)
    except (OSError, ValueError) as e:
        errs.append(str(e))
    return (1, "\n".join(errs)) if errs else (0, "OK: intake artifacts parse")


def _run_agent(step: str, source_id: str | None, manifest: dict, project_root: Path,
               api_base: str, model: str, api_key_env: str | None, rounds: int) -> int:
    from .agent import read_api_key, run_step
    try:
        api_key = read_api_key(api_key_env)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    if step == "intake":
        validate = lambda: _intake_check(manifest, project_root)
    else:
        validate = lambda: _captured(lambda: _run_validate(manifest, project_root))
    try:
        return run_step(step, source_id, manifest, project_root,
                        api_base, model, api_key, rounds, validate)
    except (OSError, ValueError) as e:
        print(f"Agent step failed: {e}", file=sys.stderr)
        return 1


def _run_absorb(directory: Path, repo_url: str, *, slug: str | None, license_name: str,
                goal: str, selected: list[str], release: str | None, head: bool,
                harness: str | None, home: Path | None,
                api_base: str, model: str, api_key_env: str | None, rounds: int,
                out: Path | None) -> int:
    """init -> agent intake -> agent harmonize -> validate -> build [-> install]."""
    if _run_init(directory, repo_url, slug=slug, license_name=license_name, goal=goal,
                 selected=selected, release=release, head=head) != 0:
        return 1
    loaded = _read_manifest(directory / "sources.json")
    if loaded is None:
        return 1
    manifest, manifest_path, project_root = loaded
    source_id = manifest["sources"][0]["id"]
    for step, sid in (("intake", source_id), ("harmonize", None)):
        print(f"== agent {step} ==")
        if _run_agent(step, sid, manifest, project_root, api_base, model, api_key_env, rounds) != 0:
            return 1
    # The harmonize step only returns 0 after the full validation passed; build re-checks anyway.
    if _run_build(manifest_path, project_root, out, []) != 0:
        return 1
    if harness is None or home is None:
        print("built; no --harness/--home given, so nothing was installed")
        return 0
    slug_built = manifest["plugin"]["slug"]
    dist = (out.resolve() if out else project_root / "dist") / slug_built
    return _run_install(dist / "adapters" / harness, harness, home)


# --- Legacy flag interface (muro_build.py) -----------------------------------

_LEGACY_ACTIONS = {"--check-sources", "--validate", "--build", "--prepare-eval",
                   "--score-eval", "--prepare-intake", "--harmonize"}


def _legacy_main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="muro_build")
    parser.add_argument("--manifest", type=Path, default=Path("sources.json"))
    parser.add_argument("--check-sources", action="store_true", help="Validate sources and exit")
    parser.add_argument("--offline-pins", action="store_true", help="With --check-sources: validate manifest pins and local repos without remote HTTPS fetches")
    parser.add_argument("--build", action="store_true", help="Build release into dist/<slug>/")
    parser.add_argument("--out", type=Path, help="With --build: stage the release under this folder instead of dist/")
    parser.add_argument("--prepare-eval", action="store_true", help="Prepare the routing eval prompt and cases for the host AI")
    parser.add_argument("--score-eval", type=Path, metavar="DECISIONS", help="Score the host AI's eval decisions against eval-cases.json")
    parser.add_argument("--validate", action="store_true", help="Validate capabilities and ROUTER.md")
    parser.add_argument("--prepare-intake", metavar="SOURCE_ID", help="Export verified source and source-specific prompt")
    parser.add_argument("--harmonize", action="store_true", help="Prepare the harmonization prompt for an agent")
    parser.add_argument("--host-root", type=Path, action="append", default=[], help="Explicit host/plugin directory to check for identity collisions")
    args = parser.parse_args(argv)

    loaded = _read_manifest(args.manifest)
    if loaded is None:
        return 1
    manifest, manifest_path, project_root = loaded

    if args.check_sources:
        return _run_check_sources(manifest, project_root, args.offline_pins)
    if args.validate:
        return _run_validate(manifest, project_root)
    if args.build:
        return _run_build(manifest_path, project_root, args.out, args.host_root)
    if args.prepare_eval or args.score_eval:
        return _run_eval(project_root, args.prepare_eval, args.score_eval)
    if args.prepare_intake:
        return _run_intake(manifest, project_root, args.prepare_intake)
    if args.harmonize:
        return _run_harmonize(project_root)

    parser.print_help()
    return 0


# --- Subcommand interface (muro, python -m muro) ------------------------------

def _modern_main(argv: list[str]) -> int:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--manifest", type=Path, default=Path("sources.json"),
                        help="Package manifest (default: sources.json)")

    parser = argparse.ArgumentParser(
        prog="muro",
        description="Muro factory CLI. Preparation commands bundle evidence and prompts for "
                    "the host AI and never call an LLM themselves; `mcp` serves them to an MCP "
                    "host (Claude Code, Codex), and `agent`/`absorb` run the same AI-owned steps "
                    "through an OpenAI-compatible endpoint. Python validates; it never classifies.",
        epilog="The legacy flag interface (muro_build.py --validate ...) keeps working.")
    sub = parser.add_subparsers(dest="command", metavar="command")

    sub.add_parser("validate", parents=[common],
                   help="Validate capabilities, ROUTER.md, entries and delivery")
    p = sub.add_parser("check-sources", parents=[common],
                       help="Verify pinned sources, licenses and plugin identity")
    p.add_argument("--offline-pins", action="store_true",
                   help="Validate manifest pins and local repos without remote HTTPS fetches")
    p = sub.add_parser("build", parents=[common], help="Build a release")
    p.add_argument("--out", type=Path, help="Stage the release under this folder instead of dist/")
    p.add_argument("--host-root", type=Path, action="append", default=[],
                   help="Explicit host/plugin directory to check for identity collisions")
    p = sub.add_parser("intake", parents=[common],
                       help="Prepare a source's intake workbench for the host AI")
    p.add_argument("source_id", help="A source id from the manifest")
    sub.add_parser("harmonize", parents=[common],
                   help="Prepare the harmonization prompt for the host AI")
    sub.add_parser("review", parents=[common],
                   help="Prepare the decisions-review prompt for the host AI")
    p = sub.add_parser("baseline", parents=[common],
                       help="Report each source's pin against its upstream (read-only; "
                            "exit 1 when a source is behind, unknown or in error)")
    p.add_argument("--json", action="store_true", help="Machine-readable report")
    p = sub.add_parser("init", help="Scaffold a single-source package from a repository link "
                                    "(pin resolved upstream, license gate verified)")
    p.add_argument("repo_url", help="Git URL (or local path) of the skill/plugin to absorb")
    p.add_argument("directory", type=Path, help="New package directory (sources.json is written there)")
    p.add_argument("--slug", help="Package slug (default: derived from the repository name)")
    p.add_argument("--license", required=True, dest="license_name",
                   help="MIT or Apache-2.0, as the source's LICENSE says; the gate verifies it")
    p.add_argument("--goal", required=True, help="The source-specific intake goal")
    p.add_argument("--select", action="append", default=[], metavar="PATH",
                   help="Selected path/pattern (repeatable; the selection is curated, not implicit)")
    p.add_argument("--release", help="Pin this published tag (default: the newest non-prerelease tag)")
    p.add_argument("--head", action="store_true", help="Pin the upstream HEAD (for an upstream without releases)")
    p = sub.add_parser("install", help="Install a built adapter into a harness home, "
                                       "with the host's own command or config edit")
    p.add_argument("adapter_dir", type=Path, help="A built release's adapters/<harness> directory")
    p.add_argument("--harness", required=True, choices=("claude-code", "codex", "opencode", "pi"))
    p.add_argument("--home", required=True, type=Path,
                   help="The harness home to install into (e.g. resolved through Mukade's scan)")
    p = sub.add_parser("marketplace", help="Write the Claude Code and Codex marketplaces at the root of a repository "
                                           "that publishes a built release in a subfolder")
    p.add_argument("repository", type=Path, help="The repository's folder")
    p.add_argument("folder", help="The release's folder inside it (holds adapters/<harness>), e.g. marionette")
    p = sub.add_parser("license-check", help="List the files of a folder that are the complete MIT or Apache-2.0 text "
                                             "(a preflight, not the license gate; exit 1 when there is none)")
    p.add_argument("folder", type=Path, help="The folder to search, e.g. a source's repository root")
    p = sub.add_parser("mcp", parents=[common],
                       help="Serve the factory as an MCP stdio server, for Claude Code, Codex or any MCP client")
    p.add_argument("--tools", metavar="NAME[,NAME...]",
                   help="Serve only these tools (listed and callable; a name the server does not have is refused "
                        "at start). Without it every tool is served: give a host agent only what its job needs")
    p = sub.add_parser("agent", parents=[common],
                       help="Run an AI-owned step through an OpenAI-compatible endpoint "
                            "(key from an environment variable, never an argument)")
    p.add_argument("step", choices=("intake", "harmonize", "review"))
    p.add_argument("source_id", nargs="?", help="With intake: the source id from the manifest")
    p.add_argument("--api-base", default="https://api.openai.com/v1",
                   help="OpenAI-compatible base URL (default: https://api.openai.com/v1)")
    p.add_argument("--model", required=True, help="Model id the endpoint serves")
    p.add_argument("--api-key-env", default=None,
                   help="Environment variable holding the key (default: MURO_API_KEY, then OPENAI_API_KEY)")
    p.add_argument("--rounds", type=int, default=2, help="Attempts, with rejected answers fed back (default 2)")
    p = sub.add_parser("absorb", help="init + agent intake + agent harmonize + validate + build "
                                      "[+ install], in one command")
    p.add_argument("repo_url")
    p.add_argument("directory", type=Path)
    p.add_argument("--slug")
    p.add_argument("--license", required=True, dest="license_name")
    p.add_argument("--goal", required=True)
    p.add_argument("--select", action="append", default=[], metavar="PATH")
    p.add_argument("--release")
    p.add_argument("--head", action="store_true")
    p.add_argument("--api-base", default="https://api.openai.com/v1")
    p.add_argument("--model", required=True)
    p.add_argument("--api-key-env", default=None)
    p.add_argument("--rounds", type=int, default=2)
    p.add_argument("--harness", choices=("claude-code", "codex", "opencode", "pi"),
                   help="With --home: install the built adapter there")
    p.add_argument("--home", type=Path)
    p.add_argument("--out", type=Path, help="Stage the release under this folder instead of dist/")
    p = sub.add_parser("eval", help="Routing eval for the host AI")
    eval_sub = p.add_subparsers(dest="eval_command", metavar="prepare|score", required=True)
    eval_sub.add_parser("prepare", parents=[common],
                        help="Prepare the eval prompt and cases, without the expectations")
    p = eval_sub.add_parser("score", parents=[common],
                            help="Score the host AI's decisions against eval-cases.json")
    p.add_argument("decisions", type=Path, help="The host AI's decisions JSON")
    p = sub.add_parser("project", help="The .mp project file: one zip with a package, its inputs and its release")
    project_sub = p.add_subparsers(dest="project_command", required=True,
                                   metavar="pack|unpack|info|verify|new|edit|commit|simulate|simulate-prepare|simulate-check")
    p = project_sub.add_parser("pack", parents=[common],
                               help="Pack a package, its sources at their pins and a built release into a .mp")
    p.add_argument("--out", type=Path, required=True, help="The .mp file to write")
    p.add_argument("--sources-cache", type=Path, metavar="DIR",
                   help="Folder keeping each source's files per id and commit: read first, filled after a fetch")
    p.add_argument("--release", type=Path, metavar="DIR",
                   help="The --out folder of a build (<DIR>/<slug>/...); without it the file carries no release")
    p = project_sub.add_parser("unpack", help="Unpack a .mp into a new folder (refuses unsafe members and limits)")
    p.add_argument("mp", type=Path, help="The .mp file")
    p.add_argument("--out", type=Path, required=True, help="A new folder")
    p = project_sub.add_parser("info", help="Print what a .mp holds, as JSON (unpacked once per file content)")
    p.add_argument("mp", type=Path, help="The .mp file")
    p.add_argument("--summary", action="store_true",
                   help="Only the identity, the counts and the digest; a missing or invalid file is "
                        "an \"error\" in the JSON, with exit 0")
    p.add_argument("--cache", type=Path, metavar="DIR",
                   help="Where unpacked projects are kept (default: a per-user cache folder)")
    p = project_sub.add_parser("verify", help="Check that the plugin a .mp carries was built from the package it "
                                              "carries (release slug, version and capability ids); exit 1 when not")
    p.add_argument("mp", type=Path, help="The .mp file")
    p.add_argument("--cache", type=Path, metavar="DIR",
                   help="Where unpacked projects are kept (default: a per-user cache folder)")
    # Writing a project: Python packs, records and guards; the package's meaning is the host AI's.
    repo_options = argparse.ArgumentParser(add_help=False)
    repo_options.add_argument("--repository", metavar="URL", help="The https address of the Git repository the project follows")
    repo_options.add_argument("--branch", help="Its branch (default: main)")
    repo_options.add_argument("--tag-prefix", help="The prefix of its release tags, such as my-plugin-v")
    p = project_sub.add_parser("new", parents=[repo_options],
                               help="Start a new project in a new folder: project.json and empty records, history "
                                    "and changelog; the host AI writes the package")
    p.add_argument("folder", type=Path, help="A new or empty folder")
    p.add_argument("--name", required=True, help="The project's name")
    p.add_argument("--slug", required=True, help="The plugin id, kebab-case")
    p.add_argument("--author", required=True, help="Who owns the project")
    p.add_argument("--version", default="0.1.0", help="The first version (default 0.1.0)")
    p = project_sub.add_parser("edit", parents=[repo_options],
                               help="Change a project's name, author, repository, records or changelog, offline, "
                                    "while the file still has the digest it was read with")
    p.add_argument("mp", type=Path, help="The .mp file")
    p.add_argument("--expect-digest", required=True, metavar="SHA256", help="The digest the file was read with")
    p.add_argument("--name", help="The project's new name")
    p.add_argument("--author", help="The project's new author")
    p.add_argument("--no-repository", action="store_true", help="The project follows no repository any more")
    p.add_argument("--records", type=Path, metavar="FILE", help="A JSON file with every record ({records: [...]})")
    p.add_argument("--changelog", type=Path, metavar="FILE", help="The new text of CHANGELOG.md")
    p = project_sub.add_parser("commit", help="Build a changed project, record the run and write its .mp file")
    p.add_argument("folder", type=Path, help="The work folder: an unpacked project the host AI changed, or a new one")
    p.add_argument("--out", type=Path, required=True, help="The .mp file to write")
    which = p.add_mutually_exclusive_group(required=True)
    which.add_argument("--expect-digest", metavar="SHA256", help="The digest of the file the folder was unpacked from")
    which.add_argument("--create", action="store_true", help="A new project: refuse to overwrite a file")
    p.add_argument("--operation", required=True, help="What the run did, in a few words")
    p.add_argument("--step", choices=("patch", "minor", "major", "none"), default="patch",
                   help="How the version moves from the file's (default patch; a new project keeps its own)")
    p.add_argument("--summary", type=Path, metavar="FILE", help="The AI's changelog text for this version")
    p.add_argument("--engine", help="The agent that ran it, for the history")
    p.add_argument("--budget", type=float, help="Its budget in USD, for the history")
    # The simulator: the AI decides which capabilities a request activates; Python prepares and validates.
    where = argparse.ArgumentParser(add_help=False)
    where.add_argument("mp", nargs="?", type=Path, help="The .mp file (or name --manifest instead)")
    where.add_argument("--manifest", type=Path, help="A package's sources.json, instead of a .mp file")
    where.add_argument("--cache", type=Path, metavar="DIR",
                       help="Where unpacked projects are kept (default: a per-user cache folder)")
    request = argparse.ArgumentParser(add_help=False)
    request.add_argument("--task", required=True, help="The request to simulate")
    request.add_argument("--stack", action="append", default=[], metavar="TOKEN",
                         help="A stack:* constraint token the request carries (repeatable)")
    p = project_sub.add_parser("simulate-prepare", parents=[where, request],
                               help="Print, as JSON, what a classifier needs for one request: its context and prompt")
    p = project_sub.add_parser("simulate-check", parents=[where],
                               help="Validate an AI answer as the runtime validates a decision and print its steps as JSON")
    p.add_argument("--context", type=Path, required=True, help="The context simulate-prepare printed (JSON file)")
    p.add_argument("--answer", type=Path, required=True, help="The AI's classification (JSON file)")
    p = project_sub.add_parser("simulate", parents=[where, request],
                               help="Ask an OpenAI-compatible endpoint which capabilities a request activates, "
                                    "validate the answer and print the steps as JSON")
    p.add_argument("--model", required=True, help="Model id the endpoint serves")
    p.add_argument("--api-base", default="https://api.openai.com/v1",
                   help="OpenAI-compatible base URL (default: https://api.openai.com/v1)")
    p.add_argument("--api-key-env", default=None,
                   help="Environment variable holding the key (default: MURO_API_KEY, then OPENAI_API_KEY)")

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 0
    if args.command == "project":
        return _run_simulation(args) if args.project_command in _SIMULATE_COMMANDS else _run_project(args)

    if args.command == "init":
        return _run_init(args.directory, args.repo_url, slug=args.slug,
                         license_name=args.license_name, goal=args.goal, selected=args.select,
                         release=args.release, head=args.head)
    if args.command == "install":
        return _run_install(args.adapter_dir, args.harness, args.home)
    if args.command == "marketplace":
        return _run_marketplace(args.repository, args.folder)
    if args.command == "license-check":
        return _run_license_check(args.folder)
    if args.command == "absorb":
        return _run_absorb(args.directory, args.repo_url, slug=args.slug,
                           license_name=args.license_name, goal=args.goal, selected=args.select,
                           release=args.release, head=args.head,
                           harness=args.harness, home=args.home,
                           api_base=args.api_base, model=args.model,
                           api_key_env=args.api_key_env, rounds=args.rounds, out=args.out)
    if args.command == "mcp":
        from .mcp import parse_tools, serve
        try:
            tools = None if args.tools is None else parse_tools(args.tools)
        except ValueError as e:
            print(f"mcp failed: {e}", file=sys.stderr)
            return 1
        return serve(args.manifest, tools)

    loaded = _read_manifest(args.manifest)
    if loaded is None:
        return 1
    manifest, manifest_path, project_root = loaded

    if args.command == "validate":
        return _run_validate(manifest, project_root)
    if args.command == "check-sources":
        return _run_check_sources(manifest, project_root, args.offline_pins)
    if args.command == "build":
        return _run_build(manifest_path, project_root, args.out, args.host_root)
    if args.command == "intake":
        return _run_intake(manifest, project_root, args.source_id)
    if args.command == "harmonize":
        return _run_harmonize(project_root)
    if args.command == "review":
        return _run_review(project_root)
    if args.command == "baseline":
        return _run_baseline(manifest, project_root, args.json)
    if args.command == "agent":
        return _run_agent(args.step, args.source_id, manifest, project_root,
                          args.api_base, args.model, args.api_key_env, args.rounds)
    if args.command == "eval":
        if args.eval_command == "prepare":
            return _run_eval(project_root, True, None)
        return _run_eval(project_root, False, args.decisions)
    parser.print_help()
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:]) if argv is None else list(argv)
    if any(arg.split("=", 1)[0] in _LEGACY_ACTIONS for arg in argv):
        return _legacy_main(argv)
    return _modern_main(argv)


if __name__ == "__main__":
    sys.exit(main())
