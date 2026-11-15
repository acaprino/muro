"""Owner Markdown is evidence for host AI, with version-bound delivery."""
import hashlib
import json
import subprocess
import sys

import pytest

from muro.delivery import load_delivery, validate_delivery, always_on_limit
from muro.factory import harmonize_prompt, prepare_intake
from muro.release import build_release
from muro.runtime import Coordinator


def add_instruction(project, name="recap.md", text="Report progress while waiting.\r\n"):
    path = project / "custom-instructions" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode("utf-8"))
    return path


def binding(project, *, omit=True):
    files = {p.relative_to(project).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted((project / "custom-instructions").rglob("*.md"))}
    digest = hashlib.sha256("".join(f"{p}\n{sha}\n" for p, sha in sorted(files.items())).encode("utf-8")).hexdigest()
    return {"digest": digest, "files": files, "intake_only_paths": list(files) if omit else []}


def deliver(project, *, omit=True):
    custom = binding(project, omit=omit)
    document = {"decisions": [
        {"source": "demo", "content": "Procedure", "form": "capability", "targets": ["x"], "reason": "Original owner."},
        *[{"source": name, "content": "Progress communication", "form": "always-on", "targets": [],
           "reason": "Applies throughout work; original carried in policy."} for name in custom["files"]],
    ], "always_on": "Report progress while waiting.", "custom_instructions": custom}
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return document


def test_preparation_carries_each_file_and_current_digest_without_choosing_delivery(portable_project, tmp_path):
    path = add_instruction(portable_project, "nested/decisioni-à.md")
    output = tmp_path / "prepare"
    source = json.loads((portable_project / "sources.json").read_text())["sources"][0]
    for prepared in (harmonize_prompt(portable_project, output),
                     prepare_intake(source, portable_project, tmp_path / "intake")):
        prompt = (prepared / "PROMPT.md").read_text(encoding="utf-8")
        assert "custom-instructions/nested/decisioni-à.md" in prompt
        assert "Report progress while waiting." in prompt
        assert binding(portable_project)["digest"] in prompt
        assert (prepared / "custom-instructions" / "nested" / "decisioni-à.md").read_bytes() == path.read_bytes()
    assert not (portable_project / "delivery.json").exists()
    path.write_text("Updated instruction", encoding="utf-8")
    harmonize_prompt(portable_project, output)
    assert "Updated instruction" in (output / "PROMPT.md").read_text(encoding="utf-8")


def test_skill_named_original_is_inert_and_retained_bytes_are_checked(portable_project, tmp_path):
    source = add_instruction(portable_project, "SKILL.md")
    deliver(portable_project, omit=False)
    dist = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    root = dist / "adapters" / "codex" / "skills" / "muro"
    original = root / "custom-instructions" / "SKILL.source.md"
    assert original.read_bytes() == source.read_bytes()
    assert not (root / "custom-instructions" / "SKILL.md").exists()
    original.write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="custom-instructions"):
        Coordinator(root, tmp_path / "consumer")


def test_runtime_receipt_never_excuses_a_missing_source_input(portable_project):
    source = add_instruction(portable_project)
    document = deliver(portable_project)
    (portable_project / "custom-instructions.lock.json").write_text(
        json.dumps({"digest": document["custom_instructions"]["digest"]}), encoding="utf-8")
    source.unlink()
    with pytest.raises(ValueError, match="custom-instructions"):
        load_delivery(portable_project)


@pytest.mark.parametrize("mutation", [
    lambda m: m.update(digest="0" * 64),
    lambda m: m.update(intake_only_paths=["custom-instructions/unknown.md"]),
    lambda m: m.update(files={"custom-instructions/../outside.md": "0" * 64}),
    lambda m: m.update(files=[]),
])
def test_invalid_metadata_is_rejected_without_writing(portable_project, mutation):
    add_instruction(portable_project)
    document = deliver(portable_project)
    mutation(document["custom_instructions"])
    path = portable_project / "delivery.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    before = path.read_bytes()
    with pytest.raises(ValueError, match="custom-instructions"):
        load_delivery(portable_project)
    assert path.read_bytes() == before


def test_unharmonized_inputs_and_edits_or_removals_are_rejected(portable_project, tmp_path):
    path = add_instruction(portable_project)
    with pytest.raises(ValueError, match="custom-instructions"):
        load_delivery(portable_project)
    deliver(portable_project)
    Coordinator(portable_project, tmp_path / "consumer")
    path.write_text("Changed requirement", encoding="utf-8")
    with pytest.raises(ValueError, match="custom-instructions"):
        Coordinator(portable_project, tmp_path / "consumer")
    path.unlink()
    with pytest.raises(ValueError, match="custom-instructions"):
        load_delivery(portable_project)


def test_each_file_needs_delivery_but_collection_counts_as_one_policy_source(portable_project):
    add_instruction(portable_project)
    add_instruction(portable_project, "second.md")
    document = deliver(portable_project)
    assert always_on_limit(document) == 6000
    errors = validate_delivery(document, [], {"demo"})
    assert not any("unknown source" in error for error in errors)
    document["decisions"].pop()
    assert any("second.md" in error and "no delivery decision" in error
               for error in validate_delivery(document, [], {"demo"}))


@pytest.mark.parametrize("omit", [False, True])
def test_built_adapters_keep_only_declared_originals_and_run_outside_checkout(portable_project, tmp_path, omit):
    add_instruction(portable_project)
    document = deliver(portable_project, omit=omit)
    dist = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    for root in [dist, *[dist / "adapters" / host / "skills" / "muro"
                         for host in ("claude-code", "codex", "opencode", "pi", "hermes")]]:
        assert (root / "custom-instructions" / "recap.md").exists() is not omit
        assert (root / "custom-instructions.lock.json").is_file()
        if root != dist:
            result = subprocess.run([sys.executable, str(root / "muro.py"), "session-context"],
                                    cwd=tmp_path, capture_output=True, text=True)
            assert result.returncode == 0, result.stderr
            assert document["always_on"] in result.stdout
    assert (portable_project / "custom-instructions" / "recap.md").is_file()


def test_pruned_original_cannot_be_referenced_by_a_capability(portable_project, tmp_path):
    add_instruction(portable_project)
    deliver(portable_project)
    path = portable_project / "capabilities" / "x.md"
    path.write_text(path.read_text().replace("## Sources", "Read <package_root>/custom-instructions/recap.md.\n\n## Sources"))
    with pytest.raises(ValueError, match="intake.only|not packaged"):
        build_release(portable_project / "sources.json", portable_project, tmp_path / "out")


@pytest.mark.parametrize("omit", [False, True])
def test_custom_capability_provenance_builds_with_retained_or_carried_original(portable_project, tmp_path, omit):
    add_instruction(portable_project)
    document = deliver(portable_project, omit=omit)
    document["decisions"][-1].update(form="capability", targets=["x"])
    document.pop("always_on")
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    path = portable_project / "capabilities" / "x.md"
    text = path.read_text(encoding="utf-8")
    text = text.replace("## Sources", "Report progress while waiting.\n\n## Sources")
    text += "\nSource: custom-instructions — custom-instructions/recap.md, entire procedure carried above.\n"
    path.write_text(text, encoding="utf-8")
    dist = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    guide = (dist / "GUIDE.html").read_text(encoding="utf-8")
    assert "custom-instructions/recap.md" in guide


def test_api_response_cannot_overwrite_delivery_after_owner_edits(portable_project, monkeypatch):
    from muro.agent import run_step
    instruction = add_instruction(portable_project)
    document = deliver(portable_project)
    target = portable_project / "delivery.json"
    before = target.read_bytes()

    def endpoint(*args):
        instruction.write_text("A new owner requirement", encoding="utf-8")
        document["always_on"] = "A stale replacement from the endpoint"
        return json.dumps({"files": {"delivery.json": json.dumps(document)}, "notes": "old input"})

    monkeypatch.setattr("muro.agent._post_chat", endpoint)
    manifest = json.loads((portable_project / "sources.json").read_text(encoding="utf-8"))
    with pytest.raises(ValueError, match="custom-instructions changed"):
        run_step("harmonize", None, manifest, portable_project, "https://unused.invalid", "fixture", "", 1,
                 lambda: (1, "custom-instructions changed"))
    assert target.read_bytes() == before
