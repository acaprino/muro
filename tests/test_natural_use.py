"""A package is used for the whole result, again on later turns, and without talk of its mechanics.

Owner, 2026-11-27, watching a production session: "Non stai usando marionette al massimo", then
"Ancora l'uso di marionette non è naturale e soddisfacente" (ADR-0037). The host had designed screens
by hand until it was told to use the package, then selected one capability for a request that named a
result ("too static, rigid, square; icons instead of buttons?"), and announced its plans and steps.

The prompt and the generated skills state the rules. That a host applies them is not proved here: the
live runs are in docs/verification/2026-11-27-natural-use.md.
"""
import json
from pathlib import Path

import pytest

from muro import parse_capabilities
from muro.adapters import _skill
from muro.runtime import focused_catalog

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "package"
PLUGIN = {"slug": "pressroom", "name": "Pressroom", "command": "pressroom", "version": "0.1.0"}


def _flat(text):
    return " ".join(text.split())


def test_the_selection_is_sized_to_the_result_not_to_the_words():
    text = _flat((ROOT / "prompts" / "classify.md").read_text(encoding="utf-8"))
    assert "smallest sufficient set" not in text
    assert "Size the selection to the outcome, not to the words of the request" in text
    assert "the user names a result, not the crafts it takes" in text
    assert "the brief groups included" in text
    # what stays: a precise operation is one capability, a ruled-out stage stays out, no repeated work
    assert "A precise operation" in text and "is the capability that does it" in text
    assert "A stage the user rules out stays out" in text
    assert "a specification asked for on its own does not ask for its code" in text
    assert "Never add a capability whose work only repeats one already selected" in text


def _skills():
    caps = parse_capabilities(FIXTURE / "capabilities")
    entry = {"name": "pressroom-stories", "description": "Use when writing a story.",
             "capabilities": [caps[0].id]}
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        yield host, _flat(_skill(PLUGIN, host, capabilities=caps, classify_prompt="# Rules", entries=[entry]))
        yield host, _flat(_skill(PLUGIN, host, capabilities=caps, classify_prompt="# Rules", entry=entry,
                                 entries=[entry]))


def test_every_skill_comes_back_for_later_work_and_speaks_of_the_work():
    for host, text in _skills():
        assert "This skill holds for the rest of the conversation" in text, host
        assert "a part of a larger task you are doing" in text and "invoke this skill again" in text, host
        # Live run of 2026-11-27: a follow-up that ran the launcher without invoking the skill again was
        # denied, because a skill pre-approves its calls only in the turn that invokes it.
        assert "the invocation is what lets the host run its launcher calls" in text, host
        assert "Speak to the user about the work" in text, host
        assert "run them without announcing or recapping them" in text, host


def test_work_the_user_asked_for_is_confirmed_in_the_classification_call():
    # One call fewer per plan: `plan --classification FILE --confirm` returns the first step
    # (the mechanics are tested in test_audit_p1); approval is asked only when the user asked for a proposal.
    for host, text in _skills():
        assert "add `--confirm` to that same call" in text, host
        assert "If `confirm` (the call had no `--confirm`)" in text, host
        assert "obtain one-line approval unless already authorized" not in text, host


def test_the_umbrella_description_says_when_to_use_it_inside_a_larger_task():
    caps = parse_capabilities(FIXTURE / "capabilities")
    text = _skill({**PLUGIN, "description": "Use when " + "writing stories, " * 80}, "claude-code",
                  capabilities=caps)
    line = next(l for l in text.split("---", 2)[1].splitlines() if l.startswith("description:"))
    description = line.split(": ", 1)[1].strip('"')
    assert len(description) <= 1024
    assert description.endswith("Pressroom AI-routed coordinator: use it also when this work comes up inside a "
                                "larger task.")


def test_the_first_call_names_every_area_the_result_needs():
    caps = parse_capabilities(FIXTURE / "capabilities")
    entries = json.loads((FIXTURE / "entries.json").read_text(encoding="utf-8"))["entries"]
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        entry = _flat(_skill(PLUGIN, host, capabilities=caps, classify_prompt="# R", entry=entries[0], entries=entries))
        assert "Decide which areas of Pressroom the result needs" in entry, host
        assert "this one included" in entry and "--focus pressroom-stories[,<another pressroom- skill>…]" in entry
        umbrella = _flat(_skill(PLUGIN, host, capabilities=caps, classify_prompt="# R", entries=entries))
        assert "--focus <pressroom- skill>[,<another pressroom- skill>…]" in umbrella, host
        assert "When none of them fits, run it with `--brief`" in umbrella, host
        # a package without entries keeps the index
        alone = _flat(_skill(PLUGIN, host, capabilities=caps, classify_prompt="# R"))
        assert "plan --compact --brief --task" in alone and "Decide which areas" not in alone, host


def test_an_entry_name_in_focus_stands_for_its_capabilities():
    catalog = [{"id": name, "role": "r-" + name, "when": "—", "after": [], "outputs": ["o-" + name],
                "intents": [{"id": "i." + name, "description": "d " + name, "excludes": ["x"]}]} for name in "abcd"]
    entries = [{"name": "pkg-ab", "description": "Use when a or b.", "capabilities": ["a", "b"]},
               {"name": "pkg-cd", "description": "Use when c or d.", "capabilities": ["c", "d"]}]
    both = focused_catalog(catalog, {"pkg-ab", "c"}, entries)
    assert [e.get("id") for e in both] == ["a", "b", "c", None]
    assert both[3] == {"brief": True, "description": "Use when c or d.", "capabilities": ["d"]}
    assert focused_catalog(catalog, {"pkg-ab", "pkg-cd"}, entries) == focused_catalog(catalog, set("abcd"), entries)
    with pytest.raises(ValueError, match="unknown capability or entry: pkg-zz"):
        focused_catalog(catalog, {"pkg-zz"}, entries)


def test_session_text_draws_its_boundary_with_the_capabilities_it_reaches():
    delivery = _flat((ROOT / "prompts" / "delivery.md").read_text(encoding="utf-8"))
    assert "Session text acts before any skill is chosen" in delivery
    assert "Draw that boundary in a marked line in the section" in delivery
    assert "through the discovery entry you name, also when it comes up inside a larger task" in delivery
    assert "is not a rule for how much of a capability's work the result gets" in delivery
    review = _flat((ROOT / "prompts" / "review.md").read_text(encoding="utf-8"))
    assert "**Session text against capabilities.**" in review and "that is a finding" in review


def test_the_muro_system_section_is_written_from_the_package_data():
    # Owner, 2026-11-27: "ogni plugin o muro comunque dovrebbero iniettare automaticamente anche una parte di
    # system prompt per guidare bene l'uso. Chiamato muro system".
    from muro.system_section import injected_text, system_section
    caps = parse_capabilities(FIXTURE / "capabilities")
    entries = json.loads((FIXTURE / "entries.json").read_text(encoding="utf-8"))["entries"]
    plugin = {**PLUGIN, "replaces": ["story-skill"]}
    text = system_section(plugin, caps, entries)
    assert text.startswith("# Muro system: Pressroom\n")
    for entry in entries:                                   # every skill is named, with what it covers
        assert f"- `{entry['name']}`: " in text
    assert "- `pressroom`: the whole catalog" in text
    titles = {cap.id: next(l[2:].strip() for l in cap.body.splitlines() if l.startswith("# ")) for cap in caps}
    assert all(title in text for title in titles.values())  # the capabilities' own titles, nothing invented
    flat = _flat(text)
    assert "when it comes up inside a larger task, and for each later change to it" in flat
    assert "name every one of these skills the result needs" in flat
    assert "not about skills, plans or steps" in flat
    assert "Do not invoke a skill or plugin that Pressroom absorbs" in flat
    alone = system_section(PLUGIN, caps, None)              # no entries: the one skill lists its capabilities
    assert "- `pressroom`: " in alone and "first call" not in alone and "absorbs" not in alone.split("\n\n", 2)[2]
    assert system_section(PLUGIN, [], entries) == ""        # a policy-only package has no skill to invoke
    assert injected_text("Rules.", PLUGIN, caps, entries) == system_section(PLUGIN, caps, entries) + "\nRules."
    assert injected_text("Rules.", PLUGIN, [], None) == "Rules."
