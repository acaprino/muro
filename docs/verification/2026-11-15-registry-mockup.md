# Registry desktop mockup

Scope: interactive visual prototype requested by the owner, using ui-ux-pro-max and the existing Muro logo. No production registry or plugin operations implemented in this artifact.

Artifact: `docs/mockups/muro-registry.html`. References `docs/assets/branding/muro-logo.png` unchanged. No external scripts, fonts or network requests. All versions, inventories and operation results are explicitly illustrative. State resets on reload.

Design: use the logo's violet, near-black navy and ice colors; burgundy for destructive controls. System sans-serif and monospace for versions; sidebar, compact registry table and plugin inspector. ui-ux-pro-max searches informed focus visibility, dark contrast, semantic controls and reduced motion. Its generated landing-page patterns did not match this desktop tool and were not adopted.

Verification: Playwright from the existing Xiox development installation with installed Microsoft Edge, headless. Initial bundled Chromium launch was unavailable; using Edge required no installation. Browser run passed rendering with no page errors, navigation to Sync/Harness/Registry, sync confirmation and completion, closing the harness modal with Escape, adding a plugin and filtering it with search. Inspected desktop screenshot at 1512px and narrow layout at 390px. Tables scroll within their panel on narrow screens. Desktop and sync screenshots accompany the HTML.

Limits: screenshots verify browser rendering, not native Tauri behavior. No live Mukade discovery, harness install/uninstall, AI adaptation or release is performed by the mockup. Factory source and existing build outputs were not changed. Production factory tests were not run for this visual-only prototype.
