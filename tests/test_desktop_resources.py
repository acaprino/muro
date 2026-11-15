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
