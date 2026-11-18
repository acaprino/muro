"""taste-skill is absorbed whole: its kit, dealers, checkers and finish gate, not only its text (ADR-0026, ADR-0027).

Until 2026-11-17 the package carried 11 of the skill's 1,631 files and `visual-direction`
told the host to write the page by hand and to disclose that the automated checks had not
run. A real session built a flat page that way and the owner rejected it. These tests read
local package metadata only; the separately recorded source check and build verify the
pinned remote. They do not prove that a model follows the capability.
"""
import json
from pathlib import Path

from muro import parse_capabilities
from muro.delivery import validate_delivery

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
SOURCE = "taste-skill"
COMMIT = "f6b76575f949707b4e3c37cd86cb44b0b98643e8"
RELEASE = "v2.5.1"
CAPABILITY = "visual-direction"
TS = "<package_root>/scripts/taste-skill/"      # a helper command names its path from the package root
RUN_SCRIPTS = ("scripts/gate.mjs", "assets/layout/deal.mjs", "scripts/start.mjs", "scripts/moments.mjs", "scripts/icons.mjs",
               "scripts/photos.mjs", "scripts/copy-lint.mjs", "scripts/consistency.mjs", "assets/layout/check.mjs",
               "scripts/shoot.mjs", "scripts/perf.mjs")


def read_json(name):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


def source():
    return next(item for item in read_json("sources.json")["sources"] if item["id"] == SOURCE)


def capability():
    return next(cap for cap in parse_capabilities(PACKAGE / "capabilities") if cap.id == CAPABILITY)


def test_the_manifest_pins_the_release_and_selects_the_whole_skill_folder():
    src = source()
    assert (src["pin"], src["release"], src["commit"]) == ("release", RELEASE, COMMIT)
    assert src["selected_paths"] == ["skills/taste-skill/**"]
    assert src["excluded_paths"] == [] and "intake_only_paths" not in src
    assert "whole" in src["intake"]["goal"]


def test_images_travel_declared_with_the_files_that_credit_them():
    src = source()
    assert sorted(src["media_paths"]) == ["skills/taste-skill/*.jpg", "skills/taste-skill/*.png", "skills/taste-skill/*.webp"]
    notices = src["notice_paths"]
    assert "skills/taste-skill/assets/photos/photos.json" in notices
    assert "skills/taste-skill/assets/ui/icons/icons-credits.json" in notices
    assert len(notices) == 8 and all(path.startswith("skills/taste-skill/assets/") for path in notices)
    body = capability().body
    assert "photos.mjs credits" in body and '"adapted"' in body        # the source's own rule on showing credits


def test_only_repository_housekeeping_is_declared_omitted():
    declared = [path for entry in source()["omissions"] for path in entry["paths"]]
    assert sorted(declared) == ["README.md", "install.sh"]
    assert all(entry["reason"].strip() for entry in source()["omissions"])


def test_the_step_runs_the_sources_own_tools_from_the_package():
    before_sources = capability().body.split("## Sources", 1)[0]
    for script in RUN_SCRIPTS:
        assert f"node {TS}{script}" in before_sources, script
    assert "copy `<TS>/assets` into `assets`" in before_sources and "assets/starter.html" in before_sources
    assert "gate.mjs --start index.html" in before_sources and "GATE: PASS" in before_sources


def test_the_step_never_says_part_of_its_source_is_missing():
    body = capability().body.split("## Sources", 1)[0].lower()
    for phrase in ("not packaged", "not selected", "is not run", "are not run", "by hand, the"):
        assert phrase not in body, phrase
    assert "chosen, not dealt" not in body


def test_no_check_passes_on_a_disclosure_and_the_gate_result_is_evidence():
    cap = capability()
    assert "automated_gate_disclosed" not in cap.checks
    assert {"checks_run", "finish_gate_closed"} <= set(cap.checks)
    assert set(cap.intent_checks["ui.landing-strategy"]) == {"single_primary_action", "proof_supported"}
    assert {"checks_run", "finish_gate_closed"} <= set(cap.intent_checks["ui.visual-direction"])
    # A direction without a build runs no gate: the two checks may then be not-applicable, and only then.
    assert {"checks_run", "finish_gate_closed"} <= set(cap.check_conditions)
    text = cap.body.split("## Checks", 1)[1].split("## Sources", 1)[0]
    assert "`pass` only for `GATE: PASS`" in text


def test_the_finish_gate_is_an_active_stop_hook_on_the_two_hosts_that_register_hooks():
    cap = capability()
    [hook] = cap.hooks
    assert (hook["event"], hook["policy"]) == ("Stop", "active")
    document = read_json("delivery.json")
    assert validate_delivery(document, parse_capabilities(PACKAGE / "capabilities"),
                             {item["id"] for item in read_json("sources.json")["sources"]}) == []
    wirings = {wiring["host"]: wiring for wiring in document["hooks"] if wiring["capability"] == CAPABILITY}
    assert sorted(wirings) == ["claude-code", "codex"]
    for host, flag in (("claude-code", "claude"), ("codex", "codex")):
        assert wirings[host]["event"] == "Stop" and wirings[host]["matcher"] == ""
        assert wirings[host]["run"] == ["node", "<package_root>/scripts/taste-skill/scripts/gate.mjs", "--hook", flag]
        assert wirings[host]["timeout"] == 600                     # the source's own value for its hook
    forms = [decision["form"] for decision in document["decisions"] if decision["source"] == SOURCE]
    assert sorted(forms) == ["capability", "hook"]


def test_provenance_names_the_pin_and_what_changed():
    sources = capability().body.split("## Sources", 1)[1]
    assert f"Leonxlnx/taste-skill@{COMMIT[:8]}, release {RELEASE}" in sources
    assert "1,631 files" in sources and "ADR-0026" in sources and "ADR-0027" in sources
    assert "Open intake gap" not in sources
