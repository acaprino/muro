"""Integration contract for the awesome-opus5-5-videos intake of the supads package.

Pinned at head 92aee2f5 (the upstream publishes no release or tag). The source is not a skill:
a collection of 703 prompts by third parties. Its README states that every video and prompt
belongs to its creator; the MIT license covers the collection. Owner, 2026-11-21: absorb it with
credits ("Assorbi con crediti"). One capability reads the library through a filter and carries
the credit rule as a check.
"""
import json
from pathlib import Path

from muro import parse_capabilities

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "supads"
COMMIT = "92aee2f586ac0715cb3cbcb6384834f98a33383d"


def source():
    document = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    return next(s for s in document["sources"] if s["id"] == "awesome-opus5-5-videos")


def capability():
    return next(cap for cap in parse_capabilities(PACKAGE / "capabilities") if cap.id == "coded-animation")


def test_manifest_pins_head_and_carries_one_copy_of_the_prompts():
    src = source()
    assert src["repo_url"] == "https://github.com/yihui-dev/awesome-opus5-5-videos"
    assert (src["pin"], src["commit"], src["license"]) == ("head", COMMIT, "MIT") and "release" not in src
    assert src["selected_paths"] == ["data/videos.json", "README.md"]
    assert src["intake_only_paths"] == ["README.md"]                  # read for its two sections, not shipped
    [omission] = src["omissions"]
    assert omission["paths"] == ["prompts/**"] and "data/videos.json" in omission["reason"]


def test_the_library_is_one_capability_with_two_operations():
    cap = capability()
    assert [intent["id"] for intent in cap.intents] == ["video.reference-prompts", "video.coded-animation"]
    assert cap.outputs == ["coded_animation"]
    assert cap.intent_checks == {
        "video.reference-prompts": ["author_and_post_credited", "partial_prompts_flagged"],
        "video.coded-animation": ["author_and_post_credited", "partial_prompts_flagged", "single_html_file"]}
    assert "<package_root>/scripts/awesome-opus5-5-videos/data/videos.json" in cap.body
    assert "README.md" not in cap.body.split("## Sources")[0]         # not packaged, so no step points at it


def test_the_credit_rule_and_the_license_boundary_are_recorded():
    body = capability().body
    assert "92aee2f5" in body and "head" in body
    assert "Every video and prompt belongs to its creator" in body
    assert "covers the collection, not the prompts" in body
    assert "Never load the library whole" in body                     # about 810 KB: read through a filter


def test_the_delivery_document_says_what_the_collection_became():
    delivery = json.loads((PACKAGE / "delivery.json").read_text(encoding="utf-8"))
    mine = [d for d in delivery["decisions"] if d["source"] == "awesome-opus5-5-videos"]
    assert [(d["form"], d["targets"]) for d in mine] == [("capability", ["coded-animation"]), ("dropped", [])]
