"""Install a built host adapter into a harness home, with the host's own command.

Each recipe is the adapter's own `INSTALL.md` made executable: the host's
command run with the home the caller names, or the host's config file edited
the way that document says. Nothing is invented here, and no recipe decides
*whether* to install: the caller (a person, or Shinatama) already did.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

HARNESSES = ("claude-code", "codex", "opencode", "pi")

_HOME_ENV = {"claude-code": "CLAUDE_CONFIG_DIR", "codex": "CODEX_HOME", "pi": "PI_CODING_AGENT_DIR"}
_MARKETPLACE = {"claude-code": ".claude-plugin/marketplace.json", "codex": ".agents/plugins/marketplace.json"}


def _marketplace_names(adapter: Path, harness: str) -> tuple[str, str]:
    """(marketplace name, plugin name) from the adapter's own manifest."""
    path = adapter / _MARKETPLACE[harness]
    document = json.loads(path.read_text(encoding="utf-8"))
    plugins = document.get("plugins") or []
    plugin = plugins[0].get("name") if plugins and isinstance(plugins[0], dict) else None
    market = document.get("name")
    if not isinstance(market, str) or not isinstance(plugin, str):
        raise ValueError(f"{path} does not name its marketplace and plugin")
    return market, plugin


def _run_host(command: list[str], harness: str, home: Path) -> None:
    env = os.environ.copy()
    env[_HOME_ENV[harness]] = str(home)
    if shutil.which(command[0]) is None:
        raise ValueError(f"{command[0]} is not on PATH; install the {harness} CLI or run the adapter's INSTALL.md yourself")
    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=300)
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise ValueError(f"{' '.join(command)} failed: {detail}")


def _opencode_config(home: Path) -> Path:
    named = home / "opencode.json"
    nested = home / ".config" / "opencode" / "opencode.json"
    if named.is_file():
        return named
    if nested.is_file():
        return nested
    return named


def install_adapter(adapter_dir: Path, harness: str, home: Path) -> list[str]:
    """Install one built adapter into one harness home. Returns what was done."""
    adapter = adapter_dir.resolve()
    if harness not in HARNESSES:
        raise ValueError(f"harness must be one of {', '.join(HARNESSES)}")
    if not (adapter / "INSTALL.md").is_file():
        raise ValueError(f"{adapter} is not a built adapter (no INSTALL.md); build the release first")
    home = home.resolve()
    home.mkdir(parents=True, exist_ok=True)
    done: list[str] = []

    if harness == "claude-code":
        market, plugin = _marketplace_names(adapter, harness)
        _run_host(["claude", "plugin", "marketplace", "add", str(adapter)], harness, home)
        done.append(f"claude plugin marketplace add {adapter} (CLAUDE_CONFIG_DIR={home})")
        _run_host(["claude", "plugin", "install", f"{plugin}@{market}"], harness, home)
        done.append(f"claude plugin install {plugin}@{market}")
        return done

    if harness == "codex":
        market, plugin = _marketplace_names(adapter, harness)
        _run_host(["codex", "plugin", "marketplace", "add", str(adapter)], harness, home)
        done.append(f"codex plugin marketplace add {adapter} (CODEX_HOME={home})")
        _run_host(["codex", "plugin", "add", f"{plugin}@{market}"], harness, home)
        done.append(f"codex plugin add {plugin}@{market}")
        return done

    if harness == "pi":
        _run_host(["pi", "install", str(adapter)], harness, home)
        done.append(f"pi install {adapter} (PI_CODING_AGENT_DIR={home})")
        return done

    # opencode: its INSTALL.md is a config edit, not a command.
    config_path = _opencode_config(home)
    document: dict[str, Any] = {}
    if config_path.is_file():
        document = json.loads(config_path.read_text(encoding="utf-8"))
        if not isinstance(document, dict):
            raise ValueError(f"{config_path} is not a JSON object; not touching it")
    plugins = document.get("plugins")
    if plugins is None:
        plugins = []
    if not isinstance(plugins, list):
        raise ValueError(f"{config_path} has a non-list `plugins`; not touching it")
    url = adapter.as_uri()
    if url not in plugins:
        plugins.append(url)
    document["plugins"] = plugins
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    done.append(f"added {url} to plugins in {config_path}")
    return done
