"""Copy a built Windows desktop and its private resources to a fresh portable folder."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", required=True, type=Path)
    parser.add_argument("--resources", required=True, type=Path)
    parser.add_argument("--tools", required=True, type=Path, help="Staged bundled CLI tools (muroctl, mukade, Git and curl)")
    parser.add_argument("--mukade-license", required=True, type=Path, help="LICENSE from the pinned Mukade source")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if args.out.exists():
        raise FileExistsError(f"Refusing to replace existing output: {args.out}")
    for path in (args.exe, args.resources / "python/python.exe", args.resources / "factory/muro_build.py",
                 args.tools / "muroctl.exe", args.tools / "mukade.exe", args.tools / "git/cmd/git.exe",
                 args.tools / "curl/bin/curl.exe", args.mukade_license):
        if not path.is_file():
            raise FileNotFoundError(path)
    args.out.mkdir(parents=True)
    shutil.copy2(args.exe, args.out / "Muro.exe")
    shutil.copytree(args.resources, args.out / "resources")
    shutil.copytree(args.tools, args.out / "tools")
    (args.out / "portable.marker").write_text("Muro portable: default data directory is ./data; MURO_DATA_DIR overrides it.\n", encoding="utf-8")
    repo = Path(__file__).resolve().parent.parent
    for relative in ("README.md", "docs/desktop.md", "docs/desktop-cli.md"):
        destination = args.out / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / relative, destination)
    shutil.copytree(repo / "examples/desktop", args.out / "examples/desktop")
    (args.out / "LICENSES").mkdir()
    shutil.copy2(args.mukade_license, args.out / "LICENSES/Mukade-MIT.txt")
    hashes = {str(p.relative_to(args.out)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(args.out.rglob("*")) if p.is_file()}
    (args.out / "SHA256.json").write_text(json.dumps(hashes, indent=2), encoding="utf-8")
    print(args.out.resolve())


if __name__ == "__main__":
    main()
