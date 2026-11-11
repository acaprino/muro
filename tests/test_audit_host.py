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
# live rerun recorded in docs/verification/2026-11-11-claude-code-host-test.md is the real check.
INLINE_LIMIT = 20000


def packaged_marionette(tmp_path):
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    shutil.copytree(MARIONETTE / "capabilities", pkg / "capabilities")
    for name in ("ROUTER.md", "sources.json"):
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
    out = run(pkg, consumer, "plan", "--compact", "--task", task)
    assert len(out.encode("utf-8")) < INLINE_LIMIT, len(out.encode("utf-8"))
    data = json.loads(out)
    assert data["mode"] == "classification-required"
    assert data["context"]["task"] == task
    assert len(data["context"]["catalog_digest"]) == 64
    assert len(data["instructions"]) < 400 and "SKILL.md" in data["instructions"]
    assert data["classification_path"].endswith(str(Path(".marionette") / "classification.json"))
    entries = {e["id"]: e for e in data["catalog"]}
    assert len(entries) == 12
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
        assert "plan --compact" in body
        assert ".muro/classification.json" in body
        assert "heredoc" in body  # tells the host not to use one
        for discouraged in ("--classification -", "--classification-json", "--step-json"):
            assert discouraged not in body, (host, discouraged)
        assert len(text.splitlines()) < 500 and len(text) < 20000
        if host == "claude-code":
            line = next(l for l in front.splitlines() if l.startswith("allowed-tools:"))
            assert "Bash(python ${CLAUDE_PLUGIN_ROOT}/skills/muro/muro.py *)" in line
            assert "Edit(./.muro/**)" in line
        else:
            assert "allowed-tools" not in front
    assert len(classify) > 1000
