"""Integration contract for UI UX Pro Max local design search."""
import json
from pathlib import Path

from muro import check_sources, parse_capabilities, parse_router

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"  # the example plugin the factory builds


def test_ui_ux_pro_max_manifest_is_mit_and_scoped():
    manifest = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    src = next(s for s in manifest["sources"] if s["id"] == "ui-ux-pro-max")
    assert src["commit"] == "a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5"
    assert src["license"] == "MIT"
    assert src["copyright"] == "Copyright (c) 2024 Next Level Builder"
    assert "src/ui-ux-pro-max/scripts/search.py" in src["selected_paths"]
    assert "src/ui-ux-pro-max/scripts/core.py" in src["selected_paths"]
    assert "src/ui-ux-pro-max/scripts/design_system.py" in src["selected_paths"]
    assert "src/ui-ux-pro-max/data/**" in src["selected_paths"]
    assert src["intake"]["goal"]


def test_design_guidance_contains_bounded_local_search():
    caps = {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}
    guidance = caps["design-guidance"]
    assert guidance.outputs == ["design_candidates", "stack_guidance"]
    assert "<package_root>/scripts/ui-ux-pro-max/scripts/search.py" in guidance.body
    assert "--design-system" in guidance.body
    assert "`--force` needs the user's explicit authorization" in guidance.body
    assert "ui-ux-pro-max" in guidance.body
    assert any(row.id == "design-guidance" for row in parse_router(PACKAGE / "ROUTER.md"))
    # Split from visual-direction on 2026-11-10: a website build no longer runs the search.
    assert "search.py" not in caps["visual-direction"].body
    assert "design_candidates" not in caps["visual-direction"].outputs


def test_live_ui_ux_pro_max_source_passes_license_gate():
    manifest = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    src = next(s for s in manifest["sources"] if s["id"] == "ui-ux-pro-max")
    assert check_sources({"sources": [src]}, PACKAGE) == []
