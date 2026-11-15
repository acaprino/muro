from pathlib import Path
import hashlib
import importlib.util
import io
import zipfile

import pytest

spec = importlib.util.spec_from_file_location("desktop_tools", Path(__file__).parents[1] / "scripts" / "desktop_tools.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


def archive(entries):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buffer.getvalue()


def fixtures(monkeypatch, extra=None):
    git = archive({"cmd/git.exe": "git", "LICENSE.txt": "git-license", **(extra or {})})
    curl = archive({f"{tools.CURL_FOLDER}/bin/curl.exe": "curl", f"{tools.CURL_FOLDER}/COPYING.txt": "curl-license"})
    monkeypatch.setattr(tools, "GIT_SHA256", hashlib.sha256(git).hexdigest())
    monkeypatch.setattr(tools, "CURL_SHA256", hashlib.sha256(curl).hexdigest())
    monkeypatch.setattr(tools, "check_tools", lambda root: {"git": "git version test", "curl": "curl test"})
    return git, curl


def test_bad_digest_leaves_no_output(tmp_path):
    with pytest.raises(ValueError, match="SHA-256"):
        tools.stage(tmp_path / "tools", b"untrusted", b"untrusted")
    assert not (tmp_path / "tools").exists()


def test_existing_tools_are_never_replaced(tmp_path, monkeypatch):
    git, curl = fixtures(monkeypatch)
    out = tmp_path / "tools"
    out.mkdir()
    (out / "sentinel").write_text("keep")
    with pytest.raises(FileExistsError):
        tools.stage(out, git, curl)
    assert (out / "sentinel").read_text() == "keep"


@pytest.mark.parametrize("name", ["../escape", "cmd/../../escape", "C:/outside", "cmd/file:stream", "..\\outside"])
def test_unsafe_zip_paths_are_rejected_before_extraction(tmp_path, monkeypatch, name):
    git, curl = fixtures(monkeypatch, {name: "unsafe"})
    with pytest.raises(ValueError, match="Unsafe archive path"):
        tools.stage(tmp_path / "tools", git, curl)
    assert not (tmp_path / "tools").exists()


def test_stages_whole_licensed_archives_and_records_verified_hashes(tmp_path, monkeypatch):
    git, curl = fixtures(monkeypatch)
    result = tools.stage(tmp_path / "tools", git, curl)
    assert (tmp_path / "tools/git/cmd/git.exe").is_file()
    assert (tmp_path / "tools/git/LICENSE.txt").read_text() == "git-license"
    assert (tmp_path / "tools/curl/COPYING.txt").read_text() == "curl-license"
    assert result["git"]["sha256"] == hashlib.sha256(git).hexdigest()
    assert result["curl"]["sha256"] == hashlib.sha256(curl).hexdigest()
    assert result["checked"]["git"] == "git version test"


def test_failed_executable_probe_does_not_publish_tools(tmp_path, monkeypatch):
    git, curl = fixtures(monkeypatch)

    def fail(_):
        raise RuntimeError("executable did not run")

    monkeypatch.setattr(tools, "check_tools", fail)
    with pytest.raises(RuntimeError, match="executable did not run"):
        tools.stage(tmp_path / "tools", git, curl)
    assert not (tmp_path / "tools").exists()


def test_zip_symlink_is_rejected(tmp_path, monkeypatch):
    _, curl = fixtures(monkeypatch)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        entry = zipfile.ZipInfo("linked")
        entry.create_system = 3
        entry.external_attr = 0o120777 << 16
        zf.writestr(entry, "../../outside")
    git = buffer.getvalue()
    monkeypatch.setattr(tools, "GIT_SHA256", hashlib.sha256(git).hexdigest())
    with pytest.raises(ValueError, match="Unsafe archive path"):
        tools.stage(tmp_path / "tools", git, curl)
    assert not (tmp_path / "tools").exists()
