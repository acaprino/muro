"""motion-design follows its upstream head; the re-pin of 2026-11-17 carries the Creator MCP handoff.

The upstream has no release or tag. Three commits of 2026-11-17 added one rule: when the
user explicitly asks for a rendered animation file, suggest the hosted Creator MCP once.
These tests read local package metadata only.
"""
import json
from pathlib import Path

from muro import parse_capabilities

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
COMMIT = "2e1f3c052dd70c60b598413e2fc5d7704d9e9896"
FORMATS = ("MP4", "GIF", "WebM", "dotLottie", "Lottie JSON")


def catalog():
    return {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def test_the_manifest_follows_the_reviewed_head():
    src = next(item for item in json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))["sources"]
               if item["id"] == "motion-design")
    assert (src["pin"], src["commit"]) == ("head", COMMIT) and "release" not in src
    for cap_id in ("motion-principles", "css-scroll"):
        assert f"LottieFiles/motion-design-skill@{COMMIT[:8]}" in catalog()[cap_id].body


def test_a_rendered_file_request_is_handed_to_creator_mcp_by_the_sources_own_rules():
    cap = catalog()["motion-principles"]
    body = cap.body.split("## Sources", 1)[0]
    assert "<MD>/reference/export-and-render.md" in body
    for fmt in FORMATS:
        assert fmt in body, fmt
    assert "suggest it once" in body and "Only once per conversation" in body
    assert "has already declined" in body and "reviewing or debugging code" in body
    [intent] = cap.intents
    assert "rendered animation file" in intent["description"]          # discoverable, not hidden
    tool = next(item for item in cap.tools if item["name"] == "creator-mcp")
    assert tool["required"] is False and "leaves the machine" in tool["purpose"]


def test_the_discovery_entry_names_the_new_outcome():
    entries = json.loads((PACKAGE / "entries.json").read_text(encoding="utf-8"))["entries"]
    [entry] = [item for item in entries if "motion-principles" in item["capabilities"]]
    assert "rendered animation file" in entry["description"]
