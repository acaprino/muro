"""Tests for Muro's factory validator and packager (muro package)."""
from pathlib import Path

import pytest

from muro import (
    validate_plugin_identity,
    check_sources,
    parse_capability,
    validate_capabilities_and_router,
    resolve_plan,
    build_release,
    parse_capabilities,
    RouterRow,
)

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"  # the example plugin the factory builds


def test_validate_plugin_identity_rejects_reserved_and_non_kebab():
    assert validate_plugin_identity({"slug": "muro", "name": "Muro", "command": "muro", "version": "0.1.0"}) == []
    assert any("reserved" in e for e in validate_plugin_identity({"slug": "muro", "name": "Muro", "command": "review", "version": "0.1.0"}))
    assert any("slug" in e for e in validate_plugin_identity({"slug": "Bad Slug", "name": "Muro", "command": "muro", "version": "0.1.0"}))


def test_check_sources_accepts_pinned_mit_and_rejects_unlicensed_dir(tmp_path: Path):
    unlicensed = tmp_path / "design-taste-frontend"
    unlicensed.mkdir()
    (unlicensed / "SKILL.md").write_text("# skill", encoding="utf-8")
    manifest = {
        "plugin": {"slug": "muro", "name": "Muro", "command": "muro", "version": "0.1.0"},
        "sources": [{
            "id": "bad-local",
            "repo_path": str(unlicensed),
            "commit": "a" * 40, "pin": "head",
            "license": "MIT",
            "selected_paths": ["SKILL.md"],
            "excluded_paths": [],
            "runtime_deps": []
        }]
    }
    errors = check_sources(manifest, tmp_path)
    assert any("LICENSE" in e or "commit" in e for e in errors)


@pytest.mark.parametrize("candidate_count", [1, 2])
def test_legacy_role_resolver_requires_host_ai_even_with_compatible_candidates(candidate_count):
    rows = [
        RouterRow(id="first", role="analysis", when="—", after="—", outputs="report"),
        RouterRow(id="second", role="analysis", when="—", after="—", outputs="report"),
    ]
    with pytest.raises(ValueError, match="host AI classification"):
        resolve_plan(rows[:candidate_count], ["analysis"], set(), set())


def test_repository_capabilities_and_router_are_valid():
    from muro import parse_capability, validate_capabilities_and_router
    cap_dir = PACKAGE / "capabilities"
    router_path = PACKAGE / "ROUTER.md"
    capabilities = []
    for f in sorted(cap_dir.glob("*.md")):
        capabilities.append(parse_capability(f))
    # Parse ROUTER.md
    text = (PACKAGE / "ROUTER.md").read_text(encoding="utf-8")
    router_rows = []
    for ln in text.splitlines():
        ln = ln.strip()
        if ln.startswith("|") and ln.endswith("|"):
            parts = [p.strip() for p in ln.split("|")[1:-1]]
            if all(all(c in "- " for c in p) for p in parts):
                continue
            if parts and parts[0].lower() == "id":
                continue
            if len(parts) >= 5:
                router_rows.append(RouterRow(
                    id=parts[0], role=parts[1], when=parts[2],
                    after=parts[3], outputs=parts[4], intents=parts[5]
                ))
    errors = validate_capabilities_and_router(capabilities, router_rows)
    assert errors == []


def test_build_release_emits_branded_package_and_notices(tmp_path: Path, portable_project: Path):
    from muro import parse_capabilities, parse_router
    cap_dir = portable_project / "capabilities"
    router_path = portable_project / "ROUTER.md"
    capabilities = parse_capabilities(cap_dir)
    text = router_path.read_text(encoding="utf-8")
    router_rows = []
    for ln in text.splitlines():
        ln = ln.strip()
        if ln.startswith("|") and ln.endswith("|"):
            parts = [p.strip() for p in ln.split("|")[1:-1]]
            if all(all(c in "- " for c in p) for p in parts):
                continue
            if parts and parts[0].lower() == "id":
                continue
            if len(parts) >= 5:
                router_rows.append(RouterRow(
                    id=parts[0], role=parts[1], when=parts[2],
                    after=parts[3], outputs=parts[4], intents=parts[5]
                ))
    dist_dir = build_release(portable_project / "sources.json", portable_project, tmp_path / "dist", capabilities, router_rows)
    assert dist_dir == tmp_path / "dist" / "muro"
    assert (dist_dir / ".claude-plugin" / "plugin.json").is_file()
    assert (dist_dir / "ROUTER.md").is_file()
    notice = (dist_dir / "NOTICE.md").read_text(encoding="utf-8")
    assert "Copyright (c) 2026 Example" in notice
    assert "Modified and merged into Muro" in notice
    assert "Runtime Dependencies (Not Bundled)" in notice
    assert "gsap" in notice
    for host in ("codex", "pi", "opencode", "hermes"):
        assert (dist_dir / "adapters" / host / "skills" / "muro" / "SKILL.md").is_file()
