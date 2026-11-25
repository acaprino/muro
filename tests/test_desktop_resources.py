from pathlib import Path
import importlib.util
import pytest

spec = importlib.util.spec_from_file_location("desktop_resources", Path(__file__).parents[1] / "scripts" / "desktop_resources.py")
resources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resources)

def test_unverified_archive_cannot_create_or_replace_files(tmp_path):
    out = tmp_path / "resources"
    with pytest.raises(ValueError, match="SHA-256"):
        resources.stage(out, b"untrusted archive", tmp_path)
    assert not out.exists()

def test_existing_resources_are_never_replaced(tmp_path, monkeypatch):
    out = tmp_path / "resources"
    out.mkdir()
    marker = out / "keep.txt"
    marker.write_text("keep")
    archive = b"archive"
    monkeypatch.setattr(resources, "PYTHON_SHA256", resources.hashlib.sha256(archive).hexdigest())
    with pytest.raises(FileExistsError):
        resources.stage(out, archive, tmp_path)
    assert marker.read_text() == "keep"


def test_the_staged_folder_holds_python_and_the_factory_and_no_project(tmp_path, monkeypatch):
    import io
    import json
    import zipfile
    root = tmp_path / "root"
    for folder in ("muro", "prompts", "docs/adr"):
        (root / folder).mkdir(parents=True)
        (root / folder / "kept.txt").write_text("kept", encoding="utf-8")
    for name in ("muro_build.py", "README.md", "AGENTS.md"):
        (root / name).write_text(name, encoding="utf-8")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as embedded:
        embedded.writestr("python.exe", "python")
    archive = buffer.getvalue()
    monkeypatch.setattr(resources, "PYTHON_SHA256", resources.hashlib.sha256(archive).hexdigest())
    out = tmp_path / "resources"
    resources.stage(out, archive, root)
    assert sorted(path.name for path in out.iterdir()) == ["PROVENANCE.json", "factory", "python"]
    assert (out / "factory" / "muro" / "kept.txt").is_file() and (out / "python" / "python.exe").is_file()
    # Muro ships no project: nothing is fetched and nothing but the Python archive is recorded.
    assert sorted(json.loads((out / "PROVENANCE.json").read_text(encoding="utf-8"))) == ["python_url", "sha256"]
    source = (Path(__file__).parents[1] / "scripts" / "desktop_resources.py").read_text(encoding="utf-8")
    assert "api.github.com" not in source and "subprocess" not in source
