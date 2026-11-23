import pytest
from muro.argv_template import argument_errors, build_argv, is_batch_program, literal_parts, template_errors

SCHEMA = {"type": "object", "required": ["account"],
          "properties": {"account": {"type": "string"}, "limit": {"type": "integer"},
                         "apply": {"type": "boolean"}, "status": {"type": "string", "enum": ["ACTIVE", "PAUSED"]},
                         "note": {"type": "string", "allow_leading_dash": True}}}
RUN = ["node", "<package_root>/scripts/demo/tool.js", "list", "--account", "{account}",
       {"if": "limit", "args": ["--limit", "{limit}"]},
       {"unless": "apply", "args": ["--dry-run"]},
       {"if": "note", "args": ["--note", "{note}"]}]

def test_a_valid_template_has_no_errors_and_its_literals_are_listed_in_order():
    assert template_errors(RUN, SCHEMA, "tool t") == []
    assert literal_parts(RUN) == ["node", "<package_root>/scripts/demo/tool.js", "list", "--account",
                                  "--limit", "--dry-run", "--note"]

@pytest.mark.parametrize("run, message", [
    (["node", "{account}x"], "a placeholder is a whole item"),
    (["{account}"], "the program (first item) is a literal"),
    (["node", "{missing}"], "is not a property of the schema"),
    (["node", "{limit}"], "outside a group must be a required property"),
    (["node", {"if": "limit", "unless": "apply", "args": ["x"]}], "exactly one of if and unless"),
    (["node", {"if": "limit", "args": [{"if": "apply", "args": ["x"]}]}], "groups are not nested"),
    (["node", {"if": "apply", "args": ["{apply}"]}], "a boolean is only a group's condition"),
    (["node", {"if": "limit", "args": []}], "args must be a nonempty list"),
])
def test_template_shape_is_refused(run, message):
    assert any(message in e for e in template_errors(run, SCHEMA, "tool t"))

def test_schema_outside_the_enforced_subset_is_refused():
    bad = {"type": "object", "properties": {"a": {"type": "array"}}}
    assert any("type must be one of" in e for e in template_errors(["node"], bad, "tool t"))

def test_argv_is_built_with_groups_and_the_package_root():
    assert build_argv(RUN, {"account": "act_1"}, SCHEMA, "C:/p q") == [
        "node", "C:/p q/scripts/demo/tool.js", "list", "--account", "act_1", "--dry-run"]
    assert build_argv(RUN, {"account": "act_1", "limit": 5, "apply": True}, SCHEMA, "/r") == [
        "node", "/r/scripts/demo/tool.js", "list", "--account", "act_1", "--limit", "5"]
    assert build_argv(RUN, {"account": "a", "apply": False}, SCHEMA, "/r")[-1] == "--dry-run"

@pytest.mark.parametrize("value", ["", "two words", 'a"b', "a&b%c", "è <package_root> {limit}"])
def test_a_value_reaches_argv_as_one_unchanged_element(value):
    assert build_argv(RUN, {"account": value}, SCHEMA, "/r")[4] == value

@pytest.mark.parametrize("arguments, message", [
    ({"account": "--status"}, "begins with -"),
    ({"account": "a", "extra": 1}, "is not an argument of this tool"),
    ({}, "missing required argument account"),
    ({"account": "a", "limit": "5"}, "limit must be an integer"),
    ({"account": "a", "limit": True}, "limit must be an integer"),
    ({"account": "a", "status": "ON"}, "status must be one of"),
])
def test_a_call_is_refused(arguments, message):
    with pytest.raises(ValueError, match=message):
        build_argv(RUN, arguments, SCHEMA, "/r")

def test_a_declared_leading_dash_is_allowed():
    assert build_argv(RUN, {"account": "a", "note": "-x"}, SCHEMA, "/r")[-2:] == ["--note", "-x"]

def test_batch_programs_are_recognised():
    assert is_batch_program("C:/tools/npx.CMD") and is_batch_program("run.bat") and not is_batch_program("node.exe")

def test_zero_counts_as_given_and_only_false_switches_a_group_off():
    assert build_argv(RUN, {"account": "a", "limit": 0}, SCHEMA, "/r")[-3:-1] == ["--limit", "0"]

def test_a_number_is_passed_in_its_json_form_and_a_non_finite_one_is_refused():
    schema = {"type": "object", "properties": {"ratio": {"type": "number"}}}
    run = ["node", {"if": "ratio", "args": ["{ratio}"]}]
    assert build_argv(run, {"ratio": 1.5}, schema, "/r") == ["node", "1.5"]
    assert argument_errors({"ratio": float("nan")}, schema) == ["ratio must be a number"]
    assert argument_errors({"ratio": True}, schema) == ["ratio must be a number"]

@pytest.mark.parametrize("run, ok", [
    (["node", {"if": "limit", "args": ["{limit}"]}], True),
    (["node", {"if": "limit", "args": ["{account}"]}], True),
    (["node", {"unless": "limit", "args": ["{account}"]}], True),
    (["node", {"if": "limit", "args": ["{note}"]}], False),
    (["node", {"unless": "limit", "args": ["{limit}"]}], False),
    (["node", {"unless": "note", "args": ["{note}"]}], False),
])
def test_a_placeholder_in_a_group_is_the_groups_own_property_or_a_required_one(run, ok):
    errors = template_errors(run, SCHEMA, "tool t")
    assert (errors == []) if ok else any("inside a group must be the group's own property or a required one" in e
                                         for e in errors)

DESCRIBED = {"type": "object", "description": "List the campaigns of one account.", "required": ["account"],
             "properties": {"account": {"type": "string", "description": "The account id, act_ and digits."},
                            "limit": {"type": "integer", "description": "How many rows."}}}

def test_descriptions_are_allowed_and_change_nothing_in_the_argv():
    run = ["node", "list", "{account}", {"if": "limit", "args": ["--limit", "{limit}"]}]
    assert template_errors(run, DESCRIBED, "tool t") == []
    assert build_argv(run, {"account": "act_1", "limit": 3}, DESCRIBED, "/r") == ["node", "list", "act_1", "--limit", "3"]

@pytest.mark.parametrize("schema, message", [
    ({"type": "object", "description": "", "properties": {}}, "schema description must be nonempty text"),
    ({"type": "object", "description": 5, "properties": {}}, "schema description must be nonempty text"),
    ({"type": "object", "properties": {"a": {"type": "string", "description": ""}}}, "property a: description must be nonempty text"),
    ({"type": "object", "properties": {"a": {"type": "string", "description": ["x"]}}}, "property a: description must be nonempty text"),
])
def test_a_description_must_be_nonempty_text(schema, message):
    assert any(message in e for e in template_errors(["node"], schema, "tool t"))

@pytest.mark.parametrize("schema, message", [
    ({"type": "object"}, "schema must be"),
    ({"type": "object", "properties": {}, "required": ["x"]}, "required names x, which is not a property"),
    ({"type": "object", "properties": {"a": {"type": "string", "pattern": "x"}}}, "property a: key pattern is outside"),
    ({"type": "object", "properties": {"a": {"type": "integer", "enum": ["x"]}}}, "property a: enum must be a nonempty list of integer"),
    ({"type": "object", "properties": {"a": {"type": "string", "allow_leading_dash": "yes"}}}, "allow_leading_dash must be true or false"),
])
def test_a_schema_outside_the_enforced_subset_names_what_is_wrong(schema, message):
    assert any(message in e for e in template_errors(["node"], schema, "tool t"))

def test_literal_parts_ignore_what_is_not_a_template():
    assert literal_parts("node") == []
    assert literal_parts(["node", {"if": "a", "args": "x"}, 5, "{a}"]) == ["node"]
