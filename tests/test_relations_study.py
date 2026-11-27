"""Harmonization studies how the sources relate before it builds the graph (owner, 2026-11-27; ADR-0036).

"Prima deve capire a che serve, poi capire se è affiancabile o lavorare in sinergia con altro."

The factory's prompts state the rule. That an AI applies it is not proved here.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KINDS = ("symmetric", "complementary", "subordinate", "dependent", "beside")


def _prompt(name):
    return " ".join((ROOT / "prompts" / name).read_text(encoding="utf-8").split())


def test_intake_ends_with_a_relations_report():
    text = _prompt("intake.md")
    assert "End the intake with a relations report" in text
    assert all(kind in text for kind in KINDS)
    assert "the order, where both act in one task" in text
    assert "`- Relations:`" in text and "Show the whole report to the owner" in text


def test_the_harmonizer_studies_every_pair_and_decides_each_relation():
    text = _prompt("harmonizer.md")
    assert "Read every pair of sources, in both directions, on every harmonization" in text
    # the case that was missed: an alternative for the whole that also supplies a part
    assert "does not end the study" in text
    assert "Every relation you find gets a decision" in text
    # a link never alters a source (ADR-0017), never a second producer, one body per step
    assert "never changes a rule, number, condition or limit of either source" in text
    assert "never makes a second producer of an output" in text
    assert "A source that works alone after the study is a finding" in text


def test_the_review_re_examines_the_study():
    text = _prompt("review.md")
    assert "`- Relations:`" in text and "every pair of sources was judged" in text
    assert "nothing else uses or meets is a finding" in text
