"""`reads`, the data flow a harmonization declares, as the validator holds it.

The 2026-11-10 re-harmonization added `reads` to the catalog. What one package's bodies say after it is that
package's own fact; this module keeps the factory's half, on the fixture package. It does not evaluate the
quality of AI reasoning.
"""
import copy

from muro import parse_capabilities, parse_router, validate_capabilities_and_router
from routing_helpers import FIXTURE


def test_reads_is_optional_data_flow_validated_against_producers():
    """`reads` is optional data flow: validated against producers, never a prerequisite."""
    caps = parse_capabilities(FIXTURE / "capabilities")
    by_id = {cap.id: cap for cap in caps}
    assert by_id["pacing-spec"].reads == ["angle", "outline"]              # outputs of story-brief
    assert by_id["scroll-build-gsap"].reads == by_id["scroll-build-css"].reads == ["pacing-plan", "reduced-motion"]
    assert by_id["manuscript-files"].reads == [] and all(cap.after == [] for cap in caps)   # no edge comes of it
    rows = parse_router(FIXTURE / "ROUTER.md")
    assert validate_capabilities_and_router(caps, rows) == []
    broken = copy.deepcopy(caps)
    target = next(cap for cap in broken if cap.id == "pacing-spec")
    target.reads = ["angle", "angle", "pacing-plan", "ghost-output"]
    errors = validate_capabilities_and_router(broken, rows)
    assert any("duplicate reads" in e for e in errors)
    assert any("reads its own output pacing-plan" in e for e in errors)
    assert any("reads ghost-output, which no other capability produces" in e for e in errors)
