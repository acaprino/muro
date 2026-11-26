"""A build and a project file are written with LF line endings, whatever computer writes them.

Two things made a build on Windows differ from one on Linux: text written without saying its line ending, and the
factory's own files copied from a checkout whose Git writes CRLF (`core.autocrlf`). Both are played here, so the
test says the same on any computer. What is carried byte for byte (the owner's custom instructions) stays as it is.
"""
import builtins
import io
import shutil
import zipfile
from pathlib import Path

from muro import factory, project, project_work
from muro.adapters import write_repository_marketplaces
from test_project_file import make_package, upstream  # noqa: F401  (the fixture)
from test_project_work import packed

ROOT = Path(__file__).resolve().parent.parent


def crlf_factory(folder):
    """A copy of the factory's runtime and prompts as a Git checkout with `core.autocrlf` leaves them."""
    for name in ("muro", "prompts"):
        shutil.copytree(ROOT / name, folder / name, ignore=shutil.ignore_patterns("__pycache__"))
    for path in folder.rglob("*"):
        if path.is_file() and path.suffix in (".py", ".md", ".html", ".json"):
            path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
    return folder


def as_on_windows(monkeypatch):
    """From here on a text file whose writer names no line ending gets CRLF, as on Windows."""
    real = io.open

    def opened(file, mode="r", buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None):
        if newline is None and "b" not in mode and set(mode) & set("wax+"):
            newline = "\r\n"
        return real(file, mode, buffering, encoding, errors, newline, closefd, opener)

    monkeypatch.setattr(io, "open", opened)
    monkeypatch.setattr(builtins, "open", opened)


def with_crlf(mp):
    """The members of a project file that hold CRLF, text only."""
    with zipfile.ZipFile(mp) as archive:
        found = {name: archive.read(name) for name in archive.namelist()}
    return sorted(name for name, data in found.items() if b"\r\n" in data and b"\0" not in data)


def test_a_commit_on_windows_writes_a_project_file_with_lf(tmp_path, upstream, monkeypatch):
    _, mp = packed(tmp_path, upstream)
    work = project.unpack(mp, tmp_path / "work")
    digest = project.digest(mp)
    kept = [name for name in with_crlf(mp) if "custom-instructions/" in name]
    assert kept, "the fixture's owner file has CRLF: it is what must stay as it is"
    for package_file in work.rglob("*"):       # a package written on Linux: only the owner's file has CRLF
        if package_file.is_file() and "custom-instructions" not in package_file.parts:
            data = package_file.read_bytes()
            if b"\0" not in data:
                package_file.write_bytes(data.replace(b"\r\n", b"\n"))
    checkout = crlf_factory(tmp_path / "factory")
    monkeypatch.setattr(factory, "FACTORY_ROOT", checkout)                       # the prompts' folder
    monkeypatch.setattr(factory, "__file__", str(checkout / "muro" / "factory.py"))   # the runtime's folder
    as_on_windows(monkeypatch)

    project_work.commit(work, mp, expect_digest=digest, step="patch", operation="Harmonize again",
                        summary="The same plugin, written on Windows.")

    offending = [name for name in with_crlf(mp) if "custom-instructions/" not in name]
    assert offending == []
    assert [name for name in with_crlf(mp) if name == "custom-instructions/rules.md"] == ["custom-instructions/rules.md"]


def test_the_marketplaces_of_a_repository_are_written_with_lf(tmp_path, upstream, monkeypatch):
    from muro.release import build_release
    package = make_package(tmp_path / "pkg", *upstream)
    build_release(package / "sources.json", package, tmp_path / "repository")
    as_on_windows(monkeypatch)
    written = write_repository_marketplaces(tmp_path / "repository", "tester")
    assert written
    assert [path for path in written if b"\r\n" in path.read_bytes()] == []
