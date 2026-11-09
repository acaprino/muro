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
    parser.add_argument("--build", action="store_true", help="Build release into dist/<slug>/")
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
        errs += check_sources(manifest, project_root)
        if errs:
            for e in errs:
                print(e, file=sys.stderr)
            return 1
        print("OK: all sources and plugin identity valid")
        return 0

    if args.validate:
        cap_dir = project_root / "capabilities"
        router_path = project_root / "ROUTER.md"
        capabilities = _load_capabilities(cap_dir)
        router_rows = _load_router(router_path)
        from .core import validate_capabilities_and_router
        errs = validate_capabilities_and_router(capabilities, router_rows)
        if errs:
            for e in errs:
                print(e, file=sys.stderr)
            return 1
        print("OK: capabilities and ROUTER.md valid")
        return 0

    if args.build:
        try:
            dist = build_release(manifest_path, project_root, project_root / "dist", host_roots=args.host_root)
            print(f"Built {dist}")
            return 0
        except Exception as e:
            print(f"Build failed: {e}", file=sys.stderr)
            return 1

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
