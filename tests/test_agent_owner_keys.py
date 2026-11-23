"""An unattended step (`muro agent`, so `muro absorb`) has no owner to ask: it may not write or change the two keys
that record the owner's answer about a package server, `package_server` and `server_choice` of `delivery.json`.

Python only compares the keys with the file as it was before the step; it never decides what they should hold.
The endpoint is scripted: a stub of the model, so the tests prove the mechanics and not the model's obedience.
"""
import copy
import json

import pytest

from muro.agent import run_step

DECLARATION = {"name": "pack", "children": [], "tools": [{"name": "lookup"}]}
CHOICE = {"asked_on": "2026-11-23", "answer": "one server", "given_on": {"sources": {"demo": "abc1234"}, "shown": ["lookup"]}}
BASE = {"decisions": [{"source": "demo", "content": "The whole skill.", "form": "capability", "targets": ["x"],
                       "reason": "One task-specific procedure."}]}


class Model:
    """The endpoint's answers, one for each round (the last one repeats), and every request it was sent."""

    def __init__(self, monkeypatch, *answers):
        self.answers, self.requests = list(answers), []
        monkeypatch.setattr("muro.agent._post_chat", self.post)

    def post(self, api_base, api_key, model, messages):
        self.requests.append(copy.deepcopy(messages))
        return self.answers[min(len(self.requests), len(self.answers)) - 1]


def answer(document):
    return json.dumps({"files": {"delivery.json": json.dumps(document)}, "notes": "done"})


def disk(project, **keys):
    """The delivery.json on disk before the step; the bytes are returned so a test can see them unchanged."""
    path = project / "delivery.json"
    path.write_text(json.dumps({**BASE, **keys}, indent=1), encoding="utf-8")
    return path.read_bytes()


def step(project, name, rounds=2):
    manifest = json.loads((project / "sources.json").read_text(encoding="utf-8"))
    return run_step(name, "demo" if name == "intake" else None, manifest, project, "https://unused.invalid",
                    "fixture", "", rounds, lambda: (0, "valid"))


BOTH = {"package_server": DECLARATION, "server_choice": CHOICE}
OTHER_ANSWER = {**CHOICE, "answer": "each server as it is"}


@pytest.mark.parametrize("name", ["harmonize", "intake"])
@pytest.mark.parametrize("before, after, key", [
    ({}, BOTH, "package_server"),
    ({}, {"server_choice": CHOICE}, "server_choice"),
    (BOTH, {**BOTH, "server_choice": OTHER_ANSWER}, "server_choice"),
    (BOTH, {"server_choice": CHOICE}, "package_server"),
    (BOTH, {"package_server": DECLARATION}, "server_choice"),
])
def test_a_model_that_insists_on_the_owners_keys_ends_with_a_failed_step_and_the_file_unchanged(
        portable_project, monkeypatch, capsys, name, before, after, key):
    original = disk(portable_project, **before)
    model = Model(monkeypatch, answer({**BASE, **after}))
    assert step(portable_project, name) == 1
    assert (portable_project / "delivery.json").read_bytes() == original
    assert len(model.requests) == 2                      # the refusal went back to the model, as a rejected result does
    refusal = model.requests[1][-1]["content"]
    assert refusal.startswith("That answer was rejected: ") and key in refusal and "attended session" in refusal
    assert f"step {name} failed after 2 round(s)" in capsys.readouterr().out


@pytest.mark.parametrize("name", ["harmonize", "intake"])
def test_a_model_that_leaves_the_keys_as_they_were_is_accepted(portable_project, monkeypatch, name):
    disk(portable_project)
    changed = {**BASE, "always_on": "Text for every session."}
    Model(monkeypatch, answer(changed))
    assert step(portable_project, name) == 0
    assert json.loads((portable_project / "delivery.json").read_text(encoding="utf-8")) == changed


@pytest.mark.parametrize("name", ["harmonize", "intake"])
def test_a_file_that_already_holds_the_owners_answer_passes_unchanged(portable_project, monkeypatch, name):
    # Written in an attended session: a later unattended step keeps both keys, or writes no delivery.json at all.
    disk(portable_project, **BOTH)
    kept = {**BASE, "always_on": "Text for every session.", "server_choice": copy.deepcopy(CHOICE),
            "package_server": copy.deepcopy(DECLARATION)}
    Model(monkeypatch, answer(kept))
    assert step(portable_project, name) == 0
    assert json.loads((portable_project / "delivery.json").read_text(encoding="utf-8")) == kept
    original = disk(portable_project, **BOTH)
    Model(monkeypatch, json.dumps({"files": {"ROUTER.md": "r"}}))
    assert step(portable_project, name) == 0
    assert (portable_project / "delivery.json").read_bytes() == original


def test_a_model_that_drops_the_keys_then_keeps_them_is_accepted_in_the_second_round(portable_project, monkeypatch):
    disk(portable_project, **BOTH)
    model = Model(monkeypatch, answer(BASE), answer({**BASE, **BOTH, "always_on": "x"}))
    assert step(portable_project, "harmonize") == 0 and len(model.requests) == 2
    assert json.loads((portable_project / "delivery.json").read_text(encoding="utf-8"))["package_server"] == DECLARATION


@pytest.mark.parametrize("name", ["harmonize", "intake"])
def test_the_contract_says_that_no_owner_can_be_asked(portable_project, monkeypatch, name):
    disk(portable_project)
    model = Model(monkeypatch, answer(BASE))
    step(portable_project, name)
    first = model.requests[0][0]["content"]
    assert "No owner can be asked in this run" in first and "package_server" in first and "server_choice" in first
