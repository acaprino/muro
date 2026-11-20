# Desktop: Start with Windows reads its Run value by its name (2026-11-20)

## The failure

The `Rust tests` step of the `Tests` workflow failed now and then on `windows-latest`, each time in another test of
`crates/muro-desktop-runtime/tests/runtime.rs` that expects Muro's Run value to read as current: run 44800769622 on
`a5b8166` (a commit that changed only `.github/workflows/release.yml`) failed in
`repair_rewrites_a_value_that_names_a_folder`, its second attempt in
`repair_reads_a_value_with_variables_as_windows_starts_it` (`runtime.rs:248`, `left: Bool(false)`, `right: true`).

## The cause

`autostart::state` asks `run_key::holds` whether the value holds Muro's command, and `holds` searched the whole Run key
with `reg query <key> /f <data> /d /c /e`. reg.exe walks the key's values one by one, and a value added or deleted
meanwhile moves the others: the search then passes over a value that is there. The tests of the same binary run in
parallel and each writes and deletes values of its own in the same key, as other programs do on a user's machine.

A probe on this machine (Windows 11, a scratch key `HKCU\Software\MuroFlakeProbe`, 20 values, deleted at the end), with
a second process adding and deleting values in the key, as the tests do:

| Read | Key left alone | Key changed meanwhile |
|---|---|---|
| `reg query /f <data> /d /c /e` (the old `holds`) | 0 misses in 300 | 18, 16 and 15 misses in 300 (three runs) |
| `reg query /v <name>` (`exists`) | | 0 misses in 300 |
| the value read by its name through the registry API | | 0 misses in 3000 |

## The change

`holds` reads the value by its name through `RegGetValueW`, the code `read` already used, now shared as `get`. It still
takes only a REG_SZ exactly equal to the command (case-sensitive): it asks for both string types without expansion and
compares the type read. `RegGetValueW` checked from PowerShell (P/Invoke, the same scratch key) with the flags of each:

| Value | `holds` (REG_SZ, REG_EXPAND_SZ, no expansion) | `read` (REG_SZ), unchanged |
|---|---|---|
| REG_SZ `"C:\Muro\Muro.exe" --background` | 0, type 1, the text | 0, type 1, the text |
| REG_EXPAND_SZ `"%SystemRoot%\Muro Old\a.exe" --background` | 0, type 2, not expanded: not current | 0, type 1, expanded |
| REG_DWORD | 1630 (unsupported type): none | 1630: none |
| missing | 2 (not found): none | 2: none |

The new test `autostart_reads_its_value_while_other_values_of_the_key_change` reads the state 100 times while a thread
adds and deletes values of the Run key around Muro's, and expects every read to be current.

## Not executed

Rust is built and tested only in CI (the owner's rule), so the change and the test wait for the run on `develop`. The
new test was not run against the old `holds`: at the miss rate of the probe (5% a read) 100 reads pass the old code in
about 0.6% of the runs.
