"""Facts of the real package that the factory's own tests used to assert in passing.

They leave Muro with the package (owner rule of 2026-11-25: nothing that runs in Muro names a package built
with it). Until the package has moved, they stay here, in one module, so the modules they came from return to
Muro's own Tests run.
"""
import json
import re
from pathlib import Path

from muro import RouterRow, parse_capabilities
from muro.adapters import _skill
from muro.delivery import validate_delivery
from muro.entries import validate_entries

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"
PACKAGE = MARIONETTE


def frontmatter_description(text):
    front = text.split("---")[1]
    raw = next(line for line in front.splitlines() if line.startswith("description:")).split(":", 1)[1].strip()
    return json.loads(raw) if raw.startswith('"') else raw


def test_marionette_records_a_decision_for_every_source():
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    document = json.loads((MARIONETTE / "delivery.json").read_text(encoding="utf-8"))
    capabilities = parse_capabilities(MARIONETTE / "capabilities")
    assert validate_delivery(document, capabilities, {s["id"] for s in manifest["sources"]}) == []
    assert {d["source"] for d in document["decisions"]} == ({s["id"] for s in manifest["sources"]}
                                                         | set(document["custom_instructions"]["files"]))


def test_marionette_entries_cover_everything_its_intake_absorbed():
    caps = parse_capabilities(MARIONETTE / "capabilities")
    plugin = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    data = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))
    assert set(data) == {"entries"} and validate_entries(data, caps, plugin) == []
    assert {c for e in data["entries"] for c in e["capabilities"]} == {c.id for c in caps}


def test_every_marionette_skill_description_is_a_loadable_yaml_scalar(tmp_path):
    from muro.adapters import _skill
    caps = parse_capabilities(MARIONETTE / "capabilities")
    plugin = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    for entry in [None, *entries]:
        front = _skill(plugin, "claude-code", capabilities=caps, entry=entry).split("---", 2)[1]
        value = next(l for l in front.splitlines() if l.startswith("description:"))[len("description: "):]
        assert value.startswith('"') or (": " not in value and " #" not in value and not value.endswith(":")), value


def test_marionette_entries_name_every_absorbed_original_except_its_session_policy():
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    claimed = [name for item in entries for name in item.get("absorbs", [])]
    assert len(claimed) == len(set(claimed))
    # i-have-adhd became session policy only (delivery.json), so no entry stands in for it.
    assert sorted(set(manifest["plugin"]["replaces"]) - set(claimed)) == ["i-have-adhd"]
    caps = parse_capabilities(MARIONETTE / "capabilities")
    assert validate_entries({"entries": entries}, caps, manifest["plugin"]) == []


def test_the_built_skills_name_the_originals_and_keep_the_umbrella_text_whole(tmp_path):
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    caps = parse_capabilities(MARIONETTE / "capabilities")
    umbrella = frontmatter_description(_skill(manifest["plugin"], "claude-code", capabilities=caps, entries=entries))
    assert len(umbrella) <= 1024
    assert manifest["plugin"]["description"].replace(":", ";").rstrip(".") in umbrella  # not cut any more
    assert umbrella.endswith("Never invoke a skill it absorbs; its entries name them.")
    web = next(item for item in entries if item["name"] == "marionette-web-design")
    text = _skill(manifest["plugin"], "claude-code", capabilities=caps, entry=web, entries=entries)
    description = frontmatter_description(text)
    assert description.startswith(web["description"])
    assert "ui-ux-pro-max" in description and "also when the user names one of them" in description
    assert len(description) <= 1024
    assert re.search(r"^user-invocable: false$", text, re.M)


def test_repository_capabilities_and_router_are_valid():
    from muro import parse_capability, validate_capabilities_and_router
    cap_dir = PACKAGE / "capabilities"
    router_path = PACKAGE / "ROUTER.md"
    capabilities = []
    for f in sorted(cap_dir.glob("*.md")):
        capabilities.append(parse_capability(f))
    # Parse ROUTER.md
    text = (PACKAGE / "ROUTER.md").read_text(encoding="utf-8")
    router_rows = []
    for ln in text.splitlines():
        ln = ln.strip()
        if ln.startswith("|") and ln.endswith("|"):
            parts = [p.strip() for p in ln.split("|")[1:-1]]
            if all(all(c in "- " for c in p) for p in parts):
                continue
            if parts and parts[0].lower() == "id":
                continue
            if len(parts) >= 5:
                router_rows.append(RouterRow(
                    id=parts[0], role=parts[1], when=parts[2],
                    after=parts[3], outputs=parts[4], intents=parts[5]
                ))
    errors = validate_capabilities_and_router(capabilities, router_rows)
    assert errors == []


def test_repository_capabilities_and_router_are_valid_through_muro_build():
    from muro_build import validate_capabilities_and_router
    errors = validate_capabilities_and_router(PACKAGE / "capabilities", PACKAGE / "ROUTER.md")
    assert errors == []


def test_manifest_declares_a_mode_for_every_source():
    sources = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))["sources"]
    modes = {src["id"]: (src.get("pin"), src.get("release")) for src in sources}
    assert modes == {
        "open-paper-skills": ("head", None),
        "tokeneconomizer": ("release", "v0.1.0"),
        "wayfinder": ("release", "v1.3.2"),
        "ui-ux-pro-max": ("release", "v2.15.0"),
        "genoffice": ("release", "v0.12.852"),
        "ponytail": ("release", "v5.3.3"),
        "i-have-adhd": ("release", "v0.4.1"),
        "egm": ("release", "v0.1.1"),
        "superpowers": ("release", "v7.0.2"),
        "zero-slop-design": ("release", "v0.2.1"),
        "claude-design-system-prompt": ("release", "v1-design-prompt"),
        # These upstreams publish no release or tag: the owner follows their HEAD.
        "motion-design": ("head", None),
        "gsap-scrolltrigger": ("head", None),
        "ai-design-skills": ("head", None),
        "explain-this": ("head", None),
        "text-humanizer": ("head", None),
        "better-layout": ("head", None),
        "charles-skills": ("head", None),
    }
