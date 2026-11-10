"""License gate: an Apache-2.0 appendix whose copyright notice is filled in.

The appendix tells licensors to replace its bracketed fields with their own
identifying information. Only that one notice line may differ from the
template; the license terms stay verified against the approved text.
"""
from pathlib import Path
import re
import subprocess

import pytest

from muro import check_sources
from muro.sources import _license_matches

APACHE = (Path(__file__).parent / "fixtures" / "apache-2.0.txt").read_text(encoding="utf-8")
PLACEHOLDER = "Copyright [yyyy] [name of copyright owner]"
# The canonical indented layout wraps the terms so that some lines begin with
# the word "copyright"; they are license prose, not copyright notices.
WRAPPED = re.sub(r"\s+copyright license to reproduce", "\n      copyright license to reproduce", APACHE)


def filled(notice, text=APACHE):
    assert text.count(PLACEHOLDER) == 1
    return text.replace(PLACEHOLDER, notice).encode("utf-8")


@pytest.mark.parametrize("notice", [
    "Copyright 2026 Mainfunc, Inc.",
    "Copyright (c) 2019-2026 Example Authors",
    "Copyright © 2024 The Example Project Contributors",
])
def test_filled_appendix_copyright_notice_is_the_approved_license(notice):
    assert _license_matches(filled(notice), "Apache-2.0")
    assert _license_matches(filled(notice).replace(b"\n", b"\r\n"), "Apache-2.0")


@pytest.mark.parametrize("notice", [
    "",
    "All rights reserved.",
    "Copyright Example without a year",
    "Copyright 2026 Example\n\n   Additional terms: redistribution is prohibited.",
    "Copyright 2026 Example\n   Copyright 2026 Another Owner",
    "Copyright 2026 " + "A" * 101,
])
def test_appendix_slot_accepts_only_one_plain_copyright_line(notice):
    assert not _license_matches(filled(notice), "Apache-2.0")


def test_filled_notice_does_not_excuse_changed_license_terms():
    grant = "to reproduce, prepare Derivative Works of,"
    assert grant in APACHE
    changed = APACHE.replace(grant, "to reproduce,")
    assert not _license_matches(changed.encode("utf-8"), "Apache-2.0")
    assert not _license_matches(filled("Copyright 2026 Mainfunc, Inc.", changed), "Apache-2.0")


def test_mit_gate_is_unaffected_by_the_apache_notice_rule():
    assert not _license_matches(filled("Copyright 2026 Mainfunc, Inc."), "MIT")


def test_source_with_filled_apache_notice_passes_the_pinned_gate(repo):
    root, _ = repo

    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    def pin(license_bytes):
        (root / "LICENSE").write_bytes(license_bytes)
        git("add", "LICENSE")
        git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "license")
        return {"sources": [{"id": "demo", "repo_path": str(root), "commit": git("rev-parse", "HEAD"), "pin": "head",
                             "license": "Apache-2.0", "selected_paths": ["SKILL.md"], "excluded_paths": []}]}

    assert check_sources(pin(filled("Copyright 2026 Mainfunc, Inc.")), root.parent) == []
    errors = check_sources(pin(filled("Copyright 2026 Mainfunc, Inc.\n   Non-commercial use only.")), root.parent)
    assert errors and "LICENSE does not match" in errors[0]


def test_copyright_notices_are_notices_not_license_prose():
    from muro.sources import copyright_notices
    from test_regressions import MIT
    assert any(line.strip().startswith("copyright license") for line in WRAPPED.splitlines())
    assert _license_matches(filled("Copyright 2026 Mainfunc, Inc.", WRAPPED), "Apache-2.0")
    assert copyright_notices(filled("Copyright 2026 Mainfunc, Inc.", WRAPPED), "Apache-2.0") == ["Copyright 2026 Mainfunc, Inc."]
    assert copyright_notices(WRAPPED.encode("utf-8"), "Apache-2.0") == []
    assert copyright_notices(MIT.encode("utf-8"), "MIT") == ["Copyright (c) 2026 Example"]
    two = MIT.replace("Copyright (c) 2026 Example", "Copyright (c) 2024 First\nCopyright 2026 Second")
    assert copyright_notices(two.encode("utf-8"), "MIT") == ["Copyright (c) 2024 First", "Copyright 2026 Second"]


def test_apache_release_notice_lists_only_the_real_copyright_line(portable_project, tmp_path):
    import json
    from muro import build_release
    manifest_path = portable_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source = manifest["sources"][0]
    repo = Path(source["repo_path"])

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    (repo / "LICENSE").write_bytes(filled("Copyright 2026 Mainfunc, Inc.", WRAPPED))
    (repo / "NOTICE").write_text("GenOffice\nThis product includes software developed at Mainfunc, Inc.\n", encoding="utf-8")
    git("add", "LICENSE", "NOTICE")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "apache")
    source.update(commit=git("rev-parse", "HEAD"), license="Apache-2.0")
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    result = build_release(manifest_path, portable_project, tmp_path / "out")
    notice = (result / "NOTICE.md").read_text(encoding="utf-8")
    block = notice[notice.index("- demo — Apache-2.0"):notice.index("Modified and merged into Muro.")]
    assert [line.strip() for line in block.splitlines()[1:] if line.strip()] == ["Copyright 2026 Mainfunc, Inc."]
    assert "This product includes software developed at Mainfunc, Inc." in notice
    assert "Modified by Muro" in (result / "capabilities" / "x.md").read_text(encoding="utf-8")
