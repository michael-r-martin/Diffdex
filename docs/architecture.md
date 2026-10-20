# How Codex chat diffs work

The Codex Mac app edits the checkout normally. Hooks record before/after contents, a companion extension computes each chat's accumulated diff, and a patched VS Code editor displays it in the actual file.

```mermaid
flowchart TD
    A["Codex edits a file in a chat"] --> B["PreToolUse hook"]
    B --> C["Save original contents once per checkout + chat + file"]
    C --> D["Codex applies the edit"]
    D --> E["PostToolUse hook saves latest contents"]
    E --> F["Local snapshot store"]
    F --> G["VS Code extension checks every second"]
    H["Selected chat"] --> G
    G --> I["Compare original with latest snapshot"]
    I --> J{"Open file matches latest snapshot?"}
    J -->|Yes| K["Private command sends hunks to patched editor"]
    J -->|No| L["Update tracked block ranges; compare block contents"]
    L --> K
    K --> M["Deleted code: red view zones with syntax colors"]
    K --> N["Added code: green decorations on real source lines"]
```

## Capture and storage

`hooks/capture.cjs` receives structured Codex hook events. The first pre-edit event stores the file's original contents, including any existing uncommitted work. Later edits in that chat retain this baseline. Post-edit events record actual file contents, rather than assuming the proposed patch succeeded.

Snapshots live under `.prototype-runtime/captures/<checkout-hash>/<chat-hash>/`. Each chat retains its own original and latest version, so later chats do not overwrite its history. `session.json` identifies the chat and checkout; pending records correlate before/after events by tool-call ID. Files and settings stay local.

## Extension and editor

`src/store.js` loads snapshots for the open checkout. `src/extension.js` provides the chat picker and changed-file list, polls once per second, and computes hunks using `src/diff.js`. Short unchanged gaps consisting only of braces, punctuation, or whitespace are merged into their surrounding replacement. Meaningful unchanged lines remain boundaries.

The private `_codexDiff.setChanges` command forwards the selected chat's file snapshots and hunks to `prototype/runtime-overlay.js`. `src/review.js` tracks the character ranges belonging to captured blocks. Content-change events update each range and recompute its diff against the block's original text. Typing inside a block remains reviewed; Enter at its first column creates an independent line above the block; Enter at its final column starts independent code below it. Outside edits shift anchors without becoming green additions. Recent undo/redo states restore boundary ownership, and the isolated workspace state saves current boundaries between launches. Hook snapshots remain unchanged by manual edits.


Deleted rows are editor **view zones**, not inserted document text. They occupy real visual space between source lines, but do not enter saves, formatting, or language-server input. Their text is escaped and tokenized through VS Code's internal tokenizer with the file's language and theme token classes. Additions are normal decorations on the actual source lines.

## Why a patched copy?

Standard extension decorations could not create additional deleted-code rows inside a normal editor. The hash-pinned patch exposes the required internal view-zone access and a narrow command bridge. The disposable app has a local development signature; the original VS Code installation is not patched. VS Code's own modified-installation warning remains enabled.

The launcher explicitly identifies the bundled extensions directory and uses an isolated profile, shared storage, and user extension directory. Built-in themes and language grammars are cloned from the copied app into the isolated profile outside the repository. This prevents Restricted Mode from disabling them as workspace-contained extensions. Custom extensions from the normal installation are not automatically imported.

## Current boundaries

- Captures `apply_patch` edits only, not arbitrary shell or MCP filesystem edits.
- Captures begin after hooks are installed, trusted, and loaded by the chat.
- Whole-file deletions are listed but have no existing file editor to decorate.
- Overlapping concurrent edits are not transactionally attributed.
- Files must be UTF-8 text within the working directory and below the capture/diff limits.
- Chat IDs identify sessions because hook events do not provide chat titles.

See [hook setup](../hooks/README.md) and [disposable app setup](../prototype/DISPOSABLE-COPY.md).

## Accept and reject

Each rendered block has a compact action row. Buttons call `codexDiff.reviewBlock` through the private command-service bridge. The extension validates the selected chat, exact editor text, and a hash of current block boundaries before acting. Accept removes the block from local review state without changing source text. Reject applies an undoable workspace edit restoring that block’s original lines, then removes its overlay. Neither action saves the document automatically. Decisions persist in isolated workspace state for that captured snapshot; a subsequent Codex snapshot resets the file’s review.

Accept also pushes a resource-scoped entry into VS Code’s native undo/redo service through `prototype/review-undo.js`. It stores the before/after review regions, closes the preceding text-edit undo group, and restores review state through the companion extension. No dummy text edit is inserted. Restoration checks the captured snapshot and editor contents before applying, so an obsolete undo entry cannot overwrite newer capture state.

## Incoming edits while the editor is dirty

`src/merge.js` compares the last captured version, current editor buffer, and incoming Codex version. Changes to independent lines merge into the buffer using an undoable workspace edit. Overlaps, including edits to code the user has rejected, preserve the buffer and queue the incoming snapshot. A warning and persistent status-bar action expose resolution: load the incoming version (undoable), or retain the editor version. Pending conflicts persist in workspace storage. No automatic save or silent buffer replacement occurs. On first upgrade, existing divergent dirty buffers are surfaced as conflicts because their prior edit provenance is uncertain.

Rejections keep explicit before/after text and region snapshots, separately from the general typing cache. Undo/redo uses these records to restore block ownership even after that cache is reset. Metadata-only document events do not change region history. Recent rejection records are persisted with local review state.

### Conservative stale-review cleanup

Older reviews re-anchor across unrelated edits. Exact restorations of the original
block contents are resolved automatically, including restorations surrounded by
unrelated edits. Previously accepted regions stay resolved. Trial reconciliation
changes only in-memory review metadata and persists successful results; it never
writes file contents. History is retained so undo can restore pending blocks.

Code being present does not prove user acceptance: incorporated but unaccepted
changes remain ordinary pending diffs. Different overlapping replacements, repeated
text elsewhere, and unsupported comparisons are not treated as proof of resolution.
They remain normal pending blocks in the sidebar, showing the captured change.
Only diffs safely mapped to current text render inline. Accept resolves the block
without touching the file; reject computes an inverse merge into the live buffer
and stops on overlapping newer edits. Navigation includes these pending files.
No “Keep current file” or separate history state is needed.

New captures build on the prior review’s effective baseline (current text with only
unaccepted blocks reverted), preserving accepted decisions rather than rebuilding
all changes from the chat’s first snapshot. Native accept undo stores the review
text separately from live document text, so accepting older changes can be undone
without restoring an obsolete file version.
