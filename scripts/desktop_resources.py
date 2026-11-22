"""Stage a private Windows Python, the factory and the default project into a fresh desktop resource folder.

The default project is Marionette (examples/marionette), packed as projects/marionette.mp: a fresh release
is built, then `muro project pack` carries the package, every input at its pinned commit and that release.
This step needs the network, as `muro check-sources` does: the pinned sources are fetched for the build and
for the inputs. With --optional-default-project (build-release.bat passes it in CI) a project that cannot be built
is a warning and the resources are staged without it. The inputs are kept in --sources-cache (default .scratch/sources-cache), so the next run
fetches only what changed. --archive covers the Python download only.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

PYTHON_URL = "https://www.python.org/ftp/python/3.13.17/python-3.13.17-embed-amd64.zip"
PYTHON_SHA256 = "9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38"
DEFAULT_PROJECT = Path("examples") / "marionette"      # the package that ships as the default project
SOURCES_CACHE = Path(".scratch") / "sources-cache"     # under the checkout; build-release.bat leaves it alone

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

def pack_default_project(out: Path, root: Path, sources_cache: Path, run=subprocess.run) -> Path:
    """Build the default project's release and pack it into `<out>/projects/<slug>.mp`; needs the network.

    The factory run is the checkout's own `muro` package (`cwd=root`), the same code `out/factory` is a copy of.
    The release is built beside `out`, never inside it, and removed once packed or when a command fails.
    """
    manifest = root / DEFAULT_PROJECT / "sources.json"
    slug = json.loads(manifest.read_text(encoding="utf-8"))["plugin"]["slug"]
    target = out / "projects" / f"{slug}.mp"
    target.parent.mkdir(exist_ok=True)
    factory = [sys.executable, "-m", "muro"]
    with tempfile.TemporaryDirectory(prefix=".muro-release-", dir=out.parent) as release:
        run([*factory, "build", "--manifest", str(manifest), "--out", release], cwd=root, check=True)
        run([*factory, "project", "pack", "--manifest", str(manifest), "--out", str(target),
             "--sources-cache", str(sources_cache), "--release", release], cwd=root, check=True)
    return target

def stage_resources(out: Path, archive: bytes, root: Path, sources_cache: Path, run=subprocess.run,
                    optional_project: bool = False) -> Path | None:
    """`stage`, then the default project. A failed project step removes the folder `stage` made a moment ago.

    With `optional_project` (the release, in CI) a project that cannot be built is a warning instead: the
    resources stay without it and None is returned. A Muro built without a default project is a supported state
    (`NotBundled` in the runtime), so a problem of the package never stops a release of Muro.
    """
    stage(out, archive, root)
    try:
        return pack_default_project(out, root, sources_cache, run)
    except Exception as error:
        if not optional_project:
            shutil.rmtree(out, ignore_errors=True)
            raise
        shutil.rmtree(out / "projects", ignore_errors=True)
        reason = " ".join(str(error).split())
        print(f"::warning title=No default project::The default project was not built, so this Muro ships without one: {reason}",
              flush=True)
        return None
    except BaseException:
        shutil.rmtree(out, ignore_errors=True)
        raise

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--archive", type=Path, help="an already downloaded copy of the embedded Python archive")
    parser.add_argument("--sources-cache", type=Path, metavar="DIR",
                        help=f"where the default project's inputs are kept between runs (default: <repository>/{SOURCES_CACHE})")
    parser.add_argument("--optional-default-project", action="store_true",
                        help="a default project that cannot be built is a warning and the resources are staged without it")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    archive = args.archive.read_bytes() if args.archive else urllib.request.urlopen(PYTHON_URL, timeout=90).read()
    project = stage_resources(args.out.resolve(), archive, root, (args.sources_cache or root / SOURCES_CACHE).resolve(),
                              optional_project=args.optional_default_project)
    if project is None:
        print(f"Staged private Python + factory, no default project: {args.out.resolve()}")
    else:
        print(f"Staged private Python + factory + default project: {args.out.resolve()} ({project.name})")

if __name__ == "__main__":
    main()
