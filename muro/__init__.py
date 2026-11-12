# muro/__init__.py
__version__ = "0.1.0"  # the factory's own version; a package's version is in its sources.json

from .core import (
    validate_plugin_identity,
    parse_capability,
    validate_capabilities_and_router,
    resolve_plan,
    parse_router,
    Capability,
    RouterRow,
)
from .sources import check_sources, parse_capabilities
from .release import build_release

__all__ = [
    "validate_plugin_identity",
    "parse_capability",
    "validate_capabilities_and_router",
    "resolve_plan",
    "parse_router",
    "check_sources",
    "parse_capabilities",
    "build_release",
    "Capability",
    "RouterRow",
]
