"""Tests for Muro's factory validator and packager (muro_build.py)."""
from pathlib import Path

import pytest

from muro_build import (
    validate_plugin_identity,
    check_sources,
    parse_capability,
    validate_capabilities_and_router,
    resolve_plan,
    build_release,
)

ROOT = Path(__file__).resolve().parent.parent


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


def test_legacy_build_export_rejects_role_and_intent_token_routing():
    rows = [
        {"id": "visual-direction", "role": "art-direction", "when": "intent:ui", "after": [], "outputs": ["palette", "layout"]},
        {"id": "motion-principles", "role": "motion-spec", "when": "intent:animation", "after": ["visual-direction"], "outputs": ["motion-spec", "reduced-motion"]},
        {"id": "gsap-scrolltrigger", "role": "scroll-code", "when": "stack:gsap", "after": ["motion-principles"], "outputs": ["code-patch"]},
        {"id": "css-scroll", "role": "scroll-code", "when": "stack:css-only", "after": ["motion-principles"], "outputs": ["code-patch"]},
    ]
    with pytest.raises(ValueError, match="host AI classification"):
        resolve_plan(rows, ["scroll-code"], {"intent:ui", "intent:animation", "stack:gsap"}, set())


def test_repository_capabilities_and_router_are_valid():
    errors = validate_capabilities_and_router(ROOT / "capabilities", ROOT / "ROUTER.md")
    assert errors == []


def test_build_release_emits_branded_package_and_notices(tmp_path: Path, portable_project: Path):
    dist_dir = build_release(portable_project / "sources.json", portable_project, tmp_path / "dist")
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
