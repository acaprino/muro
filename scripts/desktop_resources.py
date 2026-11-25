"""Stage a private Windows Python and the factory into a fresh desktop resource folder.

Muro ships no project and no package (owner decision of 2026-11-25): the folder holds the embedded Python, checked
against the SHA-256 recorded here, and a copy of the factory, and nothing else.
This step needs the network for the Python archive, unless --archive names an already downloaded copy of it.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile

PYTHON_URL = "https://www.python.org/ftp/python/3.13.17/python-3.13.17-embed-amd64.zip"
PYTHON_SHA256 = "9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38"

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

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--archive", type=Path, help="an already downloaded copy of the embedded Python archive")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    archive = args.archive.read_bytes() if args.archive else urllib.request.urlopen(PYTHON_URL, timeout=90).read()
    stage(args.out.resolve(), archive, root)
    print(f"Staged private Python + factory: {args.out.resolve()}")

if __name__ == "__main__":
    main()
