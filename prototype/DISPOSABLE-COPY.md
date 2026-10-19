# Disposable installed-app prototype

The locally copied VS Code 1.142.0 bundle is patched in `.prototype-runtime/Codex Diff Lab.app`. The original application's workbench hash was verified unchanged after patching. APFS copy-on-write cloning avoids duplicating the full installation's disk usage immediately.

The copied application has an ad-hoc local development signature. `codesign --verify --deep --strict` passed. Gatekeeper has not been disabled. The initial unsigned copy was rejected by macOS and removed before recreation.

Launch with `sh prototype/launch-copy.sh`. This creates a fresh temporary profile, isolates shared storage and extensions, and opens `demo/view-zone-demo.js` at line 4. Updates are disabled in the temporary profile. An initial launch before shared-storage isolation opened the existing shared-storage database; subsequent launches explicitly isolate it.

In the demo editor, three red rows appear automatically above the known replacement statement, and that source line turns green. There is no toggle or cursor dependency. Inserting lines above the statement moves the overlay with it. If the statement disappears or becomes ambiguous, the overlay clears. Deleted text is a view-zone DOM node, never document content.

VS Code may report that the installation appears corrupt: its own integrity checks detect the deliberately modified bundle, independently of macOS signing. Those checks remain enabled. The warning concerns this disposable copy.

This is a hard-coded visual spike, not a live diff implementation. No Codex hooks are configured. The main bundle passes JavaScript syntax checking and the signed application starts, and the user confirmed automatic in-file rendering works on 19 October 2026. Automated visual inspection was unavailable. Inspect the developer console for `[Codex Diff Lab]` messages when debugging.

The bundle hook is pinned by SHA-256 in `patch-copy.cjs`; it deliberately refuses other versions. Every bundle modification requires re-signing the disposable copy before launch.

## Recreate the local copy

On macOS/APFS with the exact supported VS Code installation, run these commands from the project root. Close the disposable application before re-patching. The destination app must not already exist when cloning; do not copy over a running app.

```sh
mkdir -p .prototype-runtime
cp -cR '/Applications/Visual Studio Code.app' '.prototype-runtime/Codex Diff Lab.app'
node prototype/patch-copy.cjs
codesign --force --deep --sign - --preserve-metadata=entitlements '.prototype-runtime/Codex Diff Lab.app'
codesign --verify --deep --strict '.prototype-runtime/Codex Diff Lab.app'
sh prototype/launch-copy.sh
```

After editing the overlay, repeat patching, signing, verification, and launch. Each launch creates a fresh `/tmp/codex-diff-lab.*` profile; its path is recorded in the ignored runtime directory. No app binaries are committed or distributed by this repository.
