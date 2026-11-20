# Policy wording verified from pinned GitHub blobs (2026-11-20)

The three pinned originals used by `tests/test_policy_original_wording.py` were independently fetched through the GitHub connector. This avoids the unavailable local Git network transport without changing repository tests or replacing upstream content with invented fixtures.

| Source and original | Pinned commit | Verified Git blob SHA |
|---|---|---|
| `ayghri/i-have-adhd`, `skills/i-have-adhd/SKILL.md` | `1ecea1993b7fce257ffbd686c070948b5e07eda6` | `6c42757ffae37e442adfb52fbba2a8609f1cff00` |
| `DietrichGebert/ponytail`, `.agents/rules/ponytail.md` | `7801d061243d7b753bad0e0b3c057cd250b11755` | `b314fa6ea92e5ee4f3557f374e9d64213c95bb61` |
| `pengqianhan/open-paper-skills`, `skills/paper-search/SKILL.md` | `f85fd3dc80720dfa42fb5ab069f232f28c831109` | `4a13f7269d334fcff09d35c6b9ded2b3aa374eaa` |

Each returned UTF-8 text was checked with `SHA1('blob ' + byte_length + NUL + bytes)` against the API's blob identity. All three match. Repository, commit and path are checked against the current manifest before supplying a byte string to the test fixture.

## Assertion execution

A scratch harness imported the actual, unchanged `tests/test_policy_original_wording.py`. It replaced only the imported `source_repository` and `_blob` transport functions inside that scratch process with the verified byte lookup, then called the original fixture's `__wrapped__` function. The fixture's frontmatter removal and scholarly-rule extraction ran unchanged.

All test assertions then ran unchanged: **8 passed, 0 failed** (five policy cases plus the three factory-prompt parameter cases). They verify original lines and order, the single marked Ponytail closing-line change, explicit marking of Marionette's added text, explanation routing, coexistence decisions and the factory rule.

This is an offline execution of the unchanged assertion bodies using independently verified upstream evidence. It is **not** a successful invocation of the tests' normal network/Git fixture through pytest. CI must still run the normal test file with its original transport. Repository tests were not modified for this check.

## Generated-adapter limits after the extension

- Session text: **12,174 characters**, within the declared **24,000-character** allowance.
- Generated skill counts: **16 per host** on Claude Code, Codex, Pi, OpenCode and Hermes; longest entry description **1,007 characters**, below 1,024.
- Executed the current generated Hermes registration and callbacks against the contract recorder: two context pieces of **7,826** and **4,345** characters, each below its 8,000-character limit; joined text preserves the full policy, and replay with the policy already in history sends no duplicate.

These checks establish wording preservation and the inspected generated limits. They do not establish model compliance, a live Hermes conversation or a complete fresh release build.

Scratch evidence: `policy-upstream.json`, `verify_policy_originals.py`, `policy-originals-result.json` under the review's `adapters/` evidence directory.
