"""Integration contract for the elayadesign/ai-design-skills intake."""
import json
from pathlib import Path

from muro import check_sources, parse_capabilities, parse_router

ROOT = Path(__file__).resolve().parent.parent


def test_ai_design_skills_manifest_is_mit_and_scoped_to_text():
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    source = next(s for s in manifest["sources"] if s["id"] == "ai-design-skills")
    assert source["commit"] == "456d9e0d3e2d84c748bb143c6ca3d90c45e16213"
    assert source["license"] == "MIT"
    assert source["copyright"] == "Copyright (c) 2026 Elaya"
    assert source["selected_paths"] == ["skills/landing-page-design/SKILL.md", "skills/figma-designer/SKILL.md"]
    assert source["intake"]["goal"]


def test_router_has_registered_landing_and_figma_capabilities():
    caps = {cap.id: cap for cap in parse_capabilities(ROOT / "capabilities")}
    router = {row.id: row for row in parse_router(ROOT / "ROUTER.md")}
    assert "offer" in caps["visual-direction"].outputs
    assert "page_outline" in caps["visual-direction"].outputs
    assert "figma-design" in caps
    assert router["figma-design"].role == "figma-design"
    assert "Elaya" in caps["visual-direction"].body or "ai-design-skills" in caps["visual-direction"].body


def test_live_ai_design_source_license_and_paths_pass():
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    source = next(s for s in manifest["sources"] if s["id"] == "ai-design-skills")
    assert check_sources({"sources": [source]}, ROOT) == []
