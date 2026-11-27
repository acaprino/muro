"""The Muro system section: what every built plugin adds to the host's system prompt by itself (ADR-0037).

Owner, 2026-11-27: "ogni plugin o muro comunque dovrebbero iniettare automaticamente anche una parte di system
prompt per guidare bene l'uso. Chiamato muro system". Session text acts before any skill is chosen; a skill's
description acts only when the host thinks of looking for one, and live runs of the same day found the package
unused in half the requests and its follow-ups done by hand.

The section is written from the package's data alone: its skills, the titles of the capabilities each one covers
and the names it absorbs. Python adds no meaning of its own. It goes before the session text the package's
delivery document declares, through the same channel on every host.
"""
from __future__ import annotations

from typing import Any


def capability_title(capability: Any) -> str:
    """The capability's own first heading, as its body names it; its id when it has none."""
    return next((line[2:].strip() for line in capability.body.splitlines() if line.startswith("# ")), capability.id)


def system_section(plugin: dict[str, Any], capabilities: list, entries: list | None) -> str:
    """The Muro system text of one package; empty for a package with no skill to invoke."""
    if not capabilities:
        return ""
    name, command = plugin["name"], plugin["command"]
    titles = {cap.id: capability_title(cap) for cap in capabilities}
    lines = [f"# Muro system: {name}", "",
             f"{name} is a plugin built with Muro. It is installed so that the work of the skills and plugins it "
             "absorbs is done with them, through these skills:", ""]
    if entries:
        for entry in entries:
            covered = "; ".join(titles.get(identifier, identifier) for identifier in entry["capabilities"])
            lines.append(f"- `{entry['name']}`: {covered}")
        lines.append(f"- `{command}`: the whole catalog, when the work spans several of the skills above or none "
                     "of them fits")
    else:
        lines.append(f"- `{command}`: " + "; ".join(titles[cap.id] for cap in capabilities))
    rules = ["Before you do work one of these skills covers, invoke that skill: when the work is the request, when "
             "it comes up inside a larger task, and for each later change to it. Do not do it by hand first."]
    if entries:
        rules.append("In the skill's first call, name every one of these skills the result needs.")
    rules.append("Tell the user about the work and its choices, not about skills, plans or steps.")
    if any(isinstance(item, str) and item.strip() for item in plugin.get("replaces", [])):
        rules.append(f"Do not invoke a skill or plugin that {name} absorbs: the skills above stand in for it.")
    lines.append("")
    lines += [f"{number}. {rule}" for number, rule in enumerate(rules, 1)]
    return "\n".join(lines) + "\n"


def injected_text(session: str, plugin: dict[str, Any], capabilities: list, entries: list | None) -> str:
    """Everything a release adds to the host's system prompt: the Muro system, then the declared session text."""
    system = system_section(plugin, capabilities, entries)
    if system and session.strip():
        return system + "\n" + session
    return system or session
