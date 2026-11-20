"""Packs a real, small `.mp` with the repository's own factory, for the runtime's integration test.

    python make_project.py <repository> <out dir> <variant>

It reuses the fixtures the factory's own tests pack with (`tests/test_project_file.py`: a local Git source, a
package that validates), so there is one copy of how a valid package is made. Those modules import pytest at
the top; only their fixtures are used here, so a stand-in for pytest is enough and none is required on the
machine. `variant` changes the CHANGELOG, so two variants are two different files of one project. The
release the file carries has an OpenCode adapter and a Claude Code one.
"""
import json
import sys
from pathlib import Path


class _Pytest:
    """Anything `pytest.x.y(...)` used as a decorator is the identity."""

    def __getattr__(self, name):
        return self

    def __call__(self, *args, **kwargs):
        return args[0] if len(args) == 1 and not kwargs and callable(args[0]) else self


def main(repository: Path, out: Path, variant: str) -> None:
    sys.path[:0] = [str(repository), str(repository / "tests")]
    sys.modules["pytest"] = _Pytest()
    import test_project_file as fixtures
    from muro import project

    work = out / "work"
    if not work.exists():
        work.mkdir(parents=True)
        fixtures.make_upstream(work / "upstream")
    upstream = work / "upstream"
    commit = fixtures.git(upstream, "rev-parse", "HEAD")
    package = work / f"package-{variant}"
    fixtures.make_package(package, upstream, commit)
    (package / "CHANGELOG.md").write_text(f"# Changelog\n\n{variant}\n", encoding="utf-8")
    staged = fixtures.build_release(work / f"release-{variant}")     # the build's sources.json and capabilities, as `pack` checks
    adapters = staged / fixtures.SLUG / "adapters"
    (adapters / "opencode").mkdir(parents=True)
    (adapters / "opencode" / "package.json").write_text(
        json.dumps({"name": fixtures.SLUG, "version": "0.1.0", "type": "module", "main": "index.js"}), encoding="utf-8")
    (adapters / "opencode" / "index.js").write_text("export default async () => ({})\n", encoding="utf-8")
    (adapters / "claude-code" / ".claude-plugin").mkdir(parents=True)
    (adapters / "claude-code" / ".claude-plugin" / "plugin.json").write_text(
        json.dumps({"name": fixtures.SLUG, "version": "0.1.0"}), encoding="utf-8")
    print(project.pack(package, out / f"{variant}.mp", sources_cache=work / "cache", release_dir=staged))


main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
