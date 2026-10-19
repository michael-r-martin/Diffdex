# Alternative source-build spike (not built)

The active, user-verified approach is the [disposable installed-app patch](DISPOSABLE-COPY.md). This document and `codexDeletedLines.ts` preserve the earlier source-build draft; their cursor-based toggle is not the current runtime behavior.

This candidate contribution creates three visual deleted-code rows above the cursor in an ordinary editor. It does not edit the document. Repeating the command removes the rows; changing the document clears them. It is a hard-coded rendering test, not live diff integration.

Status: source draft only. Compilation, internal API compatibility, rendering, and save behavior have NOT been verified. The full source build is blocked by available disk space (about 4 GB when checked). The request to download the source entry point was declined, so no source checkout or build dependencies were downloaded.

Target upstream revision returned by the official repository: `113947563a3837013dbff0095e2bf29880b5d354`.

## Integration once a build location is available

Use a separate VS Code checkout in a path without spaces. Follow the official prerequisites and build instructions at https://github.com/microsoft/vscode/wiki/How-to-Contribute and the checkout's `.nvmrc`.

1. Copy `codexDeletedLines.ts` to `src/vs/editor/codexDeletedLines.ts`.
2. Add `import './codexDeletedLines.js';` to `src/vs/editor/editor.all.ts`.
3. Build and launch the separate Code - OSS development application with an isolated user-data directory. Do not modify the installed VS Code application.
4. Open this project's `demo/view-zone-demo.js` in its ordinary editor.
5. Put the cursor on the return statement and run **Codex Prototype: Toggle Deleted Rows at Cursor**.

The expected result is three red deleted lines above the green return statement, occupying their own visual rows. Check scrolling and changing font size. Toggle off and on. Type: the overlay should clear. Save: the original three deleted lines must not appear in file contents.

This is the first milestone only. A private extension bridge and live snapshots come after this renderer is validated.
