"""Discovery entries: AI-authored area skills that route into the one coordinator.

The live host test of 2026-11-11 showed the umbrella skill losing description-based
discovery to narrower skills. Entries give each area a sharp description; their
grouping and wording are package data authored by the harmonizing AI. Python only
checks structure, coverage and naming, and emits the skill files.
"""
import copy
import json
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities
from muro.entries import validate_entries

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"
PLUGIN = {"slug": "muro", "name": "Muro", "command": "muro", "version": "0.1.0"}


def doc(**over):
    base = {"entries": [{"name": "muro-testing", "description": "Use when verifying the requested test artifact.",
                         "capabilities": ["x"]}]}
    base.update(over)
    return base


class Cap:
    def __init__(self, identifier):
        self.id = identifier


@pytest.mark.parametrize("broken, message", [
    ({"entries": []}, "nonempty"),
    ({"extra": 1}, "exactly"),
    ({"entries": [{"name": "testing", "description": "Use when x.", "capabilities": ["x"]}]}, "start with 'muro-'"),
    ({"entries": [{"name": "muro-Bad", "description": "Use when x.", "capabilities": ["x"]}]}, "kebab-case"),
    ({"entries": [{"name": "muro-a", "description": "", "capabilities": ["x"]}]}, "description"),
    ({"entries": [{"name": "muro-a", "description": "Use when " + "x" * 1100, "capabilities": ["x"]}]}, "1024"),
    ({"entries": [{"name": "muro-a", "description": "Use when x.", "capabilities": ["ghost"]}]}, "unknown capability ghost"),
    ({"entries": [{"name": "muro-a", "description": "Use when x.", "capabilities": []}]}, "capabilities"),
    ({"entries": [{"name": "muro-a", "description": "Use when x.", "capabilities": ["x"]},
                  {"name": "muro-a", "description": "Use when y.", "capabilities": ["x"]}]}, "duplicate entry"),
    ({"entries": [{"name": "muro-a", "description": "Use when x.", "capabilities": ["x"], "when": "keyword"}]}, "exactly"),
    # Scope is set at intake: there is no way to absorb a capability and keep it out of discovery.
    ({"unrouted": [{"capability": "x", "reason": "kept for later"}]}, "exactly"),
])
def test_entry_documents_are_checked_for_shape_naming_and_references(broken, message):
    errors = validate_entries(doc(**broken), [Cap("x")], PLUGIN)
    assert any(message in error for error in errors), errors


def test_every_absorbed_capability_must_be_discoverable():
    errors = validate_entries(doc(), [Cap("x"), Cap("y")], PLUGIN)
    assert any("y" in e and "no entry" in e for e in errors), errors


def test_marionette_entries_cover_everything_its_intake_absorbed():
    caps = parse_capabilities(MARIONETTE / "capabilities")
    plugin = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    data = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))
    assert set(data) == {"entries"} and validate_entries(data, caps, plugin) == []
    assert {c for e in data["entries"] for c in e["capabilities"]} == {c.id for c in caps}


def test_release_emits_one_hidden_entry_skill_per_area_that_drives_the_same_runtime(portable_project, tmp_path):
    (portable_project / "entries.json").write_text(json.dumps(doc()), encoding="utf-8")
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    assert (release / "entries.json").is_file()
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        skills = release / "adapters" / host / "skills"
        umbrella, entry = skills / "muro", skills / "muro-testing"
        assert (umbrella / "SKILL.md").is_file() and (umbrella / "muro.py").is_file()
        assert sorted(p.name for p in entry.iterdir()) == ["SKILL.md"]  # no second runtime copy
        # The packaged runtime indexes a focused view by entry, so the entries travel with it.
        assert (umbrella / "entries.json").read_bytes() == (release / "entries.json").read_bytes()
        text = (entry / "SKILL.md").read_text(encoding="utf-8")
        front, body = text.split("---", 2)[1], text.split("---", 2)[2]
        assert "name: muro-testing" in front
        assert "description: Use when verifying the requested test artifact." in front
        assert "Classify against the whole returned catalog" in body
        assert "## Classification rules" in body and "plan --compact" in body
        if host == "claude-code":
            assert "user-invocable: false" in front
            assert "Bash(python ${CLAUDE_PLUGIN_ROOT}/skills/muro/muro.py *)" in front
            assert "${CLAUDE_PLUGIN_ROOT}/skills/muro/muro.py plan --compact --focus x --task" in body
        else:
            assert "user-invocable" not in front
            assert "<skill-directory>/../muro/muro.py plan --compact --focus x --task" in body
            assert (entry.parent / "muro" / "muro.py").is_file()
        install = (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")
        assert "muro-testing" in install


def test_invalid_entries_block_the_release_without_partial_output(portable_project, tmp_path):
    broken = copy.deepcopy(doc())
    broken["entries"][0]["capabilities"] = ["ghost"]
    (portable_project / "entries.json").write_text(json.dumps(broken), encoding="utf-8")
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="ghost"):
        build_release(portable_project / "sources.json", portable_project, out)
    assert not (out / "muro").exists() and not (out / ".muro.muro-build").exists()


def test_a_description_with_yaml_syntax_is_quoted_so_hosts_can_load_the_skill(portable_project, tmp_path):
    # Live finding of 2026-11-11: "open decisions: agreeing ..." was written as a plain YAML scalar,
    # the frontmatter became invalid and Claude Code silently did not list the entry.
    tricky = "Use when work has open decisions: agree them first, then build #1 \"slices\"."
    document = doc()
    document["entries"][0]["description"] = tricky
    (portable_project / "entries.json").write_text(json.dumps(document), encoding="utf-8")
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        text = (release / "adapters" / host / "skills" / "muro-testing" / "SKILL.md").read_text(encoding="utf-8")
        line = next(l for l in text.split("---", 2)[1].splitlines() if l.startswith("description:"))
        assert line == "description: " + json.dumps(tricky, ensure_ascii=False)
        assert json.loads(line.split(": ", 1)[1]) == tricky   # the author's words are not altered


def test_every_marionette_skill_description_is_a_loadable_yaml_scalar(tmp_path):
    from muro.adapters import _skill
    caps = parse_capabilities(MARIONETTE / "capabilities")
    plugin = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    for entry in [None, *entries]:
        front = _skill(plugin, "claude-code", capabilities=caps, entry=entry).split("---", 2)[1]
        value = next(l for l in front.splitlines() if l.startswith("description:"))[len("description: "):]
        assert value.startswith('"') or (": " not in value and " #" not in value and not value.endswith(":")), value
