# Codex in-editor diffs

Prototype for showing Codex changes directly inside normal VS Code file editors, including deleted code on separate visual rows.

## Current working prototype

The disposable VS Code patch renders three deleted rows automatically above the replacement in `demo/view-zone-demo.js`. It does not depend on cursor position or a toggle, and does not insert deleted text into the document. The user confirmed the in-file rendering works on 19 October 2026.

```sh
sh prototype/launch-copy.sh
```

This requires the locally prepared disposable app. See [setup and signing](prototype/DISPOSABLE-COPY.md) to reproduce it. The copied app, profiles, and patch manifest are ignored by Git. The original installed VS Code is not patched.

This is currently a hard-coded rendering spike. Codex hooks, per-chat snapshots, live diff rendering, and review actions are not connected yet.

## Project layout

- `prototype/runtime-overlay.js`: active editor-core view-zone renderer.
- `prototype/patch-copy.cjs`: hash-pinned patcher for the disposable VS Code 1.142.0 bundle.
- `prototype/launch-copy.sh`: launches the copy with isolated profile, shared storage, and extensions.
- `demo/view-zone-demo.js`: actual editable demo file.
- `test/`: line-diff and overlay lifecycle tests.
- `src/` and `.vscode/launch.json`: earlier standard-extension experiment. Public decorations did not produce separate deleted rows; retained for reference and the small diff implementation.
- `prototype/codexDeletedLines.ts`: uncompiled source-build alternative, described in [source-build notes](prototype/README.md).

## Validation

No dependency installation is needed. Use Node.js with its built-in test runner:

```sh
npm test
npm run check
```

Tests cover line replacements, edge deletions, CRLF, a size guard, automatic positioning, late editor initialization, and excluding chat inputs. Syntax checks cover the active JavaScript and launch script. They do not replace visual testing in the patched application.

## Constraints

The patch targets one exact installed bundle hash and refuses unknown versions. VS Code's integrity warning is expected in the modified copy; integrity checks remain enabled. The legacy diff algorithm has a 2,000,000 line-pair limit. A distributable extension alone cannot provide this prototype's internal editor access.
