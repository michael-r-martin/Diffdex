# Development demo and review behavior

Historical prototype workflow. For the standalone local build, use the [main README](../README.md). The private selection adapter described here is excluded from the default standalone build.

Captures Codex `apply_patch` edits per chat and displays additions and deleted-code rows directly inside normal file editors in a disposable patched VS Code build.

## Run locally

```sh
sh prototype/launch-copy.sh
```

The launcher opens this project in the patched copy and loads the companion extension. Its profile, shared storage, and extensions directory are isolated from normal VS Code. See [copy setup/signing](../prototype/DISPOSABLE-COPY.md) if the disposable app has not been prepared.

The launcher also repairs the copied Seti icon theme to load its font from the app’s bundled resources. This prevents colored missing-glyph squares in file tabs and Explorer without changing resource permissions. After updating an already running demo, quit and relaunch with the command above to apply the repair.

Install the capture hooks for a project:

```sh
node scripts/install-hooks.cjs /absolute/path/to/project
```

Review/trust the hooks through Codex's `/hooks` CLI flow. This project's two capture hooks have already been approved. Newly installed hooks may require reloading the desktop chat's configuration or starting a fresh chat. [Hook details and limitations](../hooks/README.md).

Open the same checkout in the patched editor and make an edit through Codex. The **Codex Chat Changes** Explorer section lists captured files. Click the **Codex** status-bar item or run **Codex Diffs: Select Chat** to choose a session. Diffs appear automatically in matching files; no toggle or cursor placement is needed. Chat IDs are shown because hook payloads do not include chat titles.

Each block has **Accept** and **Reject** buttons. Accept clears its review overlay without editing the file. Normal Undo restores the accepted block and Redo accepts it again; later typing remains a separate undo step. Reject restores its original lines in the editor and preserves independent code outside the block; normal Undo reverses it. Accept, reject, and undo/redo of those decisions automatically save the affected file, including its other current edits. Review saves skip save participants so formatting does not interrupt undo history. Failed saves are reported. Review decisions persist locally for the current captured snapshot; later captures build on the effective review baseline.

When Codex edits a file with unsaved editor changes, non-overlapping changes merge into the buffer automatically as an undoable edit. Conflicting changes stay pending: a notification and the status bar offer **Load Codex version** or **Keep editor version**. Loading is undoable; neither choice automatically saves your file. You can reopen this choice with **Codex Diffs: Resolve Incoming Changes**.

## Architecture

See the [system flowchart and implementation guide](architecture.md).

1. `hooks/capture.cjs` stores the first contents and latest result for each checkout/chat/file. It runs independently of VS Code.
2. `src/extension.js` reads snapshots, computes hunks, provides chat selection and changed-file navigation, and sends the selected chat to a private editor command.
3. `prototype/runtime-overlay.js` renders deleted text as real editor view zones and additions as decorations. It never inserts old code into the document.

Snapshot storage and app binaries live under ignored `.prototype-runtime/`. Generated project hook configuration is also ignored. Hooks use only local files; no API credentials or network service are needed.

## Verification

```sh
npm test
npm run check
```

The automated tests cover accumulation, separate chats, creation/deletion/rename, path boundaries, missing pre-events, config merging, diff grouping, and renderer behavior. An actual desktop extension-host test in `scripts/vscode-e2e.cjs` also passed with synthetic hook payloads: capture subprocess → store → extension → real editor view zone, plus source-content preservation, preservation after unrelated unsaved edits, built-in theme and grammar registration, source/deleted-code tokenization, and switching to a light theme. Live Mac-app hook capture has also been verified separately.

## Current limits

- Captures supported text changes during hooked tools, including shell commands; see [current capture scope](../hooks/README.md).
- Only new edits are captured, not earlier chat history.
- Files must be UTF-8 text, at most 1 MiB, inside the hook working directory. The diff algorithm has a 2,000,000 line-pair limit.
- Captured blocks track live edits within their boundaries. Enter at the first column of a block creates an independent line above it; Enter at the final column creates one below it; typing outside a block only moves its anchor. Restoring the block’s original text clears its diff.
- Fully deleted files are listed, but cannot have overlays in a nonexistent file editor.
- Overlapping edits to one file are not transactionally attributed.
- This remains a hash-pinned patch for VS Code 1.142.0. The modified copy displays VS Code's integrity warning; checks remain enabled.

`prototype/codexDeletedLines.ts` is an earlier uncompiled source-build draft, not the current renderer. The earlier demo file is retained as a fixture but no longer has hard-coded overlays.
# Sidebar review

Inline editors show pending blocks from all captured chats in the open checkout. The sidebar and top **← / →** navigator are scoped to the selected chat. The navigator counts only that chat's unique files with displayable pending blocks. Accepted or rejected blocks leave that list; undo brings them back.

Separate changes in the same file can appear together. Older snapshots that overlap newer edits are flagged in their chat's sidebar instead of being rendered over unrelated code. Whole-file deletions and unresolved conflicts are excluded from the inline navigator.

The top navigator also provides **Accept File** and **Reject File** for the selected chat's pending blocks in that file. These controls are disabled when that chat has no changes in the file. Decisions save automatically; undo restores and saves decisions block by block.

When other chats in this checkout have reviewable changes, the top strip shows an **Other chats** dropdown with chat titles and pending file counts. Selecting a chat switches the review selection and opens its first pending file. When the current chat is caught up, **Changes in N other chats** replaces the disabled navigation controls. Conflicted or unavailable files do not count as jump targets; chats with both ready files and unresolved files also show a warning count. Chat selection remains a manual override until the Codex view reports another selection/focus event.

The disposable Codex IDE extension has a private selection adapter installed by `node scripts/install-codex-selection-bridge.cjs`. It follows the focused Codex view's chat selection, including new chats without captures. **Choose chat** is a manual override until Codex reports another selection/focus event. This adapter is pinned to Codex extension 26.1007.21434; it is not a public API and may need updating after an extension upgrade. Original modified files are backed up under `.prototype-runtime/codex-selection-backup`. The adapter reads only the selected chat ID, not message content.

Click the **Codex Diffs** icon (a page with plus/minus signs) in the Activity Bar to open **Review Changes**. Choose a chat to see its pending blocks across files as unified removed/added rows with surrounding context.

- **Accept / Reject** applies to one block; **Open file** takes you to its source.
- **Accept all / Reject all** processes the pending blocks for the selected chat. Decisions share state with the inline editor controls.
- Accept, reject, and undo/redo of those decisions save the affected files automatically. Undo/redo remains per file; a bulk operation creates individual decisions in each file's undo history.
- Stale clicks are refused. Bulk actions process reviewable blocks and explicitly skip files flagged with incoming conflicts, unavailable contents, oversized diffs, or whole-file deletions. Whole-file deletion restoration is not implemented yet.

Explorer's **Add to Codex Chat** action attaches clicked or selected files to the active embedded chat's composer. It delegates to the native Codex attachment command, with a pinned adapter that preserves the last focused chat when it is in an editor panel. The adapter is prepared together with the selection bridge by `npm run setup:codex`.
