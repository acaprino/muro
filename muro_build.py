#!/usr/bin/env python3
"""Muro factory build script — entry point."""
from muro.cli import main
from muro import (validate_plugin_identity, check_sources, parse_capability,
                  validate_capabilities_and_router, resolve_plan, build_release)

if __name__ == "__main__":
    raise SystemExit(main())
