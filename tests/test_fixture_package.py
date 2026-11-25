"""The fixture package the factory's own tests borrow (`tests/fixtures/package`) validates as a whole.

It is invented: its sources are remotes that do not exist, so nothing here fetches or builds. These tests
hold the fixture to the factory's own validation and to the features other tests rely on, so a later edit
cannot quietly break it. They prove nothing about a real package or about an AI's reasoning.
"""
import json

from muro import check_sources, parse_capabilities, parse_router, validate_plugin_identity
from muro import guide
from muro.cli import main
from muro.core import validate_capabilities_and_router
from muro.custom_instructions import provenance_ids
from muro.delivery import load_delivery, session_text, validate_delivery
from muro.entries import load_entries, validate_entries
from muro.evals import CASES_FILE, prepare_eval, validate_cases
from muro.runtime import Coordinator
from routing_helpers import FIXTURE, copy_fixture, response

FILES = {"ROUTER.md", "capabilities", "custom-instructions", "delivery.json", "entries.json", "eval-cases.json",
         "guide-examples.json", "sources.json"}
CAPABILITIES = ["story-brief", "series-concept", "pacing-spec", "scroll-build-gsap", "scroll-build-css",
                "newsletter-edition", "manuscript-files", "fact-check"]


def manifest():
    return json.loads((FIXTURE / "sources.json").read_text(encoding="utf-8"))


def capabilities():
    return {cap.id: cap for cap in parse_capabilities(FIXTURE / "capabilities")}


def test_the_fixture_holds_its_files_and_nothing_a_test_left_behind():
    # A test that writes in the fixture itself (a state folder, a workbench) breaks every test after it:
    # tests write in a copy (`copy_fixture`).
    assert {path.name for path in FIXTURE.iterdir()} == FILES
    assert not (FIXTURE / "prompts").exists() and not (FIXTURE / "muro").exists()   # the factory's are used


def test_capabilities_and_router_are_valid_and_name_registered_sources():
    caps = list(capabilities().values())
    rows = parse_router(FIXTURE / "ROUTER.md")
    document = manifest()
    sources = provenance_ids({source["id"] for source in document["sources"]}, load_delivery(FIXTURE))
    assert validate_capabilities_and_router(caps, rows, sources, plugin_slug=document["plugin"]["slug"]) == []
    assert [row.id for row in rows] == CAPABILITIES
    assert all(cap.after == [] and cap.hooks == [] for cap in caps)   # tests add edges and hooks by mutation


def test_the_manifest_and_the_plugin_identity_are_valid_without_a_remote():
    document = manifest()
    plugin = document["plugin"]
    assert validate_plugin_identity(plugin) == []
    assert plugin["slug"] != "muro" and plugin["command"] == plugin["slug"]   # the state folder takes the slug
    assert check_sources(document, FIXTURE, offline_pins=True) == []
    assert {source["id"]: (source["pin"], source.get("release")) for source in document["sources"]} == {
        "editorial-desk": ("release", "v2.1.0"), "scroll-stories": ("head", None)}
    # Every source is a remote that offline pins skip: nothing in the fixture can be fetched or built.
    assert all(source["repo_url"].startswith("https://example.invalid/") for source in document["sources"])


def test_the_cli_validates_the_fixture_and_checks_its_pins_offline(capsys):
    path = str(FIXTURE / "sources.json")
    assert main(["validate", "--manifest", path]) == 0
    assert capsys.readouterr().out.strip() == "OK: capabilities and ROUTER.md valid"
    assert main(["check-sources", "--manifest", path, "--offline-pins"]) == 0
    assert "skipped remote fetch (--offline-pins)" in capsys.readouterr().out


def test_entries_cover_every_capability_and_absorb_every_replaced_name():
    document = load_entries(FIXTURE)
    plugin = manifest()["plugin"]
    assert validate_entries(document, list(capabilities().values()), plugin) == []
    entries = document["entries"]
    assert len(entries) == 3
    assert sorted(cap for entry in entries for cap in entry["capabilities"]) == sorted(CAPABILITIES)
    assert sorted(name for entry in entries for name in entry["absorbs"]) == sorted(plugin["replaces"])
    # One entry lies wholly inside a focus of three capabilities, so a focused plan has nothing of it to index.
    assert entries[0]["capabilities"] == ["story-brief", "series-concept", "newsletter-edition"]


def test_delivery_decides_every_source_and_the_owner_markdown_and_carries_a_session_policy():
    document = load_delivery(FIXTURE)   # also binds the owner Markdown to its recorded bytes
    sources = {source["id"] for source in manifest()["sources"]}
    assert validate_delivery(document, list(capabilities().values()), sources) == []
    custom = document["custom_instructions"]
    assert list(custom["files"]) == ["custom-instructions/plain-words.md"]
    assert {decision["source"] for decision in document["decisions"]} == sources | set(custom["files"])
    assert session_text(document)
    assert {decision["form"] for decision in document["decisions"]} == {"capability", "always-on"}
    assert set(document) == {"decisions", "always_on", "custom_instructions"}   # no hook, server or key


def test_guide_examples_resolve_to_steps_and_cover_a_repeated_capability_and_a_no_match():
    document = manifest()
    data = guide.guide_data(FIXTURE, document["plugin"], document["sources"], packaged=False)
    examples = {example["title"]: example for example in data["examples"]}
    assert len(examples) == len(json.loads((FIXTURE / "guide-examples.json").read_text(encoding="utf-8"))["examples"]) == 4
    assert [example["status"] for example in examples.values()] == ["selected", "selected", "selected", "no_match"]
    assert [step["step"] for step in examples["Fact check of a draft"]["steps"]] == ["fact-check"]
    path = examples["A scroll story from the brief to the build"]
    assert path["stack_tokens"] == ["stack:gsap"]
    assert [step["step"] for step in path["steps"]] == ["story-brief", "pacing-spec", "scroll-build-gsap"]
    repeated = examples["Two operations on manuscript files"]
    assert repeated["steps"] == [
        {"step": "manuscript-files#1", "capability": "manuscript-files", "intent": "files.extraction"},
        {"step": "manuscript-files#2", "capability": "manuscript-files", "intent": "files.conversion"}]
    assert examples["A request outside the catalog"]["steps"] == []


def test_eval_cases_are_valid_and_cover_every_status_and_kind_of_route(tmp_path):
    document = json.loads((FIXTURE / CASES_FILE).read_text(encoding="utf-8"))
    assert validate_cases(document, list(capabilities().values())) == []
    out = prepare_eval(FIXTURE, tmp_path / "eval")   # validates every authored route against the catalog
    assert len(json.loads((out / "contexts.json").read_text(encoding="utf-8"))) == len(document["cases"]) == 8
    cases = {case["id"]: case["expect"] for case in document["cases"]}
    assert {expect["status"] for expect in cases.values()} == {"selected", "no_match", "needs_clarification"}
    assert "selections" not in cases["check-facts"]                                      # capability-only gold
    assert cases["angle-only"]["selections"][0]["intent"] == "story.angle"               # not the first intent
    assert cases["new-story-newsletter"]["selections"][1]["needs"] == [{"requires": "story-brief", "applies": True}]
    assert cases["digest-newsletter"]["selections"][0]["needs"] == [{"requires": "story-brief", "applies": False}]
    assert [s["step_id"] for s in cases["extract-then-convert"]["selections"]] == ["manuscript-files#1",
                                                                                 "manuscript-files#2"]
    assert next(case for case in document["cases"] if case["id"] == "scroll-with-gsap")["stack_tokens"] == ["stack:gsap"]


def test_the_catalog_keeps_the_features_other_tests_rely_on():
    caps = capabilities()
    brief, rival = caps["story-brief"], caps["series-concept"]
    assert brief.resumable and [cap.id for cap in caps.values() if cap.resumable] == ["story-brief"]
    assert [intent["id"] for intent in brief.intents] == ["story.brief", "story.angle"]
    assert brief.intent_checks == {"story.brief": ["audience_named", "outline_ordered"],
                                   "story.angle": ["audience_named", "angle_single"]}
    assert list(brief.check_conditions) == ["outline_ordered"] and len(brief.outputs) >= 3
    assert "<package_root>/scripts/editorial-desk/" in brief.body
    assert rival.conflicts == ["story-brief"] and brief.conflicts == ["series-concept"]
    assert len(rival.intents) == 1 and not rival.intent_checks      # one check scope: it can be an `after` target
    spec = caps["pacing-spec"]
    assert spec.reads == ["angle", "outline"] and set(spec.reads) <= set(brief.outputs) and len(spec.outputs) == 2
    gsap, css = caps["scroll-build-gsap"], caps["scroll-build-css"]
    assert (gsap.when, css.when) == ("stack:gsap", "stack:css-only") and gsap.role == css.role
    assert gsap.conflicts == [css.id] and css.conflicts == [gsap.id]
    assert gsap.reads == css.reads == spec.outputs
    consumer = caps["newsletter-edition"]
    assert [tool["required"] for tool in consumer.tools] == [True]
    assert [need["capability"] for need in consumer.needs] == ["story-brief"]
    assert len(consumer.needs[0]["label"].split()) <= 5 and consumer.reads
    files = caps["manuscript-files"]
    assert [intent["id"] for intent in files.intents] == ["files.editing", "files.conversion", "files.extraction"]
    scoped_once = [check for check in files.checks
                   if sum(check in names for names in files.intent_checks.values()) == 1]
    assert scoped_once == ["structure_read_before_edit", "edit_verified"] and not files.resumable
    assert len(files.check_conditions) == 2
    plain = caps["fact-check"]
    assert len(plain.intents) == 1 and list(plain.check_conditions) == ["corrections_listed"]
    assert plain.conflicts == [] and plain.tools == [] and not plain.intent_checks
    assert manifest()["stack"]["conflicts"] == [["stack:gsap", "stack:css-only"]]


def test_a_copy_of_the_fixture_runs_under_its_own_slug_and_plans_its_documented_path(tmp_path):
    package = copy_fixture(tmp_path / "package")
    assert (package / "prompts" / "classify.md").is_file()
    coordinator = Coordinator(package, tmp_path / "consumer")
    assert coordinator.state_dir == tmp_path / "consumer" / ".pressroom"
    task = "Plan a new story, decide how it moves and build it with GSAP"
    request = coordinator.propose(task, {"stack:gsap"})
    assert [entry["id"] for entry in request["catalog"]] == CAPABILITIES
    plan = ["story-brief", "pacing-spec", "scroll-build-gsap"]
    result = coordinator.propose(task, {"stack:gsap"}, classification=response(request, plan))
    assert result == {"mode": "confirm", "task": task, "plan": plan}
    assert not (tmp_path / "consumer").exists()   # a proposal writes nothing
