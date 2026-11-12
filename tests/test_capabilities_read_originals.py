"""Every capability carries its sources in their own words (owner, 2026-11-12, ADR-0017).

The 29 Marionette capabilities were re-read against their pinned originals. A body is
an index into packaged files it tells the host to read whole, and lists each difference
with its collision. These tests check the two mechanical halves of that: the record is
there, and every packaged original a body names really travels in a release. They do
not prove that a body is faithful (that was the AI re-read) or that a host reads the files.
"""
import re
from pathlib import Path

import pytest

from muro.release import build_release

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
CAPABILITIES = sorted((PACKAGE / "capabilities").glob("*.md"))
ALIAS = re.compile(r"`(<[A-Z]{2,3}>|\$[A-Z]{2,3})`(?: below)?(?: stands)? (?:is|for) `(<package_root>/scripts/[^`]+)`")
NAMED = re.compile(r"<package_root>/scripts/([A-Za-z0-9_.{}*/-]+)")


def packaged_paths(text):
    """Paths under scripts/ a body names, with the abbreviations it defines written out."""
    for alias, target in ALIAS.findall(text):
        text = text.replace(alias + "/", target + "/").replace("`" + alias + "`", "`" + target + "`")
    return {path.rstrip("./") for path in NAMED.findall(text)}


def test_all_capabilities_are_covered():
    assert len(CAPABILITIES) == 29


@pytest.mark.parametrize("path", CAPABILITIES, ids=lambda p: p.stem)
def test_capability_records_its_changes_and_no_longer_claims_a_restatement(path):
    body, _, sources = path.read_text(encoding="utf-8").partition("\n## Sources")
    assert "- Changes for coexistence (ADR-0017):" in sources
    lowered = (body + sources).lower()
    for stale in ("restated here, not copied", "restated in this body", "read at intake only and not packaged",
                  "intake-only provenance", "original skill files are intake-only"):
        assert stale not in lowered
    # css-scroll's method is the package's own; every other body sends the host to a packaged original.
    if path.stem != "css-scroll":
        assert packaged_paths(body), "the body names no packaged original"
        assert "wins" in body               # "the original wins" or "the file wins"


@pytest.fixture(scope="module")
def release(tmp_path_factory):
    """One real build: it verifies every pinned remote, so it is slow."""
    return build_release(PACKAGE / "sources.json", PACKAGE, tmp_path_factory.mktemp("originals") / "out")


def test_every_packaged_original_a_body_names_is_in_the_release(release):
    missing = []
    for path in CAPABILITIES:
        for named in sorted(packaged_paths(path.read_text(encoding="utf-8"))):
            if any(mark in named for mark in "{}*<"):
                continue                                      # a pattern or a placeholder, not one file
            if not (release / "scripts" / named).exists():
                missing.append(f"{path.stem}: scripts/{named}")
    assert not missing, missing
    # The originals the two formerly intake-only sources now carry.
    assert (release / "scripts/claude-design-system-prompt/claude/system-prompt.md").is_file()
    # The factory drops `skills/<source-id>/` from a helper path, so the skill named like its source sits at the top.
    assert (release / "scripts/ponytail/SKILL.source.md").is_file()
    for skill in ("ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"):
        assert (release / "scripts/ponytail/skills" / skill / "SKILL.source.md").is_file()
    assert not list(release.rglob("ponytail.md"))             # the rules file travels in the policy only
