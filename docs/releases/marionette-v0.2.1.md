# Marionette 0.2.1

Marionette now gives brief ADHD progress updates while waiting for agents or long
operations, making important changes, and taking autonomous decisions. Updates
state what is done, what remains and the next step; autonomous decisions include
their reason. Existing ADHD mode controls and the rule against redundant closing
recaps remain in effect.

The rule is authored in `examples/marionette/custom-instructions/recap-adhd.md`.
Muro's current factory reads package-local Markdown as host-LLM harmonization
input and records what each part becomes: session guidance, capabilities or
supported hooks. Input changes invalidate older delivery, and generated packages
carry only the originals needed at runtime. The complete adapter loads the
resulting policy through its existing native channel.

This release also includes the catalog updates already merged since 0.2.0:
EGM's design documentation work and the Superpowers planning/execution chain,
harmonized with the existing responsibilities. Focused discovery and direct-step
handoff improvements are included in the bundled runtime.

## Use and upgrade

Read [the custom-instructions guide](../custom-instructions.md) for Markdown
layout, factory/host-AI commands, edit/removal and verification. Desktop users
have folder access, file listing and stale-distribution indicators; this release
asset is the **Marionette plugin**, not a Windows desktop binary or a new factory
tag. The factory's current source checkout supports the new input model.

Install the complete native adapter from the ZIP, following its `INSTALL.md`.
Skill folders alone do not activate permanent session policy. Codex's `/hooks`
trust step remains required. Hermes requires a new session after the policy
upgrade; its long-policy transport retains the documented host limitations.

## Verification

The [verification record](../verification/2026-11-15-custom-instructions.md)
records unit/integration checks, the 62-case blind host-AI routing evaluation,
source-pin verification, staged standalone launchers and live-host evidence.
The owner Markdown is retained byte-for-byte and its generated session text is
checked alongside the pinned upstream originals. Fixtures prove mechanics, not
universal compliance by an AI model.

No user's personal plugins or settings were installed or replaced during this
work. Publication uses the repository's Release workflow and a new versioned ZIP
with a SHA-256 checksum; no previous release is replaced.
