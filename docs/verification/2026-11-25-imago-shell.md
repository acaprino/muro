# Muro on Imago's shell: the packages (2026-11-25)

| Package | Version | SHA-256 |
|---|---|---|
| `acaprino-sigrid-6.6.0.tgz`, as the release's `manifest.json` says | 6.6.0 | `67699342783fe5b6bafce0fa230478dd819740eba9d9cbdda3898a2c42a8a378` |
| `acaprino-imago-1.0.1.tgz`, as GitHub says of the release's asset | 1.0.1 | `c828f7578931b6f61a4c5595272c929fe7c646cdfd694941b68adaf045adcb88` |

The SHA-256 of Sigrid's `manifest.json` is `710d8612955b7e94f5e97d7e421411b9fbfae8709d7e97bf33f3eadc0a6cf44d`. The two tarballs
were read, not run. `package-lock.json` is the artifact of the throwaway workflow of commit c59eca2 (run 45603172151).

The page was tested in a pretended window of Tauri (`apps/desktop/tests/browser-helper.mjs`) with a fake transport; the real
window was not opened.
