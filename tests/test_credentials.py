"""API keys declared as data: the `credentials` of `delivery.json` (owner request of 2026-11-24).

A credential names an environment variable and says what it unlocks. It has no field for a value, so nothing the
factory reads or writes can hold a secret. Python checks shape and references and orders nothing but by `rank`; which
keys a package needs, what each unlocks and their order are the AI's and the owner's. Every name here is made up
(EXAMPLE_API_KEY, DEMO_TOKEN): no real service appears in the factory or in this file.
"""
import re
from pathlib import Path

import pytest

from muro import credentials, delivery
from muro.credentials import ENV_NAME, USED_BY, credential_errors, declared_credentials, in_order
from muro.delivery import validate_delivery

PROMPTS = Path(__file__).resolve().parent.parent / "prompts"
SECRET = "sk-live-0123456789abcdef"


class Cap:
    def __init__(self, identifier, hooks=()):
        self.id = identifier
        self.hooks = list(hooks)


def doc(**over):
    base = {"decisions": [{"source": "demo", "content": "The whole skill.", "form": "capability",
                           "targets": ["x"], "reason": "One task-specific procedure."}]}
    base.update(over)
    return base


def entry(**over):
    base = {"env": "EXAMPLE_API_KEY", "service": "Example service", "required": True,
            "unlocks": "Looking things up in the example service."}
    base.update(over)
    return base


def errors_for(**over):
    return validate_delivery(doc(**over), [Cap("x")], {"demo"})


def check(document, capabilities=("x",), sources=("demo",)):
    return credential_errors(document, set(capabilities), set(sources))


FULL = entry(rank=1, route="The variable, or the file the source reads.",
             used_by={"sources": ["demo"], "capabilities": ["x"], "tools": ["demo/lookup"]})


def review(*ids):
    return {"tools": [{"id": identifier, "effect": "none"} for identifier in ids]}


# --- The one pattern for a variable's name -------------------------------------------------------------------

def test_the_pattern_of_a_variable_name_has_one_copy():
    # delivery.py checks the env of a server and of a tool with it; credentials.py owns it (moved, not copied).
    assert delivery._ENV_NAME is credentials.ENV_NAME is ENV_NAME
    assert all(ENV_NAME.fullmatch(name) for name in ("EXAMPLE_API_KEY", "_x", "a1", "Mixed_Case"))
    assert not any(ENV_NAME.fullmatch(name) for name in ("", "1A", "A-B", "A B", "A=1", "A.B"))


# --- A package without credentials behaves as before ---------------------------------------------------------

def test_a_document_without_credentials_is_checked_as_before():
    assert errors_for() == []
    assert check(doc()) == []
    assert check(None) == [] and check([]) == [] and check("credentials") == []
    assert declared_credentials(doc()) == [] and declared_credentials(None) == []


def test_an_empty_list_declares_nothing():
    assert errors_for(credentials=[]) == []
    assert declared_credentials(doc(credentials=[])) == []


def test_the_document_accepts_the_key_and_the_message_lists_it():
    assert errors_for(credentials=[entry()]) == []
    message = errors_for(extra=1)[0]
    assert "credentials" in message and message.startswith("delivery.json must be an object with decisions and only ")


# --- A valid declaration -------------------------------------------------------------------------------------

def test_a_declaration_with_every_optional_field_is_valid():
    assert errors_for(credentials=[FULL, entry(env="DEMO_TOKEN", required=False, service="Demo", unlocks="Demo.")]) == []


def test_the_minimal_entry_is_valid():
    assert check(doc(credentials=[entry()])) == []


# --- Shape ---------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("value, message", [
    ({}, "credentials must be a list"),
    ("EXAMPLE_API_KEY", "credentials must be a list"),
    ([None], "credentials[0] must be an object"),
    (["EXAMPLE_API_KEY"], "credentials[0] must be an object"),
    ([entry(), []], "credentials[1] must be an object"),
])
def test_the_list_and_its_entries_are_objects(value, message):
    errors = check(doc(credentials=value))
    assert any(message in error for error in errors), errors


@pytest.mark.parametrize("missing", ["env", "service", "required", "unlocks"])
def test_each_required_key_is_required(missing):
    errors = check(doc(credentials=[{k: v for k, v in entry().items() if k != missing}]))
    assert errors == [f"credentials[0] lacks {missing}"]


@pytest.mark.parametrize("key", ["value", "secret", "token", "default", "note"])
def test_there_is_no_field_for_a_value_and_none_is_accepted(key):
    errors = check(doc(credentials=[entry(**{key: SECRET})]))
    assert len(errors) == 1 and "has no field for a value" in errors[0] and key in errors[0]
    assert SECRET not in errors[0]


@pytest.mark.parametrize("env", ["not a name", "1ABC", "A-B", "", None, 5, True, ["A"], {"a": 1}])
def test_env_is_a_variable_name(env):
    errors = check(doc(credentials=[entry(env=env)]))
    assert errors == ["credentials[0]: env must be the name of an environment variable "
                      "(letters, digits and underscores, not starting with a digit)"]


@pytest.mark.parametrize("field", ["service", "unlocks", "route"])
@pytest.mark.parametrize("value", ["", "   ", None, 3, ["x"], {"a": 1}])
def test_text_fields_are_nonempty_text(field, value):
    errors = check(doc(credentials=[entry(**{field: value})]))
    assert errors == [f"credentials[0]: {field} must be nonempty text"]


@pytest.mark.parametrize("value", ["yes", "true", 1, 0, None, [], {}])
def test_required_is_true_or_false(value):
    assert check(doc(credentials=[entry(required=value)])) == ["credentials[0]: required must be true or false"]


@pytest.mark.parametrize("rank", [0, -1, True, False, 1.5, "1", None, [1], {"a": 1}])
def test_rank_is_a_positive_whole_number(rank):
    assert check(doc(credentials=[entry(rank=rank)])) == ["credentials[0]: rank must be a positive whole number"]


def test_env_and_rank_are_unique_and_the_error_names_the_position_only():
    errors = check(doc(credentials=[entry(rank=2), entry(rank=2, env="DEMO_TOKEN"), entry(rank=3)]))
    assert errors == ["credentials[1]: rank repeats the rank of credentials[0]",
                      "credentials[2]: env repeats the variable of credentials[0]"]
    assert not any("EXAMPLE_API_KEY" in error or "DEMO_TOKEN" in error for error in errors)


# --- References ----------------------------------------------------------------------------------------------

def test_used_by_names_sources_and_capabilities_that_exist():
    wrong = entry(used_by={"sources": ["demo", "ghost"], "capabilities": ["ghost", "x"]})
    assert check(doc(credentials=[wrong])) == [
        "credentials[0]: used_by.sources[1] is not a source of this package",
        "credentials[0]: used_by.capabilities[0] is not a capability of this package"]


@pytest.mark.parametrize("used_by, message", [
    ([], "used_by must be an object"),
    ("demo", "used_by must be an object"),
    ({"keys": []}, "used_by may hold only sources, capabilities and tools"),
    ({"sources": "demo"}, "used_by.sources must be a list of names"),
    ({"capabilities": {"x": 1}}, "used_by.capabilities must be a list of names"),
    ({"sources": [""]}, "used_by.sources[0] must be nonempty text"),
    ({"sources": [["demo"]]}, "used_by.sources[0] must be nonempty text"),
    ({"tools": [5]}, "used_by.tools[0] must be nonempty text"),
])
def test_used_by_is_an_object_of_lists_of_names(used_by, message):
    errors = check(doc(credentials=[entry(used_by=used_by)]))
    assert any(message in error for error in errors), errors


def test_used_by_and_its_lists_may_be_empty():
    assert check(doc(credentials=[entry(used_by={}), entry(env="DEMO_TOKEN", used_by={"sources": [], "tools": []})])) == []


def test_tools_are_checked_only_against_a_server_review_that_has_a_roster():
    used = entry(used_by={"tools": ["demo/lookup", "demo/ghost"]})
    # No server review, or one that is not a roster: the tool names are not checked, and nothing fails.
    for odd in (None, "review", [], {}, {"tools": "demo/lookup"}, {"tools": []}, {"tools": [None, 5, "demo/x"]},
                {"tools": [{"name": "demo/lookup"}]}, {"tools": [{"id": 5}, {"id": ["demo/lookup"]}]}):
        document = doc(credentials=[used])
        if odd is not None:
            document["server_review"] = odd
        assert check(document) == [], odd
    # A roster of objects with an id: each named tool must be one of those ids.
    document = doc(credentials=[used], server_review=review("demo/lookup", "demo/other"))
    assert check(document) == ["credentials[0]: used_by.tools[1] is not a tool of the server review"]
    document["server_review"] = {"tools": [*review("demo/lookup", "demo/ghost")["tools"], "not an object", {"id": 7}]}
    assert check(document) == []


# --- The check never raises and never echoes a value ---------------------------------------------------------

ODD = [None, 0, 1.5, True, "", "text", [], [[]], [None], [[SECRET]], {}, {"a": []}, {SECRET: SECRET}, [SECRET]]


@pytest.mark.parametrize("value", ODD)
def test_no_shape_makes_the_check_raise_or_echo(value):
    fields = ("env", "service", "required", "unlocks", "rank", "route", "used_by", "sk-live-")
    shapes = [value, [value], [entry(**{key: value}) for key in fields],
              [entry(used_by={"sources": value, "capabilities": [value], "tools": [value]})]]
    for shape in shapes:
        for extra in ({}, {"server_review": value}, {"server_review": {"tools": [value, {"id": value}]}}):
            errors = check(doc(credentials=shape, **extra))
            assert isinstance(errors, list) and "sk-live" not in " ".join(errors)
        assert "sk-live" not in " ".join(errors_for(credentials=shape))      # the whole validation as well


def test_a_pasted_secret_in_any_field_is_never_repeated_in_an_error():
    wrong = {"env": SECRET, "service": SECRET, "required": SECRET, "unlocks": 0, "rank": SECRET, "route": 0,
             "used_by": {"sources": [SECRET], "capabilities": [SECRET], "tools": [SECRET], SECRET: []},
             SECRET: SECRET}
    for errors in (check(doc(credentials=[wrong], server_review=review("demo/lookup"))), errors_for(credentials=[wrong])):
        assert len(errors) > 5 and "sk-live" not in " ".join(errors)


# --- The order -----------------------------------------------------------------------------------------------

def test_the_only_reordering_is_by_rank():
    declared = [entry(env="A_KEY"), entry(env="B_KEY", rank=3), entry(env="C_KEY"), entry(env="D_KEY", rank=1),
                entry(env="E_KEY", rank=2)]
    assert [e["env"] for e in in_order(declared)] == ["D_KEY", "E_KEY", "B_KEY", "A_KEY", "C_KEY"]
    assert [e["env"] for e in declared] == ["A_KEY", "B_KEY", "C_KEY", "D_KEY", "E_KEY"]   # the declaration is untouched
    assert in_order([]) == []
    assert [e["env"] for e in in_order([entry(env="A_KEY"), entry(env="B_KEY")])] == ["A_KEY", "B_KEY"]


def test_what_is_declared_is_read_back_whole_and_a_malformed_value_reads_as_none():
    declared = [entry(), entry(env="DEMO_TOKEN")]
    assert declared_credentials(doc(credentials=declared)) == declared
    assert declared_credentials(doc(credentials="oops")) == []
    assert declared_credentials(doc(credentials=[None, entry()])) == [entry()]
    assert USED_BY == ("sources", "capabilities", "tools")


# --- The prompts: the contract in words ----------------------------------------------------------------------

def read(name):
    return " ".join((PROMPTS / name).read_text(encoding="utf-8").split())


def test_the_intake_prompt_records_credentials_as_evidence():
    text = read("intake.md")
    for phrase in ("Record the credentials each source takes as evidence too", "its name only, never a value",
                   "what it unlocks", "required or optional", "how the source itself receives it"):
        assert phrase in text, phrase


def test_the_harmonizer_prompt_orders_credentials_with_the_owners_words():
    raw = (PROMPTS / "harmonizer.md").read_text(encoding="utf-8")
    assert "\n## Credentials\n" in raw and raw.index("\n## Credentials\n") > raw.index("\n## Servers and tools\n")
    text = " ".join(raw.split())
    for phrase in ("one entry that lists them all in `used_by`", "The order is the owner's", "never infer it",
                   "`rank` 1 first", "more than three credentials and no order is recorded, ask the owner once",
                   "With no owner to ask, write no `rank`", "Never a key, a token or another secret"):
        assert phrase in text, phrase


def test_the_delivery_prompt_declares_credentials_before_its_output_block():
    raw = (PROMPTS / "delivery.md").read_text(encoding="utf-8")
    assert "\n## Credentials\n" in raw and raw.index("\n## Credentials\n") < raw.index("\n## Output")
    text = " ".join(raw.split())
    for phrase in ("There is no field for a value", "One entry for each variable", "positive whole number",
                   "Omit `credentials` when no source takes a key"):
        assert phrase in text, phrase
    output = raw.split("\n## Output", 1)[1]
    assert '"credentials": [' in output and '"env": "<VARIABLE_NAME>"' in output


def test_no_prompt_names_a_real_variable_or_service():
    for name in ("intake.md", "harmonizer.md", "delivery.md"):
        text = (PROMPTS / name).read_text(encoding="utf-8")
        assert not re.search(r"\b[A-Z][A-Z0-9]*_(?:API_)?(?:KEY|TOKEN|SECRET)\b", text), name
