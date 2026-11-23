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


# An environment variable's name in capitals, `^[A-Z_][A-Z0-9_]{0,63}$`: the same rule in `muro-registry`
# (`ai::validate_key_env`) and in the desktop's settings page. A looser rule read real keys that carry no
# hyphen (`gsk_...`, `hf_...`, plain letters and digits) as names, and a name is repeated in messages.
_VARIABLE_NAME = re.compile(r"[A-Z_][A-Z0-9_]{0,63}")


def read_api_key(env_name: str | None) -> str:
    """The key from the named variable, or MURO_API_KEY then OPENAI_API_KEY.

    The name is validated as a variable name before it is used or repeated anywhere: a key pasted
    here by mistake is refused without being echoed in the error.
    """
    if env_name and not _VARIABLE_NAME.fullmatch(env_name):
        raise ValueError("The key setting must name an environment variable, not hold a key")
    names = [env_name] if env_name else ["MURO_API_KEY", "OPENAI_API_KEY"]
    for name in names:
        value = os.environ.get(name, "")
        if value:
            return value
    raise ValueError(f"No API key: set {' or '.join(names)} (the key is never a command-line argument)")


def _post_chat(api_base: str, api_key: str, model: str, messages: list[dict[str, str]]) -> str:
    base = api_base.rstrip("/")
    url = base + "/chat/completions"
    parts = urllib.parse.urlsplit(url)
    # `urlsplit` gives the scheme and the host in lowercase: `HTTPS://` is https, `HTTP://example.com` is not.
    if parts.scheme not in {"https", "http"} or (parts.scheme == "http" and (parts.hostname or "") not in {"localhost", "127.0.0.1", "::1"}):
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
        path = path.replace("\\", "/")
        # Strip only an exact leading "./": a character-class strip would silently
        # rewrite "../x" or ".muro/x" into something else before the ".." guard sees it.
        while path.startswith("./"):
            path = path[2:]
        clean[path] = body
    notes = document.get("notes")
    return clean, notes if isinstance(notes, str) else ""


# The owner's answer about a package server and what it declared on that answer: no unattended step writes them.
_OWNER_KEYS = ("package_server", "server_choice")
_NO_OWNER = (
    "No owner can be asked in this run. Leave the `package_server` and `server_choice` keys of delivery.json "
    "exactly as they are in the package directory, absent where absent: only the owner, asked in an attended "
    "session, writes them, and a result that changes either is rejected.\n"
)


def _owner_keys(text: str) -> dict[str, Any] | None:
    """The values of the owner's keys in a delivery.json, or None when the text is not an object."""
    try:
        document = json.loads(text)
    except ValueError:
        return None
    return {key: document.get(key) for key in _OWNER_KEYS} if isinstance(document, dict) else None


def _refuse_owner_keys(files: dict[str, str], before: dict[str, Any]) -> None:
    """Python compares and never chooses: the result's keys must equal the file's as they were before the step."""
    after = _owner_keys(files["delivery.json"]) if "delivery.json" in files else None
    changed = [key for key in _OWNER_KEYS if after is not None and after[key] != before[key]]  # unreadable: validation says so
    if changed:
        raise ValueError("; ".join(
            f"delivery.json: {key} differs from the file on disk, and only the owner writes it: the owner must answer "
            f"in an attended session, so write {key} exactly as on disk (leave it out where it is absent)"
            for key in changed))


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
    """The intake workbench's source.json, coverage.json and files/, inlined for an API model."""
    parts = ["\n\n## Inlined evidence (this API run has no file tools; ./files/ follows inline)\n"]
    for name in ("source.json", "coverage.json"):
        parts.append(f"\n### {name}\n\n```json\n{(workbench / name).read_text(encoding='utf-8')}\n```\n")
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
    from .custom_instructions import collect, inventory

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

    input_snapshot = inventory(collect(workbench))

    def verify_inputs():
        if inventory(collect(project_root)) != input_snapshot:
            raise ValueError("custom-instructions changed during AI work; prepare again before writing results")

    contract = _contract(where, names) + (_NO_OWNER if step != "review" else "")
    messages = [{"role": "user", "content": prompt + contract}]
    delivery = project_root / "delivery.json"
    owner_before = (_owner_keys(delivery.read_text(encoding="utf-8", errors="replace")) if delivery.is_file() else None) \
        or dict.fromkeys(_OWNER_KEYS)
    failure = ""
    written_before: set[str] = set()
    for round_index in range(max(1, rounds)):
        verify_inputs()
        content = _post_chat(api_base, api_key, model, messages)
        verify_inputs()
        try:
            files, notes = _parse_files(content)
            _refuse_owner_keys(files, owner_before)  # before anything is written: a refusal leaves the file as it was
            written = _write_files(files, root, allowed)
            # A repair round returns the complete set again: a file an earlier,
            # rejected round wrote and this round no longer names was a mistake,
            # and leaving it would fail every later validation unrecoverably.
            for stale in written_before - set(files):
                target = root / stale
                if target.is_file():
                    target.unlink()
            written_before = set(files)
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
