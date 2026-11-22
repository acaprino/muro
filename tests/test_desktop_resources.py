from pathlib import Path
import importlib.util
import json
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


# --- the default project: Muro takes the latest published release of its repository and builds nothing -----------

PREFIX = resources.DEFAULT_PROJECT_PREFIX
REPOSITORY = resources.DEFAULT_PROJECT_REPOSITORY
LATEST = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"


class Reply:
    def __init__(self, body):
        self.body = body

    def read(self, *_):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def a_zip():
    import io
    import zipfile
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("package/sources.json", "{}")
    return buffer.getvalue()


def release_on_the_net(version="1.2.3", *, digest=None, record=None, extra=(), drop=()):
    """A stand-in for `urlopen`: the GitHub API answer for the latest release and the two assets it names."""
    import hashlib
    import json
    name = f"{PREFIX}{version}.zip"
    archive = a_zip()
    published = {name: archive,
                 f"{name}.sha256": record if record is not None else f"{digest or hashlib.sha256(archive).hexdigest()}  {name}\n".encode()}
    for other in extra:
        published[other] = b"another asset"
    for gone in drop:
        published.pop(gone.format(name=name), None)
    urls = {f"https://objects.example/{asset}": body for asset, body in published.items()}
    listing = {"tag_name": f"{PREFIX}v{version}",
               "assets": [{"name": asset, "browser_download_url": f"https://objects.example/{asset}"} for asset in published]}
    seen = []

    def urlopen(request, timeout=None):
        seen.append((request.full_url, dict(request.header_items())))
        if request.full_url == LATEST:
            return Reply(json.dumps(listing).encode())
        return Reply(urls[request.full_url])
    return urlopen, seen, name, archive, published


def staged(out, archive=b"archive"):
    out.mkdir(parents=True)
    (out / "PROVENANCE.json").write_text('{"python_url": "u"}', encoding="utf-8")
    return out


def test_the_latest_release_is_taken_checked_and_placed_unchanged_under_projects(tmp_path):
    urlopen, seen, name, archive, published = release_on_the_net()
    out = staged(tmp_path / "resources")
    placed = resources.fetch_default_project_release(out, urlopen, token="a-token")
    assert placed == out / "projects" / name
    assert placed.read_bytes() == archive and (out / "projects" / f"{name}.sha256").read_bytes() == published[f"{name}.sha256"]
    assert sorted(path.name for path in (out / "projects").iterdir()) == [name, f"{name}.sha256"]
    # The token goes to the API only, never to the download that is redirected to another host.
    assert seen[0][0] == LATEST and seen[0][1]["Authorization"] == "Bearer a-token"
    assert all("Authorization" not in headers for _, headers in seen[1:])
    held = json.loads((out / "PROVENANCE.json").read_text(encoding="utf-8"))
    assert held["python_url"] == "u"
    assert held["default_project"]["repository"] == REPOSITORY and held["default_project"]["asset"] == name
    assert held["default_project"]["tag"] == f"{PREFIX}v1.2.3"


def test_without_a_token_nothing_is_sent_and_nothing_is_built(tmp_path):
    urlopen, seen, name, _, _ = release_on_the_net()
    resources.fetch_default_project_release(staged(tmp_path / "resources"), urlopen)
    assert all("Authorization" not in headers for _, headers in seen)
    # Owner decision of 2026-11-22: Muro takes the release from the repository and builds nothing of it.
    assert not hasattr(resources, "pack_default_project") and not hasattr(resources, "DEFAULT_PROJECT")
    source = (Path(__file__).parents[1] / "scripts" / "desktop_resources.py").read_text(encoding="utf-8")
    assert "subprocess" not in source and "sources-cache" not in source


@pytest.mark.parametrize("fault, message", [
    ({"digest": "0" * 64}, "its record says"),
    ({"record": b"not a digest\n"}, "is not a SHA-256 record"),
    ({"record": ("a" * 64 + "  other.zip\n").encode()}, "is not a SHA-256 record"),
    ({"drop": ["{name}.sha256"]}, "is not among its assets"),
    ({"drop": ["{name}"]}, "expected one"),
    ({"extra": [f"{PREFIX}9.9.9.zip"]}, "expected one"),
])
def test_a_release_that_does_not_check_out_places_nothing(tmp_path, fault, message):
    urlopen, _, _, _, _ = release_on_the_net(**fault)
    out = staged(tmp_path / "resources")
    with pytest.raises(ValueError, match=message):
        resources.fetch_default_project_release(out, urlopen)
    assert not (out / "projects").exists()
    assert "default_project" not in json.loads((out / "PROVENANCE.json").read_text(encoding="utf-8"))


def test_a_failed_fetch_leaves_no_half_staged_folder_and_a_good_one_keeps_both_parts(tmp_path, monkeypatch):
    monkeypatch.setattr(resources, "stage", lambda out, archive, root: (staged(out), (out / "factory").mkdir()))
    out = tmp_path / "resources"
    failing, _, _, _, _ = release_on_the_net(digest="1" * 64)
    with pytest.raises(ValueError):
        resources.stage_resources(out, b"archive", tmp_path, failing)
    assert not out.exists()
    good, _, name, _, _ = release_on_the_net()
    assert resources.stage_resources(out, b"archive", tmp_path, good) == out / "projects" / name
    assert (out / "factory").is_dir() and (out / "projects" / name).is_file()
