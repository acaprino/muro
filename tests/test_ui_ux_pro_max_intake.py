"""Integration contract for UI UX Pro Max local design search."""
import json
from pathlib import Path

from muro import check_sources, parse_capabilities, parse_router

ROOT = Path(__file__).resolve().parent.parent


def test_ui_ux_pro_max_manifest_is_mit_and_scoped():
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    src = next(s for s in manifest["sources"] if s["id"] == "ui-ux-pro-max")
    assert src["commit"] == "a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5"
    assert src["license"] == "MIT"
    assert src["copyright"] == "Copyright (c) 2024 Next Level Builder"
    assert "src/ui-ux-pro-max/scripts/search.py" in src["selected_paths"]
    assert "src/ui-ux-pro-max/scripts/core.py" in src["selected_paths"]
    assert "src/ui-ux-pro-max/scripts/design_system.py" in src["selected_paths"]
    assert "src/ui-ux-pro-max/data/**" in src["selected_paths"]
    assert src["intake"]["goal"]


def test_visual_direction_contains_bounded_local_search():
    caps = {cap.id: cap for cap in parse_capabilities(ROOT / "capabilities")}
    visual = caps["visual-direction"]
    assert "design_candidates" in visual.outputs
    assert "stack_guidance" in visual.outputs
    assert "scripts/ui-ux-pro-max/scripts/search.py" in visual.body
    assert "--design-system" in visual.body
    assert "never use `--force`" in visual.body
    assert "ui-ux-pro-max" in visual.body
    assert any(row.id == "visual-direction" for row in parse_router(ROOT / "ROUTER.md"))


def test_live_ui_ux_pro_max_source_passes_license_gate():
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    src = next(s for s in manifest["sources"] if s["id"] == "ui-ux-pro-max")
    assert check_sources({"sources": [src]}, ROOT) == []
