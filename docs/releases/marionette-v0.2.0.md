# Marionette 0.2.0

- New sources: open-paper-skills, TokenEconomizer, claude-design-system-prompt, Ponytail v5.3.3 and i-have-adhd v0.4.1. The catalog has 29 capabilities.
- Permanent policy: Ponytail and i-have-adhd in their own words, delivered natively on Claude Code, Codex, OpenCode, Pi and Hermes.
- Every capability was re-read against its pinned original. Rules that had been lost or softened are back; a body is an entry prompt that points to the packaged original, by file and section, for what a task needs.
- Nine source files the plugin does not need are no longer packaged.
- No limit of the package's own on what an absorbed command sends off the machine: the source's statement, the host's permissions and the user decide.

Install: unpack `marionette-0.2.0.zip` and follow `adapters/<host>/INSTALL.md`.

Verification: `python -m pytest -q` 471 passed, 15 skipped; `--validate` and `--check-sources` OK.
Not executed: host sessions after the re-read, a live Hermes session, the routing eval.
