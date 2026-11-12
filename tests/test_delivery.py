"""Delivery form: what each absorbed source becomes, decided by the host AI (ADR-0016).

Owner correction of 2026-11-12: installing a generated plugin is the consent, so a
release may register what it needs by itself. Which form a piece of source content
takes (on-demand capability, always-on session text, active hook, dropped) is an AI
judgment recorded in `delivery.json`. Python checks shape and references, emits the
host files that the document declares, and never chooses a form.
"""
import copy
import json
from pathlib import Path
import subprocess
import sys

import pytest

from muro import build_release, parse_capabilities
from muro.delivery import ALWAYS_ON_PER_SOURCE, always_on_limit, validate_delivery
from muro.factory import harmonize_prompt, prepare_intake

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"
HOSTS = ("claude-code", "codex", "pi", "opencode", "hermes")


class Cap:
    def __init__(self, identifier, hooks=()):
        self.id = identifier
        self.hooks = list(hooks)


ACTIVE = {"event": "UserPromptSubmit", "action": "Print a marker.", "tools": ["shell"], "policy": "active"}
PASSIVE = dict(ACTIVE, policy="host-approved")


def doc(**over):
    base = {"decisions": [{"source": "demo", "content": "The whole skill.", "form": "capability",
                           "targets": ["x"], "reason": "One task-specific procedure."}]}
    base.update(over)
    return base


def decision(form, targets, source="demo"):
    return {"source": source, "content": "Part of the source.", "form": form, "targets": targets, "reason": "Because."}


def errors_for(document, capabilities=None, sources=("demo",)):
    return validate_delivery(document, capabilities or [Cap("x")], set(sources))


def test_a_minimal_document_is_valid():
    assert errors_for(doc()) == []


def test_the_always_on_budget_is_proportional_to_the_sources_that_contribute():
    """Owner, 2026-11-12: the limit "deve essere proporzionale al numero di intake che ci vanno dentro"."""
    def policy_of(sources, size):
        decisions = [decision("capability", ["x"], source="quiet")]
        decisions += [decision("always-on", [], source=name) for name in sources]
        return {"decisions": decisions, "always_on": "x" * size}

    unit = ALWAYS_ON_PER_SOURCE
    for sources in (["a"], ["a", "b"], ["a", "b", "c"]):
        limit = unit * len(sources)
        document = policy_of(sources, limit)
        assert always_on_limit(document) == limit
        known = ("quiet", *sources)
        assert errors_for(document, sources=known) == []
        over = errors_for(policy_of(sources, limit + 1), sources=known)
        assert over == [f"always_on exceeds {limit} characters ({unit} for each source with an always-on decision, "
                        f"{len(sources)} here): every session pays for it"]
    # Two parts of one source are one intake; a source that only gives capabilities adds nothing.
    assert always_on_limit(policy_of(["a", "a"], 1)) == unit
    assert errors_for(policy_of(["a", "a"], unit + 1), sources=("quiet", "a"))
    assert always_on_limit(doc()) == 0


def _two_source_policy(size):
    return {"decisions": [decision("always-on", [], source="a"), decision("always-on", [], source="b")],
            "always_on": "y" * size}


def test_the_packaged_runtime_applies_the_same_proportional_budget(tmp_path, capsys):
    """The session command re-checks the text it prints; it must not keep the old fixed limit."""
    from muro.runtime import runtime_main

    (tmp_path / "delivery.json").write_text(json.dumps(_two_source_policy(2 * ALWAYS_ON_PER_SOURCE)), encoding="utf-8")
    assert runtime_main(["--package", str(tmp_path), "session-context"]) == 0
    assert capsys.readouterr().out.strip() == "y" * (2 * ALWAYS_ON_PER_SOURCE)
    (tmp_path / "delivery.json").write_text(json.dumps(_two_source_policy(2 * ALWAYS_ON_PER_SOURCE + 1)),
                                            encoding="utf-8")
    assert runtime_main(["--package", str(tmp_path), "session-context"]) == 1
    captured = capsys.readouterr()
    assert captured.out == "" and f"at most {2 * ALWAYS_ON_PER_SOURCE} characters" in captured.err


def test_hermes_registers_a_policy_longer_than_one_source_allowance_whole(tmp_path):
    """The Hermes registration carried a fixed `max_chars=2000`, then `len(policy)`.

    The host accepts at most 4,000 characters in a section and skips what is over, so
    neither could carry a two-source policy: it goes whole through the turn hook.
    """
    import importlib.util
    from muro.hermes_adapter import write_hermes_adapter

    policy = "\n\n".join(f"Rule {index}. " + "z" * 990 for index in range(2 * ALWAYS_ON_PER_SOURCE // 1000))[:2 * ALWAYS_ON_PER_SOURCE]
    (tmp_path / "skills").mkdir()
    (tmp_path / "policy.md").write_text(policy, encoding="utf-8")
    write_hermes_adapter(tmp_path, {"slug": "demo", "command": "demo", "name": "Demo", "version": "1.0.0"}, True)
    spec = importlib.util.spec_from_file_location("generated_hermes_budget", tmp_path / "__init__.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    class Context:
        def __init__(self):
            self.hooks = []

        def register_skill(self, name, path):
            pass

        def register_system_prompt_section(self, identifier, content, *, position, max_chars):
            raise AssertionError("Hermes rejects max_chars over 4000 and skips a longer section")

        def register_hook(self, name, callback):
            assert name == "pre_llm_call"
            self.hooks.append(callback)

    ctx = Context()
    module.register(ctx)
    pieces = [hook(conversation_history=[])["context"] for hook in ctx.hooks]
    assert "\n\n".join(pieces) == policy and all(len(piece) <= 8000 for piece in pieces) and len(pieces) > 1


@pytest.mark.parametrize("broken, message", [
    ({"decisions": []}, "nonempty"),
    ({"extra": 1}, "only decisions, always_on and hooks"),
    ({"decisions": [dict(decision("capability", ["x"]), weight=3)]}, "exactly source, content, form, targets and reason"),
    ({"decisions": [decision("system-prompt", [])]}, "form must be one of"),
    ({"decisions": [decision("capability", ["x"], source="ghost")]}, "unknown source ghost"),
    ({"decisions": [decision("capability", ["ghost"])]}, "unknown capability ghost"),
    ({"decisions": [decision("capability", [])]}, "needs at least one target"),
    ({"decisions": [decision("dropped", ["x"])]}, "takes no targets"),
    ({"decisions": [dict(decision("capability", ["x"]), reason=" ")]}, "reason"),
    # A form with nothing behind it is a claim the release cannot keep.
    ({"decisions": [decision("capability", ["x"]), decision("always-on", [])]}, "always_on text is missing"),
    ({"always_on": "Facts for every session."}, "no decision has form always-on"),
    ({"decisions": [decision("capability", ["x"]), decision("always-on", [])],
      "always_on": "x" * (ALWAYS_ON_PER_SOURCE + 1)}, f"always_on exceeds {ALWAYS_ON_PER_SOURCE} characters"),
    ({"decisions": [decision("capability", ["x"]), decision("always-on", [])], "always_on": "  "}, "always_on"),
])
def test_documents_are_checked_for_shape_and_references(broken, message):
    errors = errors_for(doc(**broken))
    assert any(message in error for error in errors), errors


def test_every_source_needs_a_recorded_decision():
    errors = errors_for(doc(), sources=("demo", "second"))
    assert any("second" in e and "no delivery decision" in e for e in errors), errors


def hooked(**over):
    wiring = {"host": "claude-code", "capability": "x", "event": "UserPromptSubmit", "matcher": "",
              "run": ["python", "<package_root>/scripts/demo/mark.py"]}
    wiring.update(over)
    return doc(decisions=[decision("hook", ["x"])], hooks=[wiring])


def test_an_active_hook_needs_a_decision_a_catalog_entry_and_a_wiring():
    assert errors_for(hooked(), [Cap("x", [ACTIVE])]) == []
    # The catalog must say the hook is active: delivery cannot switch on what the capability calls passive.
    assert any("policy active" in e for e in errors_for(hooked(), [Cap("x", [PASSIVE])]))
    # And an active catalog hook without a decision and a wiring is registered by nobody.
    assert any("no hook decision" in e for e in errors_for(doc(), [Cap("x", [ACTIVE])]))
    missing = doc(decisions=[decision("hook", ["x"])])
    assert any("no wiring" in e for e in errors_for(missing, [Cap("x", [ACTIVE])]))


@pytest.mark.parametrize("over, message", [
    ({"host": "opencode"}, "does not register hooks on opencode"),
    ({"capability": "ghost"}, "unknown capability ghost"),
    ({"event": ""}, "event"),
    ({"run": []}, "run"),
    ({"run": ["my python", "x.py"]}, "program"),
    ({"run": ["python", 'say "hi"']}, "double quote"),
    ({"matcher": None}, "matcher"),
])
def test_hook_wirings_are_checked(over, message):
    errors = errors_for(hooked(**over), [Cap("x", [ACTIVE])])
    assert any(message in error for error in errors), errors


def test_marionette_records_a_decision_for_every_source():
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    document = json.loads((MARIONETTE / "delivery.json").read_text(encoding="utf-8"))
    capabilities = parse_capabilities(MARIONETTE / "capabilities")
    assert validate_delivery(document, capabilities, {s["id"] for s in manifest["sources"]}) == []
    assert {d["source"] for d in document["decisions"]} == {s["id"] for s in manifest["sources"]}


def test_a_package_without_the_document_registers_nothing(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    assert not (release / "delivery.json").exists()
    for host in HOSTS:
        assert not (release / "adapters" / host / "hooks").exists()


def test_invalid_delivery_stops_the_build(portable_project, tmp_path):
    (portable_project / "delivery.json").write_text(json.dumps(doc(decisions=[])), encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid delivery"):
        build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    assert not (tmp_path / "out" / "muro").exists()


TEXT = "Demo facts: this package verifies the requested test artifact."


def with_session_text(project):
    document = doc(decisions=[*doc()["decisions"], decision("always-on", [])], always_on=TEXT)
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return document


def test_session_policy_is_a_native_claude_system_section_and_standalone_text(portable_project, tmp_path):
    with_session_text(portable_project)
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    plugin_root = release / "adapters" / "claude-code"
    manifest = json.loads((plugin_root / "hooks" / "hooks.json").read_text(encoding="utf-8"))
    assert manifest["modules"] == ["./policy.mjs"]
    assert not manifest.get("hooks")  # No second, transcript-context copy of the policy.
    assert (plugin_root / "hooks/policy.mjs").is_file()
    # The command the host will run, executed from outside the checkout with the placeholder resolved.
    skill = plugin_root / "skills" / "muro"
    printed = subprocess.run([sys.executable, str(skill / "muro.py"), "session-context"], cwd=tmp_path,
                             capture_output=True, text=True, encoding="utf-8", check=True).stdout
    assert printed.strip() == TEXT


def test_every_native_adapter_carries_its_declared_policy_and_registration(portable_project, tmp_path):
    with_session_text(portable_project)
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    for host in HOSTS:
        root = release / "adapters" / host
        assert (root / "skills" / "muro" / "delivery.json").is_file()
        install = (root / "INSTALL.md").read_text(encoding="utf-8")
        assert (root / "policy.md").read_text(encoding="utf-8") == TEXT
        assert "registers automatically" in install
        assert "does not register" not in install
        entrypoint = {"claude-code": "hooks/policy.mjs", "codex": "hooks/hooks.json",
                      "pi": "extensions/policy.js", "opencode": "index.js", "hermes": "__init__.py"}[host]
        assert (root / entrypoint).is_file()


def test_a_release_without_session_text_prints_nothing(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    skill = release / "adapters" / "codex" / "skills" / "muro"
    done = subprocess.run([sys.executable, str(skill / "muro.py"), "session-context"], cwd=tmp_path,
                          capture_output=True, text=True, encoding="utf-8")
    assert done.returncode == 0 and done.stdout == ""


def test_an_active_source_hook_is_wired_with_the_plugin_root(portable_project, tmp_path):
    import os

    cap = portable_project / "capabilities" / "x.md"
    text = cap.read_text(encoding="utf-8")
    assert "tools: []" in text and "hooks: []" in text
    shell = [{"name": "shell", "purpose": "Run the packaged marker script.", "required": True}]
    cap.write_text(text.replace("tools: []", "tools: " + json.dumps(shell))
                   .replace("hooks: []", "hooks: " + json.dumps([ACTIVE])), encoding="utf-8")
    document = hooked(matcher="Write|Edit", run=[
        "python", "-c", "import json,sys;print(json.dumps(sys.argv[1:]))",
        "<package_root>/scripts/demo/mark.py", "--quiet",
    ])
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    manifest = json.loads((release / "adapters" / "claude-code" / "hooks" / "hooks.json").read_text(encoding="utf-8"))
    assert "SessionStart" not in manifest["hooks"]
    [group] = manifest["hooks"]["UserPromptSubmit"]
    assert group["matcher"] == "Write|Edit"
    [hook] = group["hooks"]
    assert hook["type"] == "command"
    root = release / "adapters" / "claude-code"
    done = subprocess.run(hook["command"], shell=True, cwd=tmp_path,
                          env=dict(os.environ, CLAUDE_PLUGIN_ROOT=str(root)),
                          capture_output=True, text=True, encoding="utf-8", check=True)
    assert json.loads(done.stdout) == [str(root) + "/skills/muro/scripts/demo/mark.py", "--quiet"]


def test_preparation_hands_the_delivery_prompt_and_the_current_decisions_to_the_host_ai(portable_project, tmp_path):
    document = with_session_text(portable_project)
    manifest = json.loads((portable_project / "sources.json").read_text(encoding="utf-8"))
    intake = prepare_intake(manifest["sources"][0], portable_project, tmp_path / "intake")
    harmonize = harmonize_prompt(portable_project, tmp_path / "harmonize")
    rules = (ROOT / "prompts" / "delivery.md").read_text(encoding="utf-8")
    for prompt in ((intake / "PROMPT.md").read_text(encoding="utf-8"), (harmonize / "PROMPT.md").read_text(encoding="utf-8")):
        assert rules.strip().splitlines()[0] in prompt
        assert document["always_on"] in prompt          # current decisions are context for the next pass


def test_the_delivery_prompt_states_the_judgment_and_keeps_python_out_of_it():
    rules = (ROOT / "prompts" / "delivery.md").read_text(encoding="utf-8")
    for required in ("every session", "on demand", "reason", "delivery.json", "never"):
        assert required in rules, required
    # Factory prompts carry no package knowledge (ADR-0011).
    assert "marionette" not in rules.lower()


def test_the_guide_shows_the_recorded_decisions(portable_project, tmp_path):
    with_session_text(portable_project)
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    guide = (release / "GUIDE.html").read_text(encoding="utf-8")
    assert TEXT in guide and "One task-specific procedure." in guide
