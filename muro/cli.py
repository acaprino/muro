# muro/cli.py
"""CLI entry point for muro_build."""
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
    validate_capabilities_and_router,
    Capability,
    RouterRow,
    parse_router,
)
from .sources import check_sources
from .release import build_release
from .factory import harmonize_prompt, prepare_intake


def _load_capabilities(cap_dir: Path) -> list:
    """Load all capabilities from directory."""
    capabilities = []
    for f in sorted(cap_dir.glob("*.md")):
        capabilities.append(parse_capability(f))
    return capabilities


def _load_router(router_path: Path) -> list:
    """Parse ROUTER.md table into RouterRow objects."""
    return parse_router(router_path)


def main() -> int:
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
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    project_root = manifest_path.parent

    if args.check_sources:
        errs = validate_plugin_identity(manifest.get("plugin", {}))
        errs += check_sources(manifest, project_root, offline_pins=args.offline_pins)
        if errs:
            for e in errs:
                print(e, file=sys.stderr)
            return 1
        skipped = args.offline_pins and any(
            isinstance(s, dict) and isinstance(s.get("repo_url"), str) and s["repo_url"].startswith("https://")
            for s in manifest.get("sources", [])
        )
        if skipped:
            print("OK: manifest pins and local sources valid; skipped remote fetch (--offline-pins)")
        else:
            print("OK: all sources and plugin identity valid")
        return 0

    if args.validate:
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

    if args.build:
        try:
            dist = build_release(manifest_path, project_root, args.out.resolve() if args.out else project_root / "dist",
                                 host_roots=args.host_root)
            print(f"Built {dist}")
            return 0
        except Exception as e:
            print(f"Build failed: {e}", file=sys.stderr)
            return 1

    if args.prepare_eval or args.score_eval:
        from .evals import prepare_eval, score_eval
        try:
            if args.prepare_eval:
                print(prepare_eval(project_root, project_root / ".muro" / "factory" / "eval"))
                return 0
            report = score_eval(project_root, args.score_eval.resolve())
        except (OSError, ValueError) as e:
            print(f"Eval failed: {e}", file=sys.stderr)
            return 1
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["passed"] == report["total"] else 1

    if args.prepare_intake:
        source = next((s for s in manifest.get("sources", []) if s.get("id") == args.prepare_intake), None)
        if not source:
            print(f"Unknown source: {args.prepare_intake}", file=sys.stderr)
            return 1
        try:
            result = prepare_intake(source, project_root, project_root / ".muro" / "factory" / "intake")
            print(result)
            return 0
        except (OSError, ValueError) as e:
            print(f"Intake preparation failed: {e}", file=sys.stderr)
            return 1

    if args.harmonize:
        try:
            print(harmonize_prompt(project_root, project_root / ".muro" / "factory" / "harmonization"))
            return 0
        except (OSError, ValueError) as e:
            print(f"Harmonization preparation failed: {e}", file=sys.stderr)
            return 1

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
