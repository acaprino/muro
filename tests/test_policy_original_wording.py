"""Absorbed content is not altered, except for harmonization and coexistence (owner, 2026-11-12).

"Non deve mai alterare il contenuto Muro, se non per garantire armonizzazione e
coesistenza in base ai suoi principi; solo in quel caso può riscriverne il contenuto."

Marionette's permanent policy had been a 1,999-character rewrite of Ponytail and
i-have-adhd that softened or lost rules. It now carries both originals in their own
words. These tests read the pinned originals from their repositories (network) and
check the text line by line; every difference must be a line marked `[Marionette]`
and explained in `delivery.json`. They prove the wording, not that a model follows it.
"""
import json
from pathlib import Path

import pytest

from muro.delivery import always_on_limit
from muro.sources import _blob, source_repository

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
MARK = "[Marionette]"
# The one sentence of a source that is reworded: it claims the end of the reply, as i-have-adhd rule 3 does.
PONYTAIL_ENDING = "End your reply with one or two lines: what you skipped or did not check, and any risk the user must know."


def read_json(name):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def originals():
    wanted = {"i-have-adhd": "skills/i-have-adhd/SKILL.md", "ponytail": ".agents/rules/ponytail.md"}
    texts = {}
    for src in read_json("sources.json")["sources"]:
        if src["id"] in wanted:
            with source_repository(src, PACKAGE) as repo:
                texts[src["id"]] = _blob(repo, src["commit"], wanted[src["id"]]).decode("utf-8").replace("\r\n", "\n")
    assert set(texts) == set(wanted)
    # The frontmatter registers the original as a skill of its own; the body is the policy.
    texts["i-have-adhd"] = texts["i-have-adhd"].split("\n---\n", 1)[1]
    return texts


@pytest.fixture(scope="module")
def policy():
    return read_json("delivery.json")["always_on"]


def lines(text):
    return [line for line in text.split("\n") if line.strip()]


def test_every_line_of_both_originals_is_in_the_policy_unchanged(originals, policy):
    carried = set(lines(policy))
    for line in lines(originals["i-have-adhd"]):
        assert line in carried, line
    changed = [line for line in lines(originals["ponytail"]) if line not in carried]
    # Exactly one Ponytail line differs, and only by its last sentence.
    assert len(changed) == 1 and changed[0].endswith(PONYTAIL_ENDING)
    kept = changed[0][: -len(PONYTAIL_ENDING)]
    reworded = next(line for line in lines(policy) if line.startswith(kept))
    assert reworded[len(kept):].startswith(MARK)
    assert "what you skipped or did not check, and any risk the user must know" in reworded
    assert "i-have-adhd rule 3" in reworded


def test_the_originals_keep_their_order_and_their_strict_rules(originals, policy):
    carried = lines(policy)
    for name in originals:
        cursor = 0
        for line in lines(originals[name]):
            if line in carried:          # the one reworded Ponytail line is checked in the test above
                assert line in carried[cursor:], (name, line)
                cursor = carried.index(line, cursor) + 1
    for strict in ("The reader has ADHD.", "### 5. Restate state every turn", "### 9. Cap lists to 5 items",
                   "name ONE thing the reader can do in under two minutes",
                   'Turn them off only when the reader says "stop adhd mode" or "normal mode".',
                   "You are a lazy senior developer.", "`shortcut: <the limit>, <when to upgrade>`",
                   "Never cut: validation at trust boundaries"):
        assert strict in policy, strict


def test_everything_else_in_the_policy_is_marked_as_marionettes(originals, policy):
    source_lines = {line for text in originals.values() for line in lines(text)}
    own = [line for line in lines(policy) if line not in source_lines]
    header = own[:2]
    assert header[0] == "# Marionette session policy" and "each in its own words" in header[1]
    assert all(MARK in line for line in own[2:]), own[2:]
    # Three changes, each one a coexistence rule: reply versus artifact, code scope, the end of the reply.
    assert len(own) == 5


def test_each_change_is_explained_as_coexistence_in_the_delivery_decisions(policy):
    document = read_json("delivery.json")
    assert len(policy) <= always_on_limit(document)
    reasons = {item["source"]: item for item in document["decisions"] if item["form"] == "always-on"}
    assert set(reasons) == {"ponytail", "i-have-adhd"}
    for item in reasons.values():
        assert "not altered except for harmonization and coexistence" in item["reason"]
        assert MARK in item["reason"] and "coexistence" in item["reason"]
    assert "i-have-adhd rule 3" in reasons["ponytail"]["reason"]
    assert "artifact" in reasons["i-have-adhd"]["reason"]
    # What the policy now carries is no longer recorded as dropped.
    dropped = [item["content"] for item in document["decisions"]
               if item["source"] == "i-have-adhd" and item["form"] == "dropped"]
    assert not any("diagnostic opening" in content or "five-item" in content for content in dropped)


@pytest.mark.parametrize("prompt", ["intake.md", "harmonizer.md", "delivery.md"])
def test_the_factory_prompts_state_the_rule(prompt):
    text = " ".join((ROOT / "prompts" / prompt).read_text(encoding="utf-8").split())
    # Owner correction of the same day: the generated text is the LLM's, the substance is the source's.
    assert "weaken" in text and "source's" in text
    assert "harmonization and coexistence" in text
    assert "never for size" in text
