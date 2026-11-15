"""Stage verified, private Windows x64 Git and curl in a fresh tools directory."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import tempfile
import urllib.request
import zipfile

# Reviewed against the official release API / curl checksum page on 2026-11-15.
# Pin the reviewed assets; a new upstream release never silently changes a build.
GIT_RELEASE = "v2.56.1.windows.1"
GIT_URL = f"https://github.com/git-for-windows/git/releases/download/{GIT_RELEASE}/MinGit-2.56.1-64-bit.zip"
GIT_SHA256 = "4a92850b6e917da4fd010669b614b55dccf5b0ec333a534cc4be4700dfefdafd"
GIT_RECORD = f"https://api.github.com/repos/git-for-windows/git/releases/tags/{GIT_RELEASE}"
CURL_VERSION = "8.23.0_9"
CURL_FOLDER = f"curl-{CURL_VERSION}-win64-mingw"
CURL_URL = f"https://curl.se/windows/dl-{CURL_VERSION}/{CURL_FOLDER}.zip"
CURL_SHA256 = "89cb71930f4242d884e8e349463455932ab1d089b20f4f99318261a3cbff9167"
CURL_RECORD = CURL_URL + ".txt"


def inspected_zip(data: bytes, digest: str, name: str) -> zipfile.ZipFile:
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"{name} archive SHA-256 differs from official release record")
    archive = zipfile.ZipFile(io.BytesIO(data))
    seen: set[str] = set()
    for entry in archive.infolist():
        normalized = entry.filename.replace("\\", "/")
        path = PurePosixPath(normalized)
        if (path.is_absolute() or any(p in ("..", ".") or ":" in p for p in path.parts)
                or stat.S_ISLNK(entry.external_attr >> 16)):
            archive.close()
            raise ValueError(f"Unsafe archive path: {entry.filename}")
        key = normalized.rstrip("/").casefold()
        if key in seen:
            archive.close()
            raise ValueError(f"Unsafe archive path: duplicate {entry.filename}")
        seen.add(key)
    return archive


def check_tools(root: Path) -> dict[str, str]:
    checked = {}
    for name, executable in (("git", root / "git/cmd/git.exe"), ("curl", root / "curl/bin/curl.exe")):
        result = subprocess.run(
            [str(executable), "--version"], check=True, text=True,
            capture_output=True, timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        first = result.stdout.splitlines()[0] if result.stdout else ""
        if not first.startswith("git version " if name == "git" else "curl "):
            raise ValueError(f"Unexpected {name} executable response: {first}")
        checked[name] = first
    return checked


def stage(out: Path, git_archive: bytes, curl_archive: bytes) -> dict:
    out = out.resolve()
    if out.exists():
        raise FileExistsError(f"Refusing to replace existing tools: {out}")
    with inspected_zip(git_archive, GIT_SHA256, "MinGit") as git_zip, inspected_zip(curl_archive, CURL_SHA256, "curl") as curl_zip:
        # Validate both archives and required license/binary entries before writing any output.
        if not {"cmd/git.exe", "LICENSE.txt"}.issubset(git_zip.namelist()):
            raise ValueError("MinGit archive lacks its executable or license")
        if not {f"{CURL_FOLDER}/bin/curl.exe", f"{CURL_FOLDER}/COPYING.txt"}.issubset(curl_zip.namelist()):
            raise ValueError("curl archive lacks its executable or license")
        out.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".muro-tools-", dir=out.parent) as work:
            staging = Path(work)
            git_zip.extractall(staging / "git")
            curl_zip.extractall(staging / "curl-release")
            (staging / "curl-release" / CURL_FOLDER).rename(staging / "curl")
            # Keep full upstream trees: runtime DLLs, CA certificates, licenses and notices.
            checked = check_tools(staging)
            provenance = {
                "git": {"release": GIT_RELEASE, "url": GIT_URL, "sha256": GIT_SHA256, "checksum_record": GIT_RECORD},
                "curl": {"version": CURL_VERSION, "url": CURL_URL, "sha256": CURL_SHA256, "checksum_record": CURL_RECORD},
                "checked": checked,
            }
            (staging / "PROVENANCE.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
            # mkdir is the final exclusive reservation, so concurrent builds cannot overwrite.
            out.mkdir()
            for name in ("git", "curl", "PROVENANCE.json"):
                shutil.move(str(staging / name), str(out / name))
    return provenance


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Muro-desktop-tooling"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--git-archive", type=Path)
    parser.add_argument("--curl-archive", type=Path)
    args = parser.parse_args()
    if args.out.exists():
        parser.error(f"Output already exists: {args.out}")
    git = args.git_archive.read_bytes() if args.git_archive else download(GIT_URL)
    curl = args.curl_archive.read_bytes() if args.curl_archive else download(CURL_URL)
    result = stage(args.out, git, curl)
    print(json.dumps({"out": str(args.out.resolve()), **result}, indent=2))


if __name__ == "__main__":
    main()
