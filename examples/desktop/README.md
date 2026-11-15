# Desktop CLI examples

These requests use the same backend as the Tauri UI. Run commands from a complete portable Muro folder. To isolate an example, pass `--data C:/Temp/muro-example` before `request` or `serve`.

Read the current state and prepare a plan:

```powershell
./tools/muroctl.exe request snapshot
./tools/muroctl.exe request plan
./tools/mukade.exe muro-resolve claude-code
```

Write request payloads as UTF-8 JSON without a BOM. `examples/desktop/verify.json` is a read-only maintenance request:

```powershell
./tools/muroctl.exe request maintenance --input examples/desktop/verify.json
```

For apply, replace `plan_id` in `apply.json` with the actual ID returned by `plan`, inspect the operations, then run:

```powershell
./tools/muroctl.exe request apply --input examples/desktop/apply.json
```

The placeholder is deliberately not a valid saved plan. Application rejects stale registry/inventory/artifact inputs. Registry edits need the current `revision` returned by `snapshot`. Targets need explicit configuration roots; do not substitute a discovered session directory.

`requests.ndjson` illustrates the long-lived protocol used by the native app. Each response has the matching `id`, `ok`, and either `result` or `error`. Pipe it to `./tools/muroctl.exe serve` while no other server owns that data directory. This transport retains background job threads while its input remains open.

To create and inspect a plugin's Markdown instruction folder, replace the ID in `custom-instructions.json` with a registered plugin ID:

```powershell
./tools/muroctl.exe request custom_instructions --input examples/desktop/custom-instructions.json
```

Write `.md` files under the returned `path`, then run an AI adaptation before syncing. Editing or removing a file makes prior distributions stale; the folder's original content remains separate from generated policy. `open_custom_instructions` with the same payload opens the folder explicitly.

See `docs/desktop-cli.md` for the full Markdown workflow, target/plugin payloads, source resolution, adaptation, cancellation, reinstall and exclusive synchronization.
