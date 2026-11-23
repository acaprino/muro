@AGENTS.md

For UI work, read node_modules/@acaprino/sigrid/AGENTS.md and DESIGN.md, apply them and inspect the project files they reference.
Run `npx --no sigrid-check apps/desktop/src` before you say UI work is done (see "Desktop UI ownership" in AGENTS.md and ADR-0031).
Every app of the suite has Sigrid's one look: never a component, class or stylesheet of Muro's own; a missing part is added to Sigrid (see "Desktop UI ownership" in AGENTS.md).


Never run `cargo` (build, test, clippy, check, run, doc), `tauri dev` or `tauri build` on this machine: Rust is built and tested on GitHub Actions only. See "Rust is built and tested on GitHub only" in AGENTS.md.

Never compile, build or lint on this machine (`cargo`, `tauri`, `tsc`, `vite build`, bundlers, `npm run build`, `npm run verify`,
`npm install` of a git dependency that runs `prepare`): GitHub Actions does it. Only an explicit request of the owner, in that
request, to build or test locally overrides this. See "Nothing is compiled on this machine" in AGENTS.md.
