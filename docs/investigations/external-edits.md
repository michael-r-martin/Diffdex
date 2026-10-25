# External edits and stale review state

Investigation: 25 October 2026. Scope: the working tree at the start of this investigation, including its existing uncommitted review-save and Git-review work. This is not evidence that the same code was running in the repository where the food-analysis prompt reverted.

## Findings

Two unsafe behaviors were reproduced with the real extension command handlers and injected workbench save handler, a real temporary filesystem, and simulated VS Code services:

1. With an existing review baseline A, an open buffer still containing A, a new capture B, and a newer external disk write C, refresh merged A → B into the stale buffer without reading C. The buffer became B and dirty. Refresh itself did not call save. A later editor autosave or review save could persist that stale buffer.
2. Accept, reject, acceptance undo/redo restoration, and rejection undo/redo requested saves of the whole buffer. The save bridge read disk but still called the native save when disk differed from its expected baseline. When the native service was modeled with already-current file metadata, those calls overwrote C with B (accept/undo) or A (reject/redo). Native modified-since protection was not an explicit content guard.

A comparison run reconstructed the pre-fix merge and save behavior in memory without reverting working-tree files. Six of eight external-edit regression scenarios failed; accept and reject physically replaced the temporary external file with older contents. With the fix all eight pass. The two scenarios that already passed were a watcher-loaded newer buffer with overlapping changes, and a legitimate non-overlapping incoming merge.

These tests establish a failure mechanism, not the process responsible for the reported production incident. The service simulation deliberately allows native saves once cached file metadata is current. An actual desktop watcher timing reproduction has not been run in this investigation. Filesystem stat/etag race behavior still belongs to the native editor; the patch retains its conflict checks rather than using forced saves.

## Content mutation and save paths

| Entry point | Buffer effect | Source-file persistence |
| --- | --- | --- |
| `refresh()` (startup, one-second poll, visible-editor/content events, commands) | `replaceBuffer` can merge a changed latest capture through a `WorkspaceEdit` | No direct save; dirty buffer may subsequently be saved by the editor |
| `resolveIncoming` → Load Codex version | `replaceBuffer` loads the captured snapshot, undoably | No direct save; editor save/autosave may persist it |
| `reviewBlock` → reject | Computes an inverse merge against the live buffer and applies a `WorkspaceEdit` | Requests `createReviewSaver.save` after refresh/state persistence |
| `reviewBlock` → accept | Metadata only; adds a native review undo element | Requests the same whole-document save, even though acceptance changes no text |
| `reviewFile`, sidebar block/all actions | Delegate to `reviewBlock` for each decision | Same save path; file/bulk actions are not separate writers |
| `restoreReview` from native acceptance undo/redo | Restores review metadata after checking signature and buffer text | Requests the same saver |
| `onDidChangeTextDocument` → recognized rejection undo/redo | The editor's native undo/redo changes content | Schedules `afterUndoRedo`; ordinary typing undo is not saved by this path |
| `createReviewSaver` → `_codexDiff.saveReviewFile` | No content replacement | Workbench `textFileService.save`, skipping save participants; native modified-since checks retained |
| Normal editor save / autosave | Saves current buffer, including earlier Diffdex edits | Owned by VS Code; now observed via will-save/did-save diagnostics |

The renderer (`prototype/runtime-overlay.js`) only creates view zones/decorations and dispatches review commands. Review, merge, projection, and combined-document helpers compute text/metadata; they do not write files. Git reconciliation runs read-only Git queries and updates review checkpoints, not source files.

Other filesystem writes were also traced:

- `hooks/capture.cjs` writes/renames JSON under the configured capture store (`pending`, `original`, `files`, `session.json`) and removes completed pending records. It reads source files; it does not restore them. A custom capture-store path controls where these records go.
- `saveReviews` and Git checkpoints use VS Code workspace storage. Historical text there can influence later merges/actions but is not itself a source-file write.
- `src/setup.js` and `scripts/install-hooks.cjs` back up and replace `.codex/hooks.json`. **The packaged extension automatically reinstalls its hooks on activation, workspace-folder additions, and trust grants.** An empty hooks object may therefore be replaced on a later activation. Development mode installs only through the explicit command.
- Optional `CODEX_DIFF_DIAGNOSTICS` writes `.prototype-runtime/render-status.json`.
- Packaging, patching, and bridge-install scripts write disposable app/extension bundles, settings, receipts, and backups. They are build/setup actions, not the one-second source-file refresh path. `scripts/vscode-e2e.cjs` and packaging verification intentionally write their test fixtures.

Disabling hooks does not disable the extension's polling, existing snapshots, review actions, or editor save behavior. The observation that the prompt stayed intact after disabling hooks does not distinguish these mechanisms or establish causation.

## Minimal fix implemented

- Refresh merges a capture only while its after-text still exactly matches disk. `replaceBuffer` rechecks disk immediately before submitting the edit. A stale capture remains review evidence and is reconciled against current text, without being reapplied to the buffer.
- Rejection refuses to modify a stale buffer when disk differs from both its baseline and current buffer, preventing that mutation from reaching ordinary editor autosave.
- Explicit incoming loads also reject a capture superseded on disk and report the refusal.
- The native save bridge refuses unexpected disk contents. The expected baseline must match disk, or disk must already equal the current buffer (safe after a manual save). Missing/unreadable files fail closed. It updates saved metadata only after these checks, retaining native stat/etag conflict checks for subsequent writes.
- Saves carry the document version at the review decision, before asynchronous state persistence/refresh and queueing. The saver checks it when dequeued; the native bridge checks again before and after its asynchronous disk read. A changed version cannot silently become a different save request.

This preserves the existing incoming-merge and review-save design. It does not introduce automatic filesystem restoration or disable native undo.

## Diagnostics and verification

The **Codex Diffs** Output channel contains `[write]` JSON records with timestamp, URI, source, phase, document version, dirty state, and SHA-256 buffer/disk fingerprints. Content is not logged. Sources distinguish `refresh.incoming`, `resolveIncoming.load`, `review.accept`, `review.reject`, `review.restore`, `review.undoRedo`, and `editor.save`. Editor save records include the native reason (1 explicit, 2 delay, 3 focus change); they can be correlated with preceding Diffdex requests. The workbench developer console additionally contains `[Diffdex write]` checks/start/finish/block records with the model version and requested version.

A `buffer-replace` or `save-request` is an attempt, not proof of disk persistence. Use `save-finish`, `did-save`, hashes, and the actual file to confirm the outcome. External processes' writes are not attributed by these editor logs.

Run:

```sh
node --test test/external-edits.test.js test/review-save.test.js
npm test
npm run check
```

The regression harness covers external edits with and without a watcher update, accept/reject, both kinds of review undo/redo, outdated explicit incoming resolution, and legitimate independent incoming merges. Saver tests cover queue/version races, version changes during disk reads, baseline mismatch, and native conflict-check preservation.

Both the extension source and injected workbench bridge must be rebuilt/reloaded together for the change to run in Diffdex. No installed or packaged app, hook configuration, or affected external repository was changed during this investigation. Existing binaries still need rebuilding; live desktop timing and the original incident remain unverified.
