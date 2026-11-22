"""Stage a private Windows Python, the factory and the latest release of Marionette into a fresh desktop resource folder.

Muro builds nothing of Marionette (owner decision of 2026-11-22: "Muro prende dalla repository, punto"). Marionette is
built with Muro by `.github/workflows/release-marionette.yml` and published as a release of acaprino/marionette; this
step takes the latest published release of that repository, checks its asset against the `.sha256` published beside it,
and places the zip, unchanged, under `projects/` with its `.sha256`. It runs no `muro build`, no `muro project pack` and
no validation of the package. The release is a zip of the built plugin folder, not a project file: the runtime installs a
default project only from `projects/marionette.mp`, so today the zip is carried and not read.
This step needs the network (the Python archive and the release). A token in GH_TOKEN or GITHUB_TOKEN is sent to the
GitHub API only, to lift its rate limit. --archive covers the Python download only.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import urllib.request
import zipfile

PYTHON_URL = "https://www.python.org/ftp/python/3.13.17/python-3.13.17-embed-amd64.zip"
PYTHON_SHA256 = "9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38"
DEFAULT_PROJECT_REPOSITORY = "acaprino/marionette"     # where the package that ships with Muro is published
DEFAULT_PROJECT_PREFIX = "marionette-"                 # its release assets: <prefix><version>.zip and <...>.zip.sha256
_USER_AGENT = "muro-desktop-resources"

def stage(out: Path, archive: bytes, root: Path) -> None:
    if hashlib.sha256(archive).hexdigest() != PYTHON_SHA256:
        raise ValueError("Python archive SHA-256 differs from python.org release record")
    if out.exists():
        raise FileExistsError(f"Refusing to replace existing resources: {out}")
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        for entry in zf.infolist():
            candidate = (out / "python" / entry.filename).resolve()
            if not candidate.is_relative_to((out / "python").resolve()):
                raise ValueError("Archive entry escapes Python directory")
        out.mkdir(parents=True)
        zf.extractall(out / "python")
    # Embedded Python deliberately ignores the process environment. Add only our bundled factory.
    (out / "python" / "python313._pth").write_text("python313.zip\n.\n../factory\n", encoding="utf-8")
    factory = out / "factory"
    factory.mkdir()
    for folder in ("muro", "prompts"):
        shutil.copytree(root / folder, factory / folder, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for name in ("muro_build.py", "README.md", "AGENTS.md"):
        shutil.copy2(root / name, factory / name)
    shutil.copytree(root / "docs" / "adr", factory / "docs" / "adr")
    (out / "PROVENANCE.json").write_text(json.dumps({"python_url": PYTHON_URL, "sha256": PYTHON_SHA256}, indent=2), encoding="utf-8")

def latest_release(repository: str, urlopen=urllib.request.urlopen, token: str | None = None) -> tuple[str, dict[str, str]]:
    """The tag and the assets (name -> download URL) of the latest published release of `repository`."""
    headers = {"User-Agent": _USER_AGENT, "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(f"https://api.github.com/repos/{repository}/releases/latest", headers=headers)
    with urlopen(request, timeout=90) as reply:
        release = json.load(reply)
    assets = {item["name"]: item["browser_download_url"] for item in release.get("assets", [])}
    return release["tag_name"], assets

def _download(url: str, urlopen=urllib.request.urlopen) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT, "Accept": "application/octet-stream"})
    with urlopen(request, timeout=300) as reply:
        return reply.read()

def fetch_default_project_release(out: Path, urlopen=urllib.request.urlopen, token: str | None = None) -> Path:
    """Take the latest release of the default project's repository and place it, unchanged, in `<out>/projects/`.

    The release holds one `<prefix><version>.zip` and its `.sha256`; the zip is checked against the digest and both
    files are written as they were published. Nothing is built, packed or validated. Needs the network.
    """
    tag, assets = latest_release(DEFAULT_PROJECT_REPOSITORY, urlopen, token)
    shape = re.compile(re.escape(DEFAULT_PROJECT_PREFIX) + r"[A-Za-z0-9._+-]+\.zip")
    archives = [name for name in assets if shape.fullmatch(name)]
    if len(archives) != 1:
        raise ValueError(f"{DEFAULT_PROJECT_REPOSITORY} {tag}: expected one {DEFAULT_PROJECT_PREFIX}<version>.zip, found {archives}")
    name = archives[0]
    if f"{name}.sha256" not in assets:
        raise ValueError(f"{DEFAULT_PROJECT_REPOSITORY} {tag}: {name}.sha256 is not among its assets")
    archive = _download(assets[name], urlopen)
    record = _download(assets[f"{name}.sha256"], urlopen)
    words = record.decode("utf-8").split()
    if not words or not re.fullmatch(r"[0-9a-fA-F]{64}", words[0]) or (len(words) > 1 and words[1].lstrip("*") != name):
        raise ValueError(f"{name}.sha256 is not a SHA-256 record of {name}")
    digest = hashlib.sha256(archive).hexdigest()
    if digest != words[0].lower():
        raise ValueError(f"{name} has SHA-256 {digest}, its record says {words[0].lower()}")
    if not zipfile.is_zipfile(io.BytesIO(archive)):
        raise ValueError(f"{name} is not a zip archive")
    folder = out / "projects"
    folder.mkdir(exist_ok=True)
    (folder / name).write_bytes(archive)
    (folder / f"{name}.sha256").write_bytes(record)
    provenance = out / "PROVENANCE.json"
    held = json.loads(provenance.read_text(encoding="utf-8"))
    held["default_project"] = {"repository": DEFAULT_PROJECT_REPOSITORY, "tag": tag, "asset": name, "sha256": digest}
    provenance.write_text(json.dumps(held, indent=2), encoding="utf-8")
    return folder / name

def stage_resources(out: Path, archive: bytes, root: Path, urlopen=urllib.request.urlopen, token: str | None = None) -> Path:
    """`stage`, then the latest release of the default project. A failed fetch removes the folder `stage` made a moment ago."""
    stage(out, archive, root)
    try:
        return fetch_default_project_release(out, urlopen, token)
    except BaseException:
        shutil.rmtree(out, ignore_errors=True)
        raise

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--archive", type=Path, help="an already downloaded copy of the embedded Python archive")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    archive = args.archive.read_bytes() if args.archive else urllib.request.urlopen(PYTHON_URL, timeout=90).read()
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    release = stage_resources(args.out.resolve(), archive, root, token=token)
    print(f"Staged private Python + factory + the latest default project release: {args.out.resolve()} ({release.name})")

if __name__ == "__main__":
    main()
