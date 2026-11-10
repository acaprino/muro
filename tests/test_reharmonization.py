"""Regressions for the 2026-11-10 re-harmonization against the pinned sources.

These check that removed, source-contradicted text stays out and that recorded
decisions stay in. They do not evaluate the quality of AI reasoning.
"""
from pathlib import Path

from muro import parse_capabilities

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"  # the example plugin the factory builds
CAPS = {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def operative(name):
    """Instructions before ## Sources; the provenance notes there name removed text on purpose."""
    return CAPS[name].body.split("## Sources")[0]


def test_rules_from_unpinned_taste_copy_are_gone():
    body = operative("visual-direction")
    for phrase in ("3 of 20", "no eyebrow labels", "No 01/02/03", "cream-and-terracotta",
                   "one motion accent per view", "honest code drawings"):
        assert phrase not in body, phrase
    assert "Leonxlnx/taste-skill@f6b76575, release v2.5.1" in CAPS["visual-direction"].body


def test_taste_stop_hook_is_recorded_and_not_adopted():
    body = CAPS["visual-direction"].body
    assert CAPS["visual-direction"].hooks == []
    assert "`Stop` command hook" in body and "gate.mjs" in body
    assert "Do not call them and do not claim their results" in body


def test_gsap_capability_drops_claims_absent_from_its_only_selected_file():
    body = CAPS["gsap-scrolltrigger"].body
    assert "skills/gsap-scrolltrigger/references" not in body
    body = operative("gsap-scrolltrigger")
    for phrase in ("ScrollTrigger.kill()", "elastic.out", "within 2px", "nested scroll containers"):
        assert phrase not in body, phrase
    assert "never on a child tween" in body
    assert "never both on one trigger" in body
    # Owner decision 2026-11-10: GSAP is installed when the task needs it and it is missing.
    assert "`npm install gsap`" in body
    assert "Never install it against a CSS-only constraint" in body


def test_motion_principles_uses_source_tables():
    body = operative("motion-principles")
    for phrase in ("spring-gentle", "ease-out-expo", "cinematic", "150–500ms"):
        assert phrase not in body, phrase
    assert "Default: Corporate for UI" in body
    assert "total stagger under 500ms" in body
    assert "Hover under 100ms" in body


def test_css_scroll_states_it_has_no_upstream_source():
    body = CAPS["css-scroll"].body
    assert "Chromium 115" not in body
    assert "No selected upstream source covers CSS scroll-driven animation" in body
    for phrase in ("Firefox 113", "Safari 16.4"):
        assert phrase not in body, phrase


def test_work_map_follows_wayfinder_and_checks_the_work():
    cap = CAPS["work-map"]
    assert cap.outputs == ["task_map", "spec", "step_sequence"]
    assert "map_structure_valid" not in cap.checks
    for phrase in ("EX-002", "INV-002", "resolve_selection"):
        assert phrase not in cap.body, phrase
    assert "Problem Statement, Solution, User Stories" in cap.body
    assert "no issue tracker" in cap.body


def test_pdf_of_existing_file_has_one_owner():
    assert "A PDF of a file the user already has is a format conversion" in CAPS["office-authoring"].body
    assert any(i["id"] == "office.format-conversion" for i in CAPS["office-files"].intents)


def test_reads_declares_the_data_flow_and_is_validated(tmp_path):
    """`reads` is optional data flow: validated against producers, never a prerequisite."""
    from muro import parse_router, validate_capabilities_and_router
    assert CAPS["figma-design"].reads == ["palette", "typography", "layout", "constraints", "offer", "page_outline"]
    assert CAPS["motion-principles"].reads == ["palette", "typography", "layout", "constraints"]
    assert CAPS["gsap-scrolltrigger"].reads == CAPS["css-scroll"].reads == ["motion-spec", "reduced-motion"]
    assert CAPS["office-files"].reads == [] and all(cap.after == [] for cap in CAPS.values())
    caps = list(CAPS.values())
    rows = parse_router(ROOT / "examples" / "marionette" / "ROUTER.md")
    assert validate_capabilities_and_router(caps, rows) == []
    import copy
    broken = copy.deepcopy(caps)
    target = next(cap for cap in broken if cap.id == "motion-principles")
    target.reads = ["palette", "palette", "motion-spec", "ghost-output"]
    errors = validate_capabilities_and_router(broken, rows)
    assert any("duplicate reads" in e for e in errors)
    assert any("reads its own output motion-spec" in e for e in errors)
    assert any("reads ghost-output, which no other capability produces" in e for e in errors)
