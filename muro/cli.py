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
from .sources import check_sources
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


def _captured(fn) -> tuple[int, str]:
    import io
    from contextlib import redirect_stderr, redirect_stdout
    buffer = io.StringIO()
    with redirect_stdout(buffer), redirect_stderr(buffer):
        code = fn()
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
    if _run_validate(manifest, project_root) != 0:
        return 1
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
    sub.add_parser("mcp", parents=[common],
                   help="Serve the factory as an MCP stdio server, for Claude Code, Codex or any MCP client")
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

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 0

    if args.command == "init":
        return _run_init(args.directory, args.repo_url, slug=args.slug,
                         license_name=args.license_name, goal=args.goal, selected=args.select,
                         release=args.release, head=args.head)
    if args.command == "install":
        return _run_install(args.adapter_dir, args.harness, args.home)
    if args.command == "absorb":
        return _run_absorb(args.directory, args.repo_url, slug=args.slug,
                           license_name=args.license_name, goal=args.goal, selected=args.select,
                           release=args.release, head=args.head,
                           harness=args.harness, home=args.home,
                           api_base=args.api_base, model=args.model,
                           api_key_env=args.api_key_env, rounds=args.rounds, out=args.out)
    if args.command == "mcp":
        from .mcp import serve
        return serve(args.manifest)

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
