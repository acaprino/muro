"""A package names the originals it absorbs where the host chooses a skill (ADR-0019).

The 2026-11-13 session ran a package beside installed originals (ui-ux-pro-max, taste-skill, four
standalone design skills). The umbrella said "Never invoke original absorbed skills" without naming one,
and its own AI-authored description was cut to fit 1024 characters. Which entry stands in for which
original is the harmonizing AI's declaration (`absorbs`); Python checks names and lengths and writes
the sentence.
"""
import json
import re
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities
from muro.adapters import _skill
from muro.entries import absorbs_sentence, entry_description, validate_entries

ROOT = Path(__file__).resolve().parent.parent
PLUGIN = {"slug": "muro", "name": "Muro", "command": "muro", "version": "0.1.0", "replaces": ["orig-a", "orig-b"]}


class Cap:
    def __init__(self, identifier):
        self.id = identifier


def entry(**over):
    return {"entries": [{"name": "muro-testing", "description": "Use when verifying the requested test artifact.",
                         "capabilities": ["x"], **over}]}


@pytest.mark.parametrize("absorbs, message", [
    (["orig-c"], "absorbs orig-c, which plugin.replaces does not list"),
    ([], "absorbs must be a nonempty list"),
    (["orig-a", "orig-a"], "duplicate absorbed name"),
    ("orig-a", "absorbs must be a nonempty list"),
])
def test_absorbed_names_come_from_plugin_replaces(absorbs, message):
    errors = validate_entries(entry(absorbs=absorbs), [Cap("x")], PLUGIN)
    assert any(message in error for error in errors), errors


def test_the_sentence_counts_against_the_description_limit():
    long = "Use when " + "x" * (1024 - 9 - 20)
    assert validate_entries(entry(description=long), [Cap("x")], PLUGIN) == []
    errors = validate_entries(entry(description=long, absorbs=["orig-a"]), [Cap("x")], PLUGIN)
    assert any("with the sentence naming what it absorbs" in error for error in errors), errors


def test_the_ai_description_is_kept_whole_and_followed_by_the_names():
    item = {"name": "muro-a", "description": "Use when designing a page.", "capabilities": ["x"],
            "absorbs": ["orig-a", "orig-b"]}
    assert entry_description(item) == ("Use when designing a page. It replaces the absorbed orig-a and orig-b: use "
                                       "this skill instead of them, also when the user names one of them.")
    assert entry_description({"description": "Use when x."}) == "Use when x."
    assert absorbs_sentence([]) == ""


def frontmatter_description(text):
    front = text.split("---")[1]
    raw = next(line for line in front.splitlines() if line.startswith("description:")).split(":", 1)[1].strip()
    return json.loads(raw) if raw.startswith('"') else raw


