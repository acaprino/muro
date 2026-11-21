"""Decide whether this Muro checkout should prepare a Marionette release."""

import json
import os
import subprocess
from pathlib import Path


def release_version(manifest: str, before: str | None, remotes: list[str]) -> str | None:
    version = json.loads(Path(manifest).read_bytes())["plugin"]["version"]
    # The version is written to Actions outputs and used as a single tag, branch and filename component.
    if not isinstance(version, str) or not version or "/" in version:
        raise ValueError(f"Invalid release version: {version!r}")
    tag = f"marionette-v{version}"
    subprocess.run(["git", "check-ref-format", f"refs/tags/{tag}"], check=True)
    if before is not None and before != "0" * 40:
        # ls-tree distinguishes a new manifest from an unreadable base commit (an error).
        if subprocess.check_output(["git", "ls-tree", before, "--", manifest]):
            previous = subprocess.check_output(["git", "show", f"{before}:{manifest}"])
            if json.loads(previous)["plugin"]["version"] == version:
                print(f"Marionette is still {version}.")
                return None
    for remote in remotes:
        if subprocess.check_output(["git", "ls-remote", "--tags", remote, f"refs/tags/{tag}"]):
            print(f"{tag} already exists in {remote}.")
            return None
    return version


if __name__ == "__main__":
    before = os.environ["BEFORE"] if os.environ["GITHUB_EVENT_NAME"] == "push" else None
    remotes = [f"https://github.com/{os.environ[key]}.git" for key in ("GITHUB_REPOSITORY", "PACKAGE_REPOSITORY")]
    version = release_version(os.environ["MANIFEST"], before, remotes)
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        print("build=" + ("true" if version else "false"), file=output)
        if version:
            print(f"version={version}", file=output)
