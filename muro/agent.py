"""Run an AI-owned factory step through an OpenAI-compatible endpoint.

The same contract as a host-driven run (ADR-0008): the LLM does the intake,
harmonization or review judgment on the prepared evidence; Python prepares,
restricts where the answer may land, writes it, and validates it. The model is
whatever the endpoint serves; the key comes from an environment variable and is
never taken on the command line or written anywhere.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

_TOP_LEVEL = {"ROUTER.md", "guide-examples.json", "entries.json", "delivery.json", "eval-cases.json"}
_CAPABILITY = re.compile(r"capabilities/[a-z0-9]+(?:-[a-z0-9]+)*\.md")
_PER_FILE_CHARS = 200_000
_TOTAL_CHARS = 1_000_000

STEPS = ("intake", "harmonize", "review")


def _contract(where: str, allowed: str) -> str:
    return (
        "\n\n## Output contract (API run, no file tools)\n"
        "You are running through an API without file tools. Return EXACTLY one JSON "
        "object and nothing else - no prose before or after, no code fence:\n"
        '{"files": {"<relative path>": "<full file content>"}, "notes": "<short summary>"}\n'
        f"Paths are relative to {where}. Allowed paths: {allowed}. "
        "Any other path is rejected and nothing at all is written.\n"
    )


def read_api_key(env_name: str | None) -> str:
    """The key from the named variable, or MURO_API_KEY then OPENAI_API_KEY."""
    names = [env_name] if env_name else ["MURO_API_KEY", "OPENAI_API_KEY"]
    for name in names:
        value = os.environ.get(name, "")
        if value:
            return value
    raise ValueError(f"No API key: set {' or '.join(names)} (the key is never a command-line argument)")


def _post_chat(api_base: str, api_key: str, model: str, messages: list[dict[str, str]]) -> str:
    base = api_base.rstrip("/")
    url = base + "/chat/completions"
    host = urllib.parse.urlsplit(url).hostname or ""
    if not url.startswith("https://") and host not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("the endpoint must be https (plain http is allowed only on localhost)")
    payload = json.dumps({"model": model, "messages": messages, "temperature": 0}).encode("utf-8")
    request = urllib.request.Request(url, data=payload, method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    })
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            document = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        raise ValueError(f"endpoint returned {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ValueError(f"endpoint unreachable or malformed: {exc}") from exc
    try:
        content = document["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("endpoint answer has no choices[0].message.content") from exc
    if not isinstance(content, str):
        raise ValueError("endpoint answer content is not text")
    return content


def _parse_files(content: str) -> tuple[dict[str, str], str]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n", "", text)
        text = re.sub(r"\n```$", "", text.rstrip())
    try:
        document = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("the answer holds no JSON object")
        document = json.loads(text[start:end + 1])
    files = document.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError('the JSON object has no non-empty "files" map')
    clean: dict[str, str] = {}
    for path, body in files.items():
        if not isinstance(path, str) or not isinstance(body, str):
            raise ValueError("every files entry must map a string path to string content")
        clean[path.replace("\\", "/").lstrip("./")] = body
    notes = document.get("notes")
    return clean, notes if isinstance(notes, str) else ""


def _write_files(files: dict[str, str], root: Path, allowed: Callable[[str], bool]) -> list[str]:
    rejected = [p for p in files if not allowed(p) or p.startswith("/") or ".." in p.split("/")]
    if rejected:
        raise ValueError("rejected paths (nothing was written): " + ", ".join(sorted(rejected)))
    written = []
    for path, body in files.items():
        target = (root / path).resolve()
        if root.resolve() not in target.parents and target != root.resolve():
            raise ValueError(f"rejected path escaping the package: {path}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
        written.append(path)
    return sorted(written)


def _inline_evidence(workbench: Path) -> str:
    """The intake workbench's source.json and files/, inlined for an API model."""
    parts = ["\n\n## Inlined evidence (this API run has no file tools; ./files/ follows inline)\n"]
    source = workbench / "source.json"
    parts.append(f"\n### source.json\n\n```json\n{source.read_text(encoding='utf-8')}\n```\n")
    total = 0
    skipped: list[str] = []
    for path in sorted((workbench / "files").rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(workbench / "files").as_posix()
        try:
            body = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            skipped.append(f"{relative} (binary)")
            continue
        if len(body) > _PER_FILE_CHARS or total + len(body) > _TOTAL_CHARS:
            skipped.append(f"{relative} ({len(body)} chars, over the inline budget)")
            continue
        total += len(body)
        parts.append(f"\n### files/{relative}\n\n````\n{body}\n````\n")
    if skipped:
        parts.append("\n### Not inlined (report them as a gap if your judgment needs them)\n\n- "
                     + "\n- ".join(skipped) + "\n")
    return "".join(parts)


def run_step(step: str, source_id: str | None, manifest: dict, project_root: Path,
             api_base: str, model: str, api_key: str, rounds: int,
             validate: Callable[[], tuple[int, str]]) -> int:
    """Prepare the step, ask the endpoint, write the answer, validate. 0 on success."""
    from .factory import harmonize_prompt, prepare_intake, review_prompt

    if step == "intake":
        source = next((s for s in manifest.get("sources", []) if s.get("id") == source_id), None)
        if not source:
            raise ValueError(f"Unknown source: {source_id}")
        workbench = prepare_intake(source, project_root, project_root / ".muro" / "factory" / "intake")
        prompt = (workbench / "PROMPT.md").read_text(encoding="utf-8") + _inline_evidence(workbench)
        root, allowed = project_root, lambda p: p in _TOP_LEVEL or bool(_CAPABILITY.fullmatch(p))
        where, names = "the package directory", "capabilities/<kebab-id>.md, " + ", ".join(sorted(_TOP_LEVEL))
    elif step == "harmonize":
        workbench = harmonize_prompt(project_root, project_root / ".muro" / "factory" / "harmonization")
        prompt = (workbench / "PROMPT.md").read_text(encoding="utf-8")
        root, allowed = project_root, lambda p: p in _TOP_LEVEL or bool(_CAPABILITY.fullmatch(p))
        where, names = "the package directory", "capabilities/<kebab-id>.md, " + ", ".join(sorted(_TOP_LEVEL))
    elif step == "review":
        workbench = review_prompt(project_root, project_root / ".muro" / "factory" / "review")
        prompt = (workbench / "PROMPT.md").read_text(encoding="utf-8")
        root, allowed = workbench, lambda p: p == "REVIEW.md"
        where, names = "the staged review directory", "REVIEW.md"
    else:
        raise ValueError(f"step must be one of {', '.join(STEPS)}")

    messages = [{"role": "user", "content": prompt + _contract(where, names)}]
    failure = ""
    for round_index in range(max(1, rounds)):
        content = _post_chat(api_base, api_key, model, messages)
        try:
            files, notes = _parse_files(content)
            written = _write_files(files, root, allowed)
        except ValueError as exc:
            failure = str(exc)
            messages += [{"role": "assistant", "content": content},
                         {"role": "user", "content": f"That answer was rejected: {failure}. "
                                                     "Return the corrected, complete JSON object and nothing else."}]
            continue
        print(f"wrote {len(written)} file(s): " + ", ".join(written))
        if notes:
            print(f"notes: {notes}")
        if step == "review":
            return 0
        code, report = validate()
        if code == 0:
            print(report)
            return 0
        failure = report
        messages += [{"role": "assistant", "content": content},
                     {"role": "user", "content": "Validation rejected that catalog:\n" + report +
                                                 "\nReturn the corrected, complete JSON object (all files again) and nothing else."}]
    print(f"step {step} failed after {max(1, rounds)} round(s): {failure}")
    return 1
