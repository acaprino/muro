"""Release packaging for the branded coordinator."""
from __future__ import annotations

import json
from pathlib import Path
import shutil

from .adapters import write_adapters
from .core import parse_router, validate_capabilities_and_router, validate_plugin_identity
from .entries import ENTRIES_FILE, load_entries, validate_entries
from .factory import copy_source_helpers, prompts_dir, runtime_source
from .guide import write_release_guide
from .sources import copyright_notices, inspect_source, parse_capabilities


def build_release(manifest_path: Path, project_root: Path, out_root: Path,
                  capabilities: list | None = None, router_rows: list | None = None,
                  host_roots: list[Path] | None = None) -> Path:
    """Validate actual inputs and atomically deliver a new package."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin = manifest.get("plugin", {})
    errors = validate_plugin_identity(plugin, installed_roots=host_roots)
    if errors:
        raise ValueError("Invalid plugin: " + "; ".join(errors))
    capabilities = parse_capabilities(project_root / "capabilities")
    router_rows = parse_router(project_root / "ROUTER.md")
    sources = manifest.get("sources", [])
    if not isinstance(sources, list) or not sources:
        raise ValueError("sources.json must contain at least one source")
    errors = validate_capabilities_and_router(
        capabilities,
        router_rows,
        {s.get("id") for s in sources},
        plugin_slug=plugin.get("slug"),
    )
    if errors:
        raise ValueError("Invalid router: " + "; ".join(errors))
    for prompt in ("intake.md", "harmonizer.md", "classify.md"):
        path = prompts_dir(project_root) / prompt
        if not path.is_file() or not path.read_text(encoding="utf-8").strip():
            raise ValueError(f"Required AI prompt missing or empty: {path}")
    for src in sources:
        if not isinstance(src.get("intake"), dict) or not src["intake"].get("goal"):
            raise ValueError(f"Source {src.get('id')} has no registered intake.goal")
    ids = [src.get("id") for src in sources]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source id")
    entries_doc = load_entries(project_root)
    if entries_doc is not None:
        errors = validate_entries(entries_doc, capabilities, plugin)
        if errors:
            raise ValueError("Invalid discovery entries: " + "; ".join(errors))
    target = out_root / plugin["slug"]
    if target.exists():
        raise FileExistsError(f"Output already exists: {target}")
    verified = [(src, *inspect_source(src, project_root)) for src in sources]
    slug, name, version = plugin["slug"], plugin["name"], plugin["version"]
    out_root.mkdir(parents=True, exist_ok=True)
    dist = out_root / f".{slug}.muro-build"
    dist.mkdir(exist_ok=False)
    completed = False
    try:
        shutil.copy2(project_root / "ROUTER.md", dist / "ROUTER.md")
        shutil.copytree(project_root / "capabilities", dist / "capabilities")
        shutil.copytree(prompts_dir(project_root), dist / "prompts")
        (dist / "sources.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        shutil.copy2(project_root / "guide-examples.json", dist / "guide-examples.json")
        if entries_doc is not None:
            shutil.copy2(project_root / ENTRIES_FILE, dist / ENTRIES_FILE)
        for src in sources:
            copy_source_helpers(src, project_root, dist)

        licenses = dist / "LICENSES"
        licenses.mkdir()
        for src, license_bytes, _ in verified:
            (licenses / f"{src['id']}.txt").write_bytes(license_bytes)
        lines = [f"{name} v{version} — Aggregated NOTICE", "",
                 f"The following upstream works are adapted and merged into {name}:", ""]
        for src, license_bytes, upstream_notice in verified:
            lines.append(f"- {src['id']} — {src['license']} (see LICENSES/{src['id']}.txt)")
            lines += [f"  {notice}" for notice in copyright_notices(license_bytes, src["license"])]
            lines.append(f"  Modified and merged into {name}.")
            if upstream_notice:
                lines.append(upstream_notice.decode("utf-8"))
            lines.append("")
        if any(src["license"] == "Apache-2.0" for src, _, _ in verified):
            for cap_file in (dist / "capabilities").glob("*.md"):
                lines_ = cap_file.read_text(encoding="utf-8").splitlines()
                end = next((i for i in range(1, len(lines_)) if lines_[i].strip() == "---"), None)
                if end is None:
                    raise ValueError(f"Malformed capability: {cap_file}")
                lines_.insert(end + 1, "<!-- Modified by Muro; see LICENSES and NOTICE.md. -->")
                cap_file.write_text("\n".join(lines_) + "\n", encoding="utf-8")
        runtime_deps = [f"  - {rd['name']} ({rd.get('version', '')}): {rd['license']}"
                        for src in sources for rd in src.get("runtime_deps", []) if not rd.get("bundled", False)]
        if runtime_deps:
            lines += ["Runtime Dependencies (Not Bundled):", *runtime_deps, ""]
        (dist / "NOTICE.md").write_text("\n".join(lines), encoding="utf-8")
        write_release_guide(dist, plugin, sources)
        write_adapters(dist, plugin, runtime_source(project_root), capabilities=capabilities,
                       entries=entries_doc["entries"] if entries_doc else None)
        dist.replace(target)
        completed = True
        return target
    finally:
        if not completed:
            shutil.rmtree(dist)
