# Full desktop review — 2026-11-15

What this repo does: Muro builds coordinated multi-host plugins. This change adds a native desktop and portable command-line tools that keep a desired plugin registry and reconcile installed harness plugins. Assumed load: one owner using the UI, its background sync worker and occasional CLI calls against the same registry.

Scope: all new registry files and tests, desktop runtime/CLI/jobs/process management, native shell, frontend, resource/tool/package scripts, desktop documentation and examples, and connected factory adapter contracts. This is a review snapshot of the uncommitted implementation, not a release approval. No production source was changed during this review. Scratch fixtures and this report were written. Earlier implementation work and its verification are separate.

## Must fix

1. **P1 — Tree hashes do not uniquely identify file contents** — `crates/muro-registry/src/storage.rs:80`.
   **What this is:** The digest combines each path and file content with NUL separators. **Problem:** A file `a` containing `x\0b\0y` hashes identically to two files, `a` containing `x` and `b` containing `y`. The isolated probe produced identical digest `fe007316ed477746e8c7f7c5f7d40fa541583c99f3fc8581eff209dbce4cf063`, and an existing plan accepted the changed tree. **Fix:** Frame paths/content with lengths or compose per-file hashes using unambiguous records. **If we skip it:** Artifact identity and changed-source rejection can accept different files as the reviewed artifact.

2. **P1 — Claude reinstall reports success without repairing files** — `crates/muro-registry/src/native.rs:438`.
   **What this is:** Native installation selects `plugin update` whenever a previous installation exists. **Problem:** A real isolated Claude installation was corrupted by replacing its installed `SKILL.md` with `BROKEN`; reinstall succeeded but the file remained `BROKEN`. **Fix:** Pass the operation type into the adapter, perform a real reinstall, and verify the repaired content. **If we skip it:** Maintenance can certify a broken installation as repaired.

3. **P1 — Moving a portable folder leaves paths pointing at its old location** — `crates/muro-desktop-runtime/src/cli.rs:405`, `crates/muro-desktop-runtime/src/cli.rs:480`.
   **What this is:** Relocation stores a canonical Windows data path, then compares stored artifact paths with `strip_prefix`. **Problem:** The stored root has the `\\?\` prefix while ordinary artifact paths do not. An isolated copy from `old` to `new` left the distribution path under `old`. **Fix:** Normalize both path representations before comparing and rebasing, retaining external target roots. **If we skip it:** Removing the original portable folder breaks access to its own distributions. Reproduction: `.scratch/review-portable-paths.py`.

4. **P2 — Pi updates erase resource selection settings** — `crates/muro-registry/src/native.rs:284`.
   **What this is:** Updating a package removes the old configuration entry and appends a source string. **Problem:** An object with `skills: []` and `extensions: ["allowed.js"]` becomes a plain path, losing its filters. **Fix:** Replace only the source while preserving the object's other fields. **If we skip it:** Updating can activate resources the user explicitly excluded.

5. **P2 — Changing a source can still install the old source's artifact** — `apps/desktop/src/forms.ts:19`.
   **What this is:** Editing a source clears upstream metadata but preserves its distributions. **Problem:** A browser probe changed A to B; the saved payload still referenced A's native artifact. The backend accepted it and planned its installation without blockers. **Fix:** Invalidate source-derived distributions when the source changes and enforce the binding in backend validation. **If we skip it:** The registry can display source B while deploying A.

6. **P2 — Different valid IDs overwrite one receipt** — `crates/muro-registry/src/service.rs:555`.
   **What this is:** Receipt keys concatenate target and plugin IDs using `--`, which is also valid inside either ID. **Problem:** `(x--y, z)` and `(x, y--z)` both become `x--y--z`. The isolated first apply installed both, overwrote the first receipt, then failed verification with `Installed version did not match "z"`. **Fix:** Use nested keys or an unambiguous tuple encoding. **If we skip it:** Valid configurations lose installation ownership records.

7. **P2 — Automatic resolution deletes explicitly configured distributions** — `crates/muro-registry/src/sources.rs:207`, `apps/desktop/src-tauri/src/main.rs:133`.
   **What this is:** Resolution replaces the distribution array and preserves only matching `origin: muro` entries. Automatic sync resolves every plugin. **Problem:** A valid manually configured OpenCode distribution with a plain `package.json` initially had one install operation and no blockers. Resolution deleted it; the next plan demanded AI adaptation. **Fix:** Distinguish explicit artifacts from resolver-owned artifacts and preserve the former. **If we skip it:** Enabling automatic sync can remove working configuration and block installation.

8. **P2 — Reinstall depends on today's source instead of the recorded artifact** — `crates/muro-registry/src/service.rs:405`.
   **What this is:** Planning always prepares the current distribution before considering reinstall. **Problem:** Changed source bytes produced a new reinstall digest; removing the source blocked reinstall even with the original artifact intact. **Fix:** Reinstall from the verified receipt artifact, keeping update as a separate operation. **If we skip it:** Repair may change what is installed or fail despite having the original artifact.

9. **P2 — Disabled desired plugins are treated as synchronized** — `crates/muro-registry/src/native.rs:182`, `crates/muro-registry/src/service.rs:426`.
   **What this is:** Inventory and reconciliation ignore Claude activation state. **Problem:** After a real isolated `claude plugin disable`, the next plan returned `operations: []`. **Fix:** Observe activation state and explicitly reconcile it with desired state. **If we skip it:** Sync reports alignment while the desired plugin remains inactive.

10. **P2 — The documented portable build command fails immediately** — `docs/desktop.md:21`, `scripts/desktop_package.py:14`.
    **What this is:** Packaging requires `--mukade-license`. **Problem:** The documented command omits it and exits with `desktop_package.py: error: the following arguments are required: --mukade-license`. **Fix:** Include the pinned source license path and instructions for obtaining it. **If we skip it:** Following the documentation cannot produce the portable package.

## Evidence and limits

- Review probes: isolated CLI registries, browser form extraction, copied portable data, and real Claude commands against temporary profiles. No personal harness configuration was modified and no paid AI run was started.
- Registry tests: 10 passed, 3 native cases ignored. Frontend model tests: 6 passed. Desktop Python tests: 12 passed in the reviewer run. Existing tests did not cover the concrete cases above.
- Prior implementation verification: full Python suite 535 passed and 8 skipped after correcting temporary-path environment; factory validation/source checks/fresh staging passed. Prior native UI smoke passed CRUD, persistence and isolated OpenCode configuration sync. These results do not validate the defects found here or certify the final portable build.
- Not checked live in this review: Codex/Hermes mutation, remote Git release resolution, a paid AI adaptation, exhaustive crash injection, every original Python factory module or every browser state. The original factory was inspected at relevant integration boundaries rather than audited line by line.
- Previously reported source-revision certification was corrected before this review by manifest binding validation and its regression test. Prompt-based job work-directory rules are documented as instructions, not an OS sandbox; Windows process jobs control lifetime.

Verdict: fix these findings before treating the desktop as ready for real plugin management. The implementation and final portable verification remain open.
