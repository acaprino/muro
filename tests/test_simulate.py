"""The simulator (ADR-0028 decision 10): one request, classified by the AI, validated by the runtime's rules.

Fixtures supply the AI's answers; they prove the mechanics (the material a classifier gets, the
validation and ordering of its answer, the two engines, the key's handling), never a model's
reasoning. Python here never classifies a request.
"""
import json
import subprocess
import sys
import threading
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
import shutil
from pathlib import Path

import pytest

from muro import project, simulate
from muro.cli import main
from muro.delivery import load_delivery, session_text
from muro.evals import prepare_eval
from muro.mcp import call_tool, tool_definitions
from routing_helpers import INTENTS, ROUTER_HEADER, copy_prompts
from test_release_guide import read_guide

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"
PLUGIN = {"slug": "muro", "name": "Muro", "command": "muro", "version": "0.1.0"}


# --- fixtures -------------------------------------------------------------------------------------

def capability(identifier, role, when, after):
    return (f'---\n{INTENTS}id: {identifier}\nrole: {role}\nwhen: "{when}"\nafter: {json.dumps(after)}\n'
            f'outputs: ["{identifier}"]\nchecks: ["ok"]\n---\n# {identifier}\n## Sources\nSource: demo\n')


@pytest.fixture
def package(tmp_path):
    """A small package without eval cases: x, y (after x) and z (needs the gsap stack)."""
    root = tmp_path / "pkg"
    (root / "capabilities").mkdir(parents=True)
    rows = ""
    for identifier, role, when, after in (("x", "testing", "—", []), ("y", "synthesis", "—", ["x"]),
                                          ("z", "scroll", "stack:gsap", [])):
        (root / "capabilities" / f"{identifier}.md").write_text(capability(identifier, role, when, after),
                                                                encoding="utf-8")
        rows += f"| {identifier} | {role} | {when} | {', '.join(after) or '—'} | {identifier} | testing.verify |\n"
    (root / "ROUTER.md").write_text(ROUTER_HEADER + rows, encoding="utf-8")
    (root / "sources.json").write_text(json.dumps({"plugin": PLUGIN, "sources": [{"id": "demo"}]}), encoding="utf-8")
    copy_prompts(root)
    return root


def make_mp(package_dir, out):
    """A project file as `project.pack` lays it out, minus the inputs and the release the simulator never reads."""
    with zipfile.ZipFile(out, "w") as zf:
        info = zipfile.ZipInfo("mimetype")
        info.compress_type = zipfile.ZIP_STORED
        zf.writestr(info, project.MIMETYPE)
        for path in sorted(package_dir.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(package_dir).as_posix(), compress_type=zipfile.ZIP_DEFLATED)
    return out


@pytest.fixture(scope="module")
def guide(tmp_path_factory):
    """Marionette's guide as a release writes it: the digest and the steps of every documented example."""
    from muro.guide import write_release_guide
    copy = tmp_path_factory.mktemp("guide") / "marionette"
    shutil.copytree(MARIONETTE, copy, ignore=shutil.ignore_patterns(".muro"))
    shutil.copytree(ROOT / "prompts", copy / "prompts")
    manifest = json.loads((copy / "sources.json").read_text(encoding="utf-8"))
    _, parsed = read_guide(write_release_guide(copy, manifest["plugin"], manifest["sources"]))
    return parsed.payload


def decision(context, status="selected", ids=(), reason="Fixture reason.", questions=()):
    """What a host AI would answer, written by the test: the context copied exactly, then the judgment."""
    return {**context, "status": status, "reason": reason, "questions": list(questions),
            "selections": [{"capability": name, "intent": "testing.verify", "reason": f"Fixture: {name}."}
                           for name in ids]}


class Endpoint:
    """An OpenAI-compatible /chat/completions endpoint on 127.0.0.1 that records what it is sent."""

    def __init__(self, content=None, status=200, echo_authorization=False):
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
                outer.requests.append({"authorization": self.headers.get("Authorization"), "body": body,
                                       "path": self.path})
                if echo_authorization:
                    payload = (self.headers.get("Authorization") or "").encode("utf-8")
                else:
                    payload = json.dumps({"choices": [{"message": {"content": content}}]}).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_port}/v1"

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def key(monkeypatch):
    value = "sk-test-" + uuid.uuid4().hex
    monkeypatch.setenv("SIMULATE_TEST_KEY", value)
    return value


# --- prepare --------------------------------------------------------------------------------------

def test_prepare_gives_the_context_the_guide_computes_for_every_documented_example(guide):
    assert len(guide["examples"]) >= 10
    for example in guide["examples"]:
        prepared = simulate.prepare(MARIONETTE, example["task"], example["stack_tokens"])
        assert prepared["context"] == {"task": example["task"], "stack_tokens": sorted(example["stack_tokens"]),
                                       "catalog_digest": guide["catalog_digest"]}
        assert set(prepared) == {"context", "prompt"}


def test_the_prompt_for_a_request_is_built_like_the_prompt_for_a_case(tmp_path):
    prepared = simulate.prepare(MARIONETTE, "Convert my Word document to PDF", [])
    case_prompt = (prepare_eval(MARIONETTE, tmp_path / "eval") / "PROMPT.md").read_text(encoding="utf-8")
    prompt = prepared["prompt"]
    # The catalog and the rules are the very text a case is given.
    assert prompt.split("## Catalog\n\n", 1)[1] == case_prompt.split("## Catalog\n\n", 1)[1]
    # So is the permanent session policy.
    policy = session_text(load_delivery(MARIONETTE))
    assert policy
    assert f"## Permanent session policy\n\n{policy}\n\n" in prompt and f"## Permanent session policy\n\n{policy}\n\n" in case_prompt
    # The one context is shown whole, and nothing of an expectation can reach it.
    assert json.dumps(prepared["context"], ensure_ascii=False, indent=1) in prompt
    assert '"expect"' not in prompt and "semantic decision" in prompt
    classify = (ROOT / "prompts" / "classify.md").read_text(encoding="utf-8")
    assert prompt.endswith("## Rules\n\n" + classify)
    assert (prompt.index("## Permanent session policy\n\n") < prompt.index("## Request (context)\n\n")
            < prompt.index("## Catalog\n\n") < len(prompt) - len("## Rules\n\n" + classify))


def test_prepare_needs_no_eval_cases_and_checks_what_the_runtime_checks(package):
    assert not (package / "eval-cases.json").exists()
    prepared = simulate.prepare(package, "Verify the artifact", ["stack:gsap", "stack:gsap"])
    assert prepared["context"]["stack_tokens"] == ["stack:gsap"]
    with pytest.raises(ValueError, match="nonempty task"):
        simulate.prepare(package, "  ", [])
    with pytest.raises(ValueError, match="stack:"):
        simulate.prepare(package, "Verify the artifact", ["gsap"])
    with pytest.raises(ValueError, match="stack:"):
        simulate.prepare(package, "Verify the artifact", "stack:gsap")
    with pytest.raises(ValueError, match="Conflicting stack"):
        simulate.prepare(package, "Verify the artifact", ["stack:gsap", "stack:css-only"])


def test_prepare_is_rerunnable_and_writes_nothing(package):
    before = sorted(p.relative_to(package).as_posix() for p in package.rglob("*"))
    first = simulate.prepare(package, "Verify the artifact", [])
    assert simulate.prepare(package, "Verify the artifact", []) == first
    assert sorted(p.relative_to(package).as_posix() for p in package.rglob("*")) == before


# --- check ----------------------------------------------------------------------------------------

def test_check_of_a_documented_example_gives_its_steps_in_order(guide):
    for example in guide["examples"]:
        context = simulate.prepare(MARIONETTE, example["task"], example["stack_tokens"])["context"]
        answer = {**context, "status": example["status"], "selections": example["selections"],
                  "reason": example["reason"], "questions": example["questions"]}
        result = simulate.check(MARIONETTE, context, answer)
        assert result["valid"] is True, (example["title"], result)
        assert result["status"] == example["status"]
        assert [s["step_id"] for s in result["steps"]] == [s["step"] for s in example["steps"]]
        assert [s["capability"] for s in result["steps"]] == [s["capability"] for s in example["steps"]]
        assert [s["intent"] for s in result["steps"]] == [s["intent"] for s in example["steps"]]
        assert result["reason"] == example["reason"] and result["questions"] == example["questions"]
        assert set(result) == {"valid", "status", "steps", "reason", "questions"}
        for step in result["steps"]:
            assert set(step) == {"step_id", "capability", "intent", "reason", "added_as_prerequisite"}
    assert {example["status"] for example in guide["examples"]} >= {"selected"}


def test_a_prerequisite_the_runtime_adds_is_marked_and_has_no_intent_or_reason_of_the_ai(package):
    context = simulate.prepare(package, "Synthesize the evidence", [])["context"]
    result = simulate.check(package, context, decision(context, ids=["y"]))
    assert result["valid"] is True
    assert result["steps"] == [
        {"step_id": "x", "capability": "x", "intent": None, "reason": None, "added_as_prerequisite": True},
        {"step_id": "y", "capability": "y", "intent": "testing.verify", "reason": "Fixture: y.",
         "added_as_prerequisite": False}]


def test_the_order_is_the_runtimes_not_the_answers(package):
    context = simulate.prepare(package, "Verify then synthesize", [])["context"]
    result = simulate.check(package, context, decision(context, ids=["y", "x"]))
    assert [s["step_id"] for s in result["steps"]] == ["x", "y"]
    assert [s["added_as_prerequisite"] for s in result["steps"]] == [False, False]


def test_simulate_rejects_an_answer_with_a_capability_outside_the_catalog():
    context = simulate.prepare(MARIONETTE, "Do something with a made-up capability", [])["context"]
    result = simulate.check(MARIONETTE, context, decision(context, ids=["ghost-capability"]))
    assert result == {"valid": False, "errors": ["Unknown capability in AI classification: ghost-capability"]}


def test_a_no_match_answer_is_valid_and_has_no_steps(package):
    context = simulate.prepare(package, "Plan my holiday", [])["context"]
    result = simulate.check(package, context, decision(context, status="no_match", reason="Outside the catalog."))
    assert result == {"valid": True, "status": "no_match", "steps": [], "reason": "Outside the catalog.",
                      "questions": []}


def test_a_clarification_answer_is_valid_and_carries_its_questions(package):
    context = simulate.prepare(package, "Make it better", [])["context"]
    result = simulate.check(package, context, decision(context, status="needs_clarification",
                                                       reason="Which artifact?", questions=["Which one?"]))
    assert result == {"valid": True, "status": "needs_clarification", "steps": [], "reason": "Which artifact?",
                      "questions": ["Which one?"]}


def bad_answers(context):
    ok = decision(context, ids=["x"])
    return {
        "not-an-object": "selected", "a-list": [], "null": None, "empty-object": {},
        "extra-field": {**ok, "extra": 1},
        "another-task": {**ok, "task": "something else"},
        "another-stack": {**ok, "stack_tokens": ["stack:gsap"]},
        "stale-digest": {**ok, "catalog_digest": "0" * 64},
        "unknown-status": {**ok, "status": "maybe"},
        "status-not-text": {**ok, "status": ["selected"]},
        "selected-without-selections": decision(context, ids=[]),
        "no-match-with-a-selection": decision(context, status="no_match", ids=["x"]),
        "clarification-without-questions": decision(context, status="needs_clarification"),
        "empty-reason": {**ok, "reason": " "},
        "unknown-capability": decision(context, ids=["ghost"]),
        "unknown-intent": {**ok, "selections": [{"capability": "x", "intent": "nope", "reason": "r"}]},
        "duplicate-step": decision(context, ids=["x", "x"]),
        "selection-not-an-object": {**ok, "selections": ["x"]},
        "capability-not-text": {**ok, "selections": [{"capability": 1, "intent": "testing.verify", "reason": "r"}]},
        "needs-without-a-declared-prerequisite": {**ok, "selections": [{**ok["selections"][0], "needs": []}]},
        "step-id-of-another-capability": {**ok, "selections": [{**ok["selections"][0], "step_id": "y#1"}]},
        "constraint-the-context-lacks": decision(context, ids=["z"]),
    }


def test_every_invalid_answer_is_reported_as_invalid_and_nothing_is_repaired(package):
    context = simulate.prepare(package, "Verify the artifact", [])["context"]
    for name, answer in bad_answers(context).items():
        result = simulate.check(package, context, answer)
        assert set(result) == {"valid", "errors"}, name
        assert result["valid"] is False and result["errors"] and all(isinstance(e, str) and e for e in result["errors"]), name
    # The constraint is the runtime's rule: with the token in the context the same selection is valid.
    with_stack = simulate.prepare(package, "Verify the artifact", ["stack:gsap"])["context"]
    assert simulate.check(package, with_stack, decision(with_stack, ids=["z"]))["valid"] is True
    assert "Incompatible constraints for z" in simulate.check(
        package, context, decision(context, ids=["z"]))["errors"][0]


def test_a_context_that_is_not_the_one_prepared_here_is_invalid(package):
    context = simulate.prepare(package, "Verify the artifact", [])["context"]
    for broken in ({}, {"task": "t"}, {**context, "extra": 1}, {**context, "task": " "}, {**context, "task": 5},
                   {**context, "stack_tokens": "stack:gsap"}, {**context, "stack_tokens": ["gsap"]},
                   {**context, "catalog_digest": "0" * 64}, "context", None):
        result = simulate.check(package, broken, decision(context, ids=["x"]))
        assert result["valid"] is False and result["errors"], broken
        assert set(result) == {"valid", "errors"}
    # Not the context prepare makes: its stack tokens are sorted.
    two = simulate.prepare(package, "Verify the artifact", ["stack:b", "stack:a"])["context"]
    assert two["stack_tokens"] == ["stack:a", "stack:b"]
    unsorted = {**two, "stack_tokens": ["stack:b", "stack:a"]}
    assert simulate.check(package, unsorted, decision(unsorted, ids=["x"]))["valid"] is False
    assert simulate.check(package, two, decision(two, ids=["x"]))["valid"] is True


def test_a_catalog_that_changed_since_the_context_was_prepared_is_invalid(package):
    context = simulate.prepare(package, "Verify the artifact", [])["context"]
    path = package / "capabilities" / "x.md"
    path.write_text(path.read_text(encoding="utf-8") + "\nA changed body.\n", encoding="utf-8")
    result = simulate.check(package, context, decision(context, ids=["x"]))
    assert result["valid"] is False and "prepare again" in result["errors"][0]


# --- the API engine -------------------------------------------------------------------------------

def test_simulate_api_answer_is_validated_like_a_runtime_decision(package, key):
    context = simulate.prepare(package, "Synthesize the evidence", [])["context"]
    good = decision(context, ids=["y"])
    # A model often wraps its JSON: the first JSON object of the text is the answer.
    wrapped = "Here is my decision:\n```json\n" + json.dumps(good) + "\n```\nHope it helps {not json}."
    with Endpoint(content=wrapped) as endpoint:
        result = simulate.simulate_api(package, "Synthesize the evidence", [], api_base=endpoint.base,
                                       model="test-model", api_key_env="SIMULATE_TEST_KEY")
    assert result == {**simulate.check(package, context, good), "engine": "api", "model": "test-model"}
    assert [s["step_id"] for s in result["steps"]] == ["x", "y"]
    (sent,) = endpoint.requests
    assert sent["path"] == "/v1/chat/completions" and sent["authorization"] == f"Bearer {key}"
    assert sent["body"]["model"] == "test-model"
    assert sent["body"]["messages"] == [{"role": "user", "content": simulate.prepare(package, "Synthesize the evidence", [])["prompt"]}]

    invalid = decision(context, ids=["ghost"])
    with Endpoint(content=json.dumps(invalid)) as endpoint:
        result = simulate.simulate_api(package, "Synthesize the evidence", [], api_base=endpoint.base,
                                       model="test-model", api_key_env="SIMULATE_TEST_KEY")
    assert result == {"valid": False, "errors": ["Unknown capability in AI classification: ghost"],
                      "engine": "api", "model": "test-model"}


def test_simulate_api_reports_an_answer_without_json_as_invalid(package, key):
    with Endpoint(content="I would pick x, I think.") as endpoint:
        result = simulate.simulate_api(package, "Verify the artifact", [], api_base=endpoint.base,
                                       model="m", api_key_env="SIMULATE_TEST_KEY")
    assert result == {"valid": False, "errors": ["the answer holds no JSON object"], "engine": "api", "model": "m"}


def test_simulate_api_failures_are_errors_not_answers(package, key, monkeypatch):
    with Endpoint(status=500, content="x") as endpoint:
        with pytest.raises(ValueError, match="endpoint returned 500"):
            simulate.simulate_api(package, "Verify the artifact", [], api_base=endpoint.base, model="m",
                                  api_key_env="SIMULATE_TEST_KEY")
    with pytest.raises(ValueError, match="https"):
        simulate.simulate_api(package, "Verify the artifact", [], api_base="http://example.com/v1", model="m",
                              api_key_env="SIMULATE_TEST_KEY")
    monkeypatch.delenv("MURO_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="MURO_API_KEY or OPENAI_API_KEY"):
        simulate.simulate_api(package, "Verify the artifact", [], api_base="https://example.com/v1", model="m")


def test_simulate_never_writes_or_prints_the_key(tmp_path, package, key, capsys):
    mp = make_mp(package, tmp_path / "project.mp")
    cache = tmp_path / "cache"
    args = ["project", "simulate", str(mp), "--cache", str(cache), "--task", "Verify the artifact",
            "--model", "m", "--api-key-env", "SIMULATE_TEST_KEY"]
    context = simulate.prepare(package, "Verify the artifact", [])["context"]
    outputs = []
    with Endpoint(content=json.dumps(decision(context, ids=["x"]))) as endpoint:
        assert main(args + ["--api-base", endpoint.base]) == 0
        outputs.append(capsys.readouterr())
    # An endpoint that echoes the Authorization header back in its error body must not carry it into a message.
    with Endpoint(status=401, echo_authorization=True) as endpoint:
        assert main(args + ["--api-base", endpoint.base]) == 1
        outputs.append(capsys.readouterr())
    with pytest.raises(ValueError) as caught:
        with Endpoint(status=401, echo_authorization=True) as endpoint:
            simulate.simulate_api(package, "Verify the artifact", [], api_base=endpoint.base, model="m",
                                  api_key_env="SIMULATE_TEST_KEY")
    assert "endpoint returned 401" in str(caught.value)
    outputs.append(str(caught.value))
    # The name given by mistake as the key itself is not repeated either.
    assert main(["project", "simulate", str(mp), "--cache", str(cache), "--task", "t", "--model", "m",
                 "--api-key-env", key + "-not-a-variable"]) == 1
    outputs.append(capsys.readouterr())
    text = "".join(o if isinstance(o, str) else o.out + o.err for o in outputs)
    assert key not in text and text
    # No file under the package, the cache or the temporary folder holds it.
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert key.encode() not in path.read_bytes(), path


# --- the command line -----------------------------------------------------------------------------

def run(capsys, *argv):
    code = main(list(argv))
    out = capsys.readouterr()
    return code, out.out, out.err


def test_simulate_prepare_and_check_read_a_project_file_through_the_cache(tmp_path, package, capsys):
    mp = make_mp(package, tmp_path / "project.mp")
    cache = tmp_path / "cache"
    code, out, err = run(capsys, "project", "simulate-prepare", str(mp), "--cache", str(cache),
                         "--task", "Synthesize the evidence", "--stack", "stack:gsap")
    assert code == 0 and err == ""
    prepared = json.loads(out)
    assert prepared == simulate.prepare(package, "Synthesize the evidence", ["stack:gsap"])
    assert [p.name for p in cache.iterdir()] == [project.digest(mp)]

    (tmp_path / "context.json").write_text(json.dumps(prepared["context"]), encoding="utf-8")
    (tmp_path / "answer.json").write_text(json.dumps(decision(prepared["context"], ids=["y"])), encoding="utf-8")
    code, out, err = run(capsys, "project", "simulate-check", str(mp), "--cache", str(cache),
                         "--context", str(tmp_path / "context.json"), "--answer", str(tmp_path / "answer.json"))
    assert code == 0 and err == ""
    assert json.loads(out) == simulate.check(package, prepared["context"], decision(prepared["context"], ids=["y"]))
    assert [s["step_id"] for s in json.loads(out)["steps"]] == ["x", "y"]
    assert len(list(cache.iterdir())) == 1                       # unpacked once for the same bytes


def test_simulate_check_takes_a_manifest_and_reports_an_invalid_answer_as_a_result(tmp_path, package, capsys):
    context = simulate.prepare(package, "Verify the artifact", [])["context"]
    (tmp_path / "context.json").write_text(json.dumps(context), encoding="utf-8")
    (tmp_path / "answer.json").write_text(json.dumps(decision(context, ids=["ghost"])), encoding="utf-8")
    code, out, err = run(capsys, "project", "simulate-check", "--manifest", str(package / "sources.json"),
                         "--context", str(tmp_path / "context.json"), "--answer", str(tmp_path / "answer.json"))
    # An invalid decision is what the simulation found, not a failure to run it: the result says so.
    assert code == 0 and err == ""
    assert json.loads(out) == {"valid": False, "errors": ["Unknown capability in AI classification: ghost"]}


def test_simulate_commands_refuse_what_they_cannot_read(tmp_path, package, capsys):
    mp = make_mp(package, tmp_path / "project.mp")
    code, out, err = run(capsys, "project", "simulate-prepare", str(mp), "--manifest", str(package / "sources.json"),
                         "--cache", str(tmp_path / "cache"), "--task", "t")
    assert code == 1 and out == "" and "not both" in err
    code, out, err = run(capsys, "project", "simulate-prepare", str(tmp_path / "missing.mp"),
                         "--cache", str(tmp_path / "cache"), "--task", "t")
    assert code == 1 and out == "" and err.startswith("Simulation failed:")
    (tmp_path / "notes.txt").write_text("not a project", encoding="utf-8")
    code, out, err = run(capsys, "project", "simulate-prepare", str(tmp_path / "notes.txt"),
                         "--cache", str(tmp_path / "cache"), "--task", "t")
    assert code == 1 and "Not a Muro project file" in err
    code, out, err = run(capsys, "project", "simulate-prepare", "--manifest", str(package / "sources.json"), "--task", " ")
    assert code == 1 and "nonempty task" in err
    (tmp_path / "context.json").write_text("{", encoding="utf-8")
    (tmp_path / "answer.json").write_text("{}", encoding="utf-8")
    code, out, err = run(capsys, "project", "simulate-check", "--manifest", str(package / "sources.json"),
                         "--context", str(tmp_path / "context.json"), "--answer", str(tmp_path / "answer.json"))
    assert code == 1 and out == "" and "context" in err
    with pytest.raises(SystemExit):
        main(["project", "simulate-prepare", "--manifest", str(package / "sources.json")])     # --task is required


def test_simulate_through_the_command_line_with_an_endpoint(tmp_path, package, key, capsys):
    context = simulate.prepare(package, "Synthesize the evidence", [])["context"]
    mp = make_mp(package, tmp_path / "project.mp")
    with Endpoint(content=json.dumps(decision(context, ids=["y"]))) as endpoint:
        code, out, err = run(capsys, "project", "simulate", str(mp), "--cache", str(tmp_path / "cache"),
                             "--task", "Synthesize the evidence", "--model", "test-model",
                             "--api-base", endpoint.base, "--api-key-env", "SIMULATE_TEST_KEY")
    assert code == 0 and err == ""
    result = json.loads(out)
    assert result["valid"] is True and result["engine"] == "api" and result["model"] == "test-model"
    assert [s["step_id"] for s in result["steps"]] == ["x", "y"]


# --- the MCP tools --------------------------------------------------------------------------------

def test_the_mcp_tools_return_what_the_functions_return(tmp_path, package, monkeypatch):
    names = {tool["name"]: tool for tool in tool_definitions()}
    assert {"simulate_prepare", "simulate_check"} <= set(names)
    assert names["simulate_prepare"]["inputSchema"]["required"] == ["task"]
    assert names["simulate_check"]["inputSchema"]["required"] == ["context", "answer"]
    manifest = package / "sources.json"
    code, text = call_tool("simulate_prepare", {"task": "Synthesize the evidence", "stack": ["stack:gsap"]}, manifest)
    prepared = simulate.prepare(package, "Synthesize the evidence", ["stack:gsap"])
    assert code == 0 and json.loads(text) == prepared
    for answer in (decision(prepared["context"], ids=["y"]), decision(prepared["context"], ids=["ghost"])):
        code, text = call_tool("simulate_check", {"context": prepared["context"], "answer": answer}, manifest)
        assert code == 0 and json.loads(text) == simulate.check(package, prepared["context"], answer)
    # A project file instead of a manifest, unpacked into the user's cache.
    monkeypatch.setattr(project, "default_cache_root", lambda: tmp_path / "cache")
    mp = make_mp(package, tmp_path / "project.mp")
    code, text = call_tool("simulate_prepare", {"project": str(mp), "task": "Synthesize the evidence",
                                                "stack": ["stack:gsap"]}, MARIONETTE / "sources.json")
    assert code == 0 and json.loads(text) == prepared
    assert [p.name for p in (tmp_path / "cache").iterdir()] == [project.digest(mp)]
    # A request the factory refuses comes back as a tool error with the reason.
    code, text = call_tool("simulate_prepare", {"task": " "}, manifest)
    assert code == 1 and "nonempty task" in text
    code, text = call_tool("simulate_check", {"context": prepared["context"], "answer": "yes"}, manifest)
    assert code == 0 and json.loads(text)["valid"] is False


def test_a_harness_can_simulate_through_the_stdio_server(package):
    prepared = simulate.prepare(package, "Synthesize the evidence", [])
    answer = decision(prepared["context"], ids=["y"])
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
         "params": {"name": "simulate_prepare", "arguments": {"task": "Synthesize the evidence"}}},
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
         "params": {"name": "simulate_check", "arguments": {"context": prepared["context"], "answer": answer}}},
    ]
    done = subprocess.run([sys.executable, "-m", "muro", "mcp", "--manifest", str(package / "sources.json")],
                          input="".join(json.dumps(r) + "\n" for r in requests), capture_output=True, text=True,
                          cwd=ROOT, timeout=120)
    assert done.returncode == 0, done.stderr
    by_id = {r["id"]: r for r in map(json.loads, filter(str.strip, done.stdout.splitlines()))}
    assert {"simulate_prepare", "simulate_check"} <= {t["name"] for t in by_id[2]["result"]["tools"]}
    assert by_id[3]["result"]["isError"] is False
    assert json.loads(by_id[3]["result"]["content"][0]["text"]) == prepared
    assert by_id[4]["result"]["isError"] is False
    checked = json.loads(by_id[4]["result"]["content"][0]["text"])
    assert checked["valid"] is True and [s["step_id"] for s in checked["steps"]] == ["x", "y"]
