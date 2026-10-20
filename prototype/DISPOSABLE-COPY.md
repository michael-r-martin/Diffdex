# Disposable installed-app prototype

The locally copied VS Code 1.142.0 bundle is patched in `.prototype-runtime/Codex Diff Lab.app`. The original application's workbench hash was verified unchanged after patching. APFS copy-on-write cloning avoids duplicating the full installation's disk usage immediately.

The copied application has an ad-hoc local development signature. `codesign --verify --deep --strict` passed. Gatekeeper has not been disabled. The initial unsigned copy was rejected by macOS and removed before recreation.

Launch with `sh prototype/launch-copy.sh`. This creates a fresh temporary profile, isolates shared storage and extensions, loads the companion extension, and opens the project. Updates are disabled in the temporary profile. An initial early prototype launch before shared-storage isolation opened the existing shared-storage database; subsequent launches explicitly isolate it.

Deleted rows now come from the selected chat's captured snapshots. The extension calls the private `_codexDiff.setChanges` command; the patched editor displays matching hunks automatically, without a toggle or cursor dependency. See [hook setup](../hooks/README.md). No demo rows are injected.

VS Code may report that the installation appears corrupt: its own integrity checks detect the deliberately modified bundle, independently of macOS signing. Those checks remain enabled. The warning concerns this disposable copy.

The initial in-file renderer was visually confirmed by the user on 19 October 2026. The live snapshot bridge subsequently passed an automated test inside the actual patched editor with synthetic hook events. Mac-app hook firing still requires a chat that has loaded the trusted configuration.

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
