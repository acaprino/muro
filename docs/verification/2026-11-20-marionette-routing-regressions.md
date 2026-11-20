# Marionette routing and amendment regressions, 2026-11-20

Base commit `aedcb26cd7ab9c1ecf2ea1d334a7a9072f5bf87c` on `develop`.

| Check | Result | What it measures |
| --- | --- | --- |
| Ten original runtime probes, replayed against the revised package | 7/10 before, 10/10 after | Real plan, confirm and resume behavior, including changed deliverables, changed Office intent and exact prerequisite instances |
| Focused Python integration and regression run | 202 passed | Amend, conditional prerequisites, routing, evaluator, adapter policy, Wayfinder and scoped checks. |
| Final evaluator run | 45 passed | Includes complete alternative routes, rejects mixed routes, and validates alternate graphs. Some tests overlap with the integration run. |
| Blinded host classification | 94/94 cases accepted in one pass | Selection and stopping decisions. The test uses neutral IDs. The host saw the classifier material and requests. The person or agent defining the final acceptable routes did not see the host decisions before scoring. |

The corpus grew from 76 to 94 tasks. Sixty-three canonical expectations specify the exact selections, including intent and any declared conditional prerequisite. Four cases name complete alternative outcomes. The other cases use status and capability order plus the runtime's normal validity checks. This score measures routing on these requests. Quality of the final artifact and adherence to the workflow during a native host session require separate measurement.

## Replay the recorded classification

From the repository root, run the command below against the checked-in decisions. A changed catalog invalidates these decisions and requires a fresh classification.

```sh
python -m muro eval score docs/verification/marionette-routing-20261120/decisions.json --manifest examples/marionette/sources.json
```

Expected result is 94 total, 94 passed, zero failures. The catalog digest is `2a73854569d8ad2de593fc8351035d2fc620b43b7808bb21af980356654412ce`. The evaluated `eval-cases.json` SHA-256 with normalized LF line endings is `49d375bc578fc0e642deb5b4dec6b1b9772d9d5115161ea94a04cf258a806d3c`. The raw outcomes of the ten runtime probes are in the same directory as `decisions.json`.

## Test boundaries

The native Claude plugin passed strict manifest validation. The native interactive session timed out after 55 seconds without a usable response. The full GitHub Actions run remains pending. This host blocked the normal GitHub DNS fetch and the loopback server in five HTTP simulation tests. Separate checks against GitHub's API verified the pinned Wayfinder files and matched the three original policy texts used by eight assertions. See the two companion verification records in this directory for the file hashes and procedure.
