# Custom instructions for a harmonized package

Place free Markdown in `custom-instructions/` next to the package's `sources.json`.
Muro supplies these files to the host LLM alongside the existing catalog and
source evidence. The LLM decides how each instruction belongs in the generated
package; Muro does not infer meaning from filenames or keywords.

```text
my-package/
  sources.json
  custom-instructions/
    progress.md
    writing/
      explanations.md
```

Use UTF-8 `.md` files, with no required headings or frontmatter. Subdirectories
are optional. Files must be ordinary files inside this folder, not symlinks or
junctions. A file or folder name must not contain a backslash, a colon or a
line break. Non-Markdown files are not inputs. Keep this folder under version
control with the package; preserve its exact bytes across checkouts because
file hashes include line endings. This repository's `.gitattributes` does so.

## First use from the factory CLI

1. Create a Markdown file. For example: `When waiting for agents or long operations, making important changes or deciding autonomously, give a brief ADHD progress recap: what is done, what remains and the next step.`
2. Run `python muro_build.py --manifest <package>/sources.json --harmonize`.
3. Give your host AI this request, substituting the actual paths:

   > Read `<package>/.muro/factory/harmonization/PROMPT.md`. Perform the harmonization with the supplied source evidence and owner Markdown. Update this package's delivery and any affected catalog files, preserving the originals and explaining coexistence changes. Do not install or publish the result.

4. Run `--validate`, `--check-sources` and `--build --out <fresh-directory>` with the same `--manifest`. Review the generated `GUIDE.html` and install the complete adapter using its `INSTALL.md`.

The same steps as commands, where `<package>` is your package's directory:

```sh
python muro_build.py --manifest <package>/sources.json --harmonize
# Let the host AI perform the handoff above before continuing.
python muro_build.py --manifest <package>/sources.json --validate
python muro_build.py --manifest <package>/sources.json --check-sources
python muro_build.py --manifest <package>/sources.json --build --out .scratch/my-custom-package
```

Use a new output directory for the next build. Preparation and build execute no
source instructions and do not call an LLM, install a plugin or modify host
configuration. They cannot claim that AI harmonization has happened just because
files were gathered.

If you already use Muro's configured OpenAI-compatible agent, the existing
`python -m muro agent harmonize --manifest <package>/sources.json --model <your-model>`
command performs the AI step and validation directly. Credentials come from the
environment as documented in the [CLI reference](cli.md); do not put them into
your Markdown. MCP hosts can use `prepare_harmonize` and perform the same work
with their own LLM. The plain `harmonize` command remains preparation only.

## What the AI can produce

- **Permanent guidance:** included through the existing native system/developer
  policy channel, subject to each host's supported delivery and permissions.
- **Capabilities or scoped rules:** loaded when their AI-classified task needs
  them, preserving the coordinator's ownership and checks.
- **Supported hooks:** explicit event wiring through the existing delivery
  contract, with its real tools and effects declared.
- **A reasoned omission:** for example a duplicate already fully covered; an
  unresolved conflict that changes the requested outcome must be surfaced,
  rather than silently losing the owner's requirement.

One file may contribute to several forms, and several files may contribute to
one responsibility. The AI records the relevant file/section and why it chose
each form in `delivery.json`. The custom collection contributes one
6000-character allowance to the shared permanent-policy budget; creating more
files does not multiply it. No timer or hidden model call is added for recaps.

## Edit, remove and regenerate

Edit the original Markdown and repeat harmonization. Each file's SHA-256 and a
collection digest bind delivery to those exact inputs. Adding, changing,
renaming or deleting a file invalidates the old binding. Removing the last file
requires the AI to remove its old decisions and effects as well. Never fix a
stale-input error by changing only the digest: the semantics must be reviewed.

The original folder and preparation snapshot remain intact. An original that
no runtime step needs is listed by the AI in `intake_only_paths` and omitted
from the generated release. Other originals travel under `custom-instructions/`;
`SKILL.md` becomes `SKILL.source.md` so hosts do not discover a competing skill.
The generated `custom-instructions.lock.json` records the build binding. Do not
edit it or place it in your source package to skip harmonization.

A changed package needs a new version when it is released or reinstalled into
hosts that cache plugins by version. Existing installations are not changed by
editing the source folder. For Hermes, use a new session after a policy upgrade;
for Codex, the host's `/hooks` trust review still applies. See the adapter's
`INSTALL.md` for the actual channel and limitations.

## Desktop and direct registry CLI

The desktop uses the same Markdown-folder model. In the plugin's detail, open
**Custom instructions** → **Open folder**, add or edit files, press **Reload
files**, then **Adapt with AI** for each harness listed under *Instructions
changed* before syncing the generated distribution. The folder remains separate from replaceable
upstream snapshots. A native distribution without your instructions is not a
current customized build. See [desktop usage](desktop.md) and
[CLI payloads](desktop-cli.md) for the concrete controls and commands.

## Inspect the result

The generated guide shows custom file provenance and the AI's delivery reasons.
For session policy, inspect the standalone adapter's launcher:

```sh
python <release>/adapters/codex/skills/<command>/muro.py session-context
```

`<command>` is the package's command (`plugin.command` in its `sources.json`).
The recap rule of step 1, delivered as session policy, requests progress updates
during work and adds no routing step. Validation proves
binding and packaging, not that every model will follow every instruction.

## Delivery metadata for package authors

Preparation prints the exact inventory and digest for the host AI. It records:

```json
{
  "custom_instructions": {
    "digest": "<supplied collection SHA-256>",
    "files": {"custom-instructions/progress.md": "<supplied file SHA-256>"},
    "intake_only_paths": ["custom-instructions/progress.md"]
  }
}
```

Merge this object into the existing delivery document. Every file needs at
least one ordinary delivery decision whose `source` is its exact inventory
path; `content` identifies its section or subject. The host AI writes the form,
targets, reason and `intake_only_paths`; the factory supplies hashes, checks
references and performs the declared packaging. See [delivery protocol](../prompts/delivery.md).
