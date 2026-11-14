"""Fixes for frictions measured in the first live Claude Code host test (2026-11-11).

p4 showed: the classification-required output (29.4 KB) was persisted to a file by the
host, and a multi-line heredoc carrying the classification did not match the
`Bash(python *)` allow rule (newlines split commands). Decisions below are fixtures.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from muro import build_release
from muro.runtime import Coordinator
from routing_helpers import copy_prompts, response

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"
# Claude Code 2.1.322 persisted p4's 29.4 KB plan output to a file instead of showing it inline.
# The exact host threshold is not documented; this bound keeps a wide margin under it, and the
# live reruns recorded in docs/verification/ are the real check. It applies to the focused view:
# the full catalog grows with every absorbed source (26 KB at 18 capabilities).
INLINE_LIMIT = 20000


def packaged_marionette(tmp_path):
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    shutil.copytree(MARIONETTE / "capabilities", pkg / "capabilities")
    for name in ("ROUTER.md", "sources.json", "entries.json"):
        shutil.copy2(MARIONETTE / name, pkg / name)
    copy_prompts(pkg)
    shutil.copytree(ROOT / "muro", pkg / "muro", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (pkg / "muro.py").write_text(
        "from pathlib import Path\nimport sys\npackage = Path(__file__).resolve().parent\n"
        "sys.path.insert(0, str(package))\nfrom muro.runtime import runtime_main\n"
        "raise SystemExit(runtime_main(['--package', str(package), *sys.argv[1:]]))\n", encoding="utf-8")
    return pkg


def run(pkg, consumer, *args):
    done = subprocess.run([sys.executable, str(pkg / "muro.py"), *args, "--project", str(consumer)],
                          capture_output=True, text=True, encoding="utf-8")
    assert done.returncode == 0, done.stderr
    return done.stdout


def test_compact_plan_fits_inline_and_keeps_what_the_ai_needs(tmp_path):
    pkg = packaged_marionette(tmp_path)
    consumer = tmp_path / "consumer"
    consumer.mkdir()
    task = "Disegna in Figma la landing page di Lumo. Non abbiamo ancora una struttura dei contenuti."
    full = run(pkg, consumer, "plan", "--compact", "--task", task)
    # The full catalog grows with every source; the focused view is what a host skill asks for.
    out = run(pkg, consumer, "plan", "--compact", "--focus", "visual-direction,design-guidance,figma-design", "--task", task)
    assert len(out.encode("utf-8")) < INLINE_LIMIT < 30000, len(out.encode("utf-8"))
    brief_all = run(pkg, consumer, "plan", "--compact", "--brief", "--task", task)
    assert len(brief_all.encode("utf-8")) < len(out.encode("utf-8")) < len(full.encode("utf-8"))
    data = json.loads(out)
    assert json.loads(full)["context"] == data["context"] == json.loads(brief_all)["context"]
    assert data["mode"] == "classification-required"
    assert data["context"]["task"] == task
    assert len(data["context"]["catalog_digest"]) == 64
    assert len(data["instructions"]) < 800 and "SKILL.md" in data["instructions"]  # a pointer, not the rules
    assert data["classification_path"].endswith(str(Path(".marionette") / "classification.json"))
    entries = {e["id"]: e for e in json.loads(full)["catalog"]}
    assert len(entries) == 36
    in_focus = ("visual-direction", "design-guidance", "figma-design")
    full_part = {e["id"]: e for e in data["catalog"] if "id" in e}
    assert set(full_part) == set(in_focus)
    for name in in_focus:
        assert full_part[name] == entries[name]              # focused entries are complete
    # The rest is indexed by discovery entry (2026-11-14): the per-capability index grew by ~540 bytes
    # with every capability and crossed the bound at 34. Entries are what the harmonizing AI authored.
    authored = {e["description"]: e for e in
                json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]}
    groups = [e for e in data["catalog"] if "id" not in e]
    listed = [cap for group in groups for cap in group["capabilities"]]
    assert set(listed) | set(in_focus) == set(entries)       # nothing is hidden from the classifier
    assert not set(listed) & set(in_focus) and len(listed) == len(set(listed))
    assert len(groups) == len(authored) - 1                  # the entry wholly in focus leaves nothing to index
    for group in groups:
        source = authored[group["description"]]
        # Live run of 2026-11-14: a group that carried its entry's skill name was read as "another skill's
        # work" and left out of the plan. A group is part of this catalog and names no skill.
        assert group["brief"] is True and set(group) == {"brief", "description", "capabilities", "absorbs"}
        assert group["absorbs"] == source["absorbs"] and "marionette-" not in json.dumps(group["capabilities"])
        assert group["capabilities"] == [cap for cap in source["capabilities"] if cap not in in_focus]
    index = json.loads(brief_all)["catalog"]
    assert all(e["brief"] is True and "id" not in e for e in index) and len(index) == len(authored)
    assert {cap for group in index for cap in group["capabilities"]} == set(entries)
    assert "--focus" in data["instructions"] and "brief" in data["instructions"]
    assert "whole request" in data["instructions"]
    bad = subprocess.run([sys.executable, str(pkg / "muro.py"), "plan", "--compact", "--focus", "ghost", "--task", task,
                          "--project", str(consumer)], capture_output=True, text=True, encoding="utf-8")
    assert bad.returncode == 1 and "ghost" in bad.stderr
    for entry in entries.values():
        assert entry["intents"] and entry["role"] and "outputs" in entry
        for key in ("after", "conflicts", "hooks", "reads", "needs"):
            assert entry.get(key, ["x"]) != [], (entry["id"], key)
        assert entry.get("when") != "—"
    assert entries["figma-design"]["needs"][0]["capability"] == "visual-direction"
    assert entries["gsap-scrolltrigger"]["when"] == "stack:gsap"
    assert entries["css-scroll"]["conflicts"] == ["gsap-scrolltrigger"]
    assert not (consumer / ".marionette").exists()  # still writes nothing

    # The host writes the decision with its file tool, then calls plan on ONE line.
    decision = response(data, ["visual-direction", "figma-design"])
    path = Path(data["classification_path"])
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(decision, ensure_ascii=False), encoding="utf-8")
    nxt = json.loads(run(pkg, consumer, "plan", "--task", task, "--classification", str(path)))
    assert nxt == {"mode": "confirm", "task": task, "plan": ["visual-direction", "figma-design"]}
    assert (consumer / ".marionette" / ".gitignore").read_text(encoding="utf-8").strip() == "*"


def test_python_api_still_returns_the_full_catalog_and_prompt(tmp_path):
    pkg = packaged_marionette(tmp_path)
    full = Coordinator(pkg, tmp_path / "consumer").propose("Converti report.docx in PDF", set())
    assert "semantic decision" in full["instructions"]
    assert any(entry["hooks"] == [] for entry in full["catalog"])


def test_state_dir_is_gitignored_on_first_write(tmp_path):
    pkg = packaged_marionette(tmp_path)
    consumer = tmp_path / "consumer"
    c = Coordinator(pkg, consumer)
    task = "Create workbook and convert it"
    req = c.propose(task, set())
    route = response(req, ["office-authoring", "office-files"])
    plan = c.propose(task, set(), classification=route)["plan"]
    c.confirm(task, plan)
    assert (consumer / ".marionette" / ".gitignore").read_text(encoding="utf-8").strip() == "*"


def test_skill_embeds_rules_uses_one_line_calls_and_preapproves_them_on_claude_code(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    classify = (release / "prompts" / "classify.md").read_text(encoding="utf-8")
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        text = (release / "adapters" / host / "skills" / "muro" / "SKILL.md").read_text(encoding="utf-8")
        front, body = text.split("---", 2)[1], text.split("---", 2)[2]
        assert "## Classification rules" in body
        assert "semantic decision" in body and "catalog_digest" in body
        assert "plan --compact --brief" in body          # the umbrella starts from the index
        assert "--focus <ids>" in body and "marked `brief`" in body
        assert "the plan covers the whole request" in " ".join(body.split())
        assert ".muro/classification.json" in body
        assert "heredoc" in body  # tells the host not to use one
        for discouraged in ("--classification -", "--classification-json", "--step-json"):
            assert discouraged not in body, (host, discouraged)
        assert len(text.splitlines()) < 500 and len(text) < 20000
        if host == "claude-code":
            line = next(l for l in front.splitlines() if l.startswith("allowed-tools:"))
            assert "Bash(python ${CLAUDE_PLUGIN_ROOT}/skills/muro/muro.py *)" in line
            # Live run of 2026-11-14: the host quoted the launcher path and the unquoted rule denied the call.
            assert 'Bash(python "${CLAUDE_PLUGIN_ROOT}/skills/muro/muro.py" *)' in line
            # Owner, 2026-11-14: a step opens its packaged originals without a permission prompt.
            assert "Read(${CLAUDE_PLUGIN_ROOT}/**)" in line and "Read(/${CLAUDE_PLUGIN_ROOT}/**)" in line
            assert "Edit(./.muro/**)" in line
        else:
            assert "allowed-tools" not in front
    assert len(classify) > 1000


def test_index_without_entries_or_for_a_capability_no_entry_lists_stays_per_capability():
    from muro.runtime import focused_catalog
    catalog = [{"id": name, "role": "r-" + name, "when": "—", "after": [], "outputs": ["o-" + name],
                "intents": [{"id": "i." + name, "description": "d " + name, "excludes": ["x"]}]} for name in "abc"]
    line = {"id": "c", "role": "r-c", "brief": True, "intents": [{"id": "i.c", "description": "d c"}]}
    # A package that declares no discovery entries keeps the index of ADR-0015.
    plain = focused_catalog(catalog, {"a"})
    assert [e["id"] for e in plain] == ["a", "b", "c"] and plain[2] == line and "brief" not in plain[0]
    # With entries, a capability outside the focus that no entry lists is still shown, never dropped.
    entries = [{"name": "pkg-ab", "description": "Use when a or b.", "capabilities": ["a", "b"]}]
    mixed = focused_catalog(catalog, {"a"}, entries)
    assert mixed[0]["id"] == "a" and mixed[-1] == line
    assert mixed[1] == {"brief": True, "description": "Use when a or b.", "capabilities": ["b"]}

