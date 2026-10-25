# Diffdex

**Cursor-like inline diffs. A native IDE experience. The native Codex harness.**

Diffdex brings inline code review to your Codex workflow in a standalone macOS editor. Use Codex in the terminal, the Codex Mac app, or the embedded IDE extension, then inspect and accept or reject its changes directly in your files.

## Why Diffdex?

- **Review changes where you write code.** See added and deleted lines inside the editor, with surrounding code for context. Accept or reject individual blocks, entire files, or a chat's changes.
- **Use Codex your way.** Keep the native Codex harness and work from its terminal UI, Mac app, or IDE extension. Diffdex captures local changes through Codex hooks and adds the review interface.
- **Follow the conversation automatically inside the IDE.** Switch chats in the embedded Codex extension and the review sidebar and file navigator follow the selected chat. Terminal and Mac-app sessions can be selected from Diffdex's chat picker.
- **Find unfinished reviews across chats.** The top strip shows when other chats have pending changes. Pick one to jump straight to its first changed file.
- **Stay in a full IDE.** Browse your project, edit files, use the integrated terminal, and review AI changes in one VS Code-based application.
- **Change your mind with undo.** Accept and reject decisions support normal undo/redo. Each decision, including undo and redo, automatically saves the affected file.
- **Add files to your chat.** Right-click a file in Explorer and choose **Add to Codex Chat** to attach it to the active embedded Codex chat. You can select several files at once.

Diffdex is experimental and currently supports Apple Silicon Macs. You build the app locally using the setup commands below.

## Works with your Codex workflow

Diffdex reviews changes made in the **same local checkout** by any of these Codex clients, provided they load and run the project's trusted capture hooks:

| Codex client | Where you work | How to select its changes in Diffdex |
| --- | --- | --- |
| Terminal UI (TUI) | Run `codex` from the project in your terminal, including Diffdex's integrated terminal. | Choose the captured session in the chat picker or **Other chats** dropdown. |
| Codex Mac app | Run a local task against the checkout open in Diffdex. | Choose the captured session in the chat picker or **Other chats** dropdown. |
| Embedded IDE extension | Chat with Codex inside Diffdex. | Review selection follows the focused Codex chat automatically; manual selection is also available. |

Diffdex does not follow chat selection in a separate terminal or the Mac app. You can still review their captured edits, accept/reject changes, and navigate between sessions.

If the Mac app uses a separate worktree, open that worktree in Diffdex and enable capture there. Remote/cloud tasks are outside this local capture workflow. The terminal UI and Mac app are installed separately; Diffdex's setup bundles the IDE extension.

## Requirements

- An Apple Silicon Mac (M1 or newer), with the checkout on an APFS volume.
- Git, Node.js 22 or newer, and npm.
- Several GB of free disk space for the editor, extensions and built app.
- Internet access to download the required editor and extensions.
- Your own Codex account/access.

Setup obtains the supported versions of VS Code and the Codex extensions automatically, or reuses matching local copies. You do not need to install npm dependencies or configure an API key for Diffdex's review features.

## Install

Clone the repository and prepare the editor and Codex extensions:

```sh
git clone https://github.com/michael-r-martin/cursordiffs.git diffdex
cd diffdex
npm run setup:mac
npm run setup:codex
```

The `cd diffdex` command enters the repository folder created by `git clone`. Keep using this same terminal for the build and Finder commands below; both run from inside that folder.

Setup prepares isolated copies inside the checkout. It leaves your existing VS Code and extension installations intact.

Build the app:

```sh
npm run package:mac -- dist/my-first-build
```

The build runs automated checks and creates `dist/my-first-build/Diffdex.app`. Signing the app and creating the ZIP can take several minutes with no new terminal output, including after the `replacing existing signature` message. Wait until the command finishes successfully and prints `Verified local package` before installing.

In that same terminal, open the finished build folder in Finder:

```sh
open dist/my-first-build
```

1. Quit Diffdex if it is already running.
2. Drag `Diffdex.app` from the build folder into **Applications** in Finder. If prompted, choose **Replace**. You do not need to delete the old app first.
3. Open **Applications** and double-click **Diffdex** to launch it. You can also find it with Spotlight (`⌘Space`, then type `Diffdex`).
4. Open your project with **File → Open Folder**.
5. Use the embedded Codex extension, or keep working in your Codex terminal UI or Mac app. Sign in to Codex if prompted, then enable change capture using the steps below.

Use a new build output directory each time you rebuild, such as `dist/my-next-build`.

The app is signed for local use but is not notarized by Apple. If macOS blocks it, check the build's verification output and the [signing guidance](docs/releasing.md#8-signing-and-download-delivery).

## Review your first changes

Diffdex installs capture hooks automatically when you open a trusted local project, including folders added to a workspace. Complete Codex's trust step once for each project:

1. Open the project folder in Diffdex and trust the workspace if prompted.
2. Choose **View hooks** in the setup notification to review the generated `.codex/hooks.json`. Existing unrelated hooks are preserved. To retry setup, run **Diffdex: Enable Change Capture for Project** from the command palette (`⇧⌘P`).
3. Run `codex` in that checkout and use `/hooks` to review and trust the two capture handlers. If necessary, reload the client/session you will use or start a fresh chat so it loads the configuration. If capture still does not start, fully quit and reopen Diffdex and the ChatGPT Mac app (if you are using it), then try a new edit. Restarting both apps was needed in a confirmed setup.
4. Ask Codex to make a small edit from your chosen client. Open the file in Diffdex to review it, and select the captured session in **Review Changes**.

When using the embedded extension, switching Codex chats automatically updates the review selection. For terminal and Mac-app sessions, choose the chat manually or use **Other chats** in the top strip to jump to its pending changes.

**Accept** clears a review overlay while keeping the code. **Reject** restores the previous code in the editor. Both actions automatically save the affected file, including other edits in that file. Undo and redo of those decisions also save automatically. Review saves skip formatting and other save participants to preserve the review's undo history; normal manual saves keep your configured behavior. Save failures are reported and leave the decision available to undo.

To attach files, right-click a file in the standard Explorer tree and choose **Add to Codex Chat**. The file goes to the active embedded Codex chat's composer; it does not send a message. This also works with multiple selected files and files you have not opened. It does not attach files to a separate terminal or Mac-app chat.

Only edits made after capture is enabled are available for review. See [capture scope and limitations](hooks/README.md) for supported files, concurrent edits and scan limits.

Committed files leave the pending review automatically once their saved contents match Git's current `HEAD` and they have no staged or unsaved changes. A push is not required. Diffdex remembers that checkpoint so later Codex edits in the same chat start from the committed version. Rejecting back to the committed contents can also make Git clean; that decision stays undoable, and Undo restores its diff for review. Files that still have uncommitted changes stay available for review; non-Git projects keep the chat snapshot workflow.

## Updating and storage

To update, pull a tested revision, run the setup commands again, and build into a fresh output directory. Quit Diffdex before replacing the app in `/Applications`. Automatic editor updates are disabled to keep the review integration compatible.

Settings and review captures are stored locally under `~/Library/Application Support/Diffdex/`, separately from the application. Replacing the app preserves this data. Codex may also use your existing local account and session data.

Once installed, Diffdex's capture hooks use its bundled runtime. Keep the repository checkout if you want to rebuild the app.

To open a project from the terminal:

```sh
/Applications/Diffdex.app/Contents/Resources/app/bin/diffdex /absolute/path/to/project
```

Before uninstalling, remove Diffdex's capture handlers from each project's `.codex/hooks.json`. Removing the app does not automatically delete settings or review captures.

## Troubleshooting

| Problem | Next step |
| --- | --- |
| Editor or extension setup fails | Check your internet connection and rerun the setup command. Setup requires specific supported versions; do not substitute newer versions manually. |
| Editor download hash mismatch | Stop and report the error rather than bypassing verification. |
| Output directory already exists | Choose a fresh directory, such as `dist/my-next-build`. |
| No changes appear | Enable capture for the project, trust the hooks, reload the chat and make a new edit. If needed, fully quit and reopen Diffdex and the ChatGPT Mac app before trying another edit. |
| Old diffs remain after committing | Use a build with Git reconciliation. Clean committed files clear automatically on refresh; check for staged changes or unsaved buffers if a file remains pending. |
| Review selection stops following Codex | Rerun `npm run setup:codex` and rebuild. Use the manual chat picker while diagnosing. |
| Incoming changes conflict with unsaved work | Use the offered conflict-resolution controls to choose which changes to keep. |

For custom editor/extension locations and exact supported versions, see the [packager reference](packaging/README.md) and [dependency pins](docs/releasing.md#3-dependency-pins-and-reproducible-setup).

## Roadmap

- [x] **Add files to Codex chat from the Explorer.** Right-click files in the standard file tree and choose **Add to Codex Chat** to attach them to the active embedded Codex chat.
- [x] **Save files automatically after review actions.** Accept, reject, and undo/redo of those decisions automatically save the affected file, preserving undo history and reporting save failures.
- [ ] **Explore syncing review decisions back to Codex.** Investigate whether Diffdex can communicate accepted and rejected changes to the Codex chat so its change indicator reflects the review state. Feasibility depends on the integration available in Codex.
- [ ] **Follow the latest edits across Codex clients.** Add an optional mode that selects the chat that most recently changed a file, including TUI and Mac-app sessions. Pause automatic following when you manually select a chat so background tasks do not interrupt your review.
- [ ] **Explore following the active TUI or Mac-app chat.** Investigate client signals for switching review context when you switch conversations, even before an edit occurs.
- [ ] **Ship a fully distributable app.** Move to a source-built Code - OSS foundation, resolve third-party extension and integration permissions, and provide signed, notarized macOS downloads with a tested update path—so installation no longer requires a local build.

Unchecked items are planned directions. See the [release guide](docs/releasing.md) for the distribution work in more detail.

## Development

```sh
npm test
npm run check
```

- [Architecture](docs/architecture.md)
- [Capture hooks](hooks/README.md)
- [Packaging](packaging/README.md)
- [Release guide and third-party licensing considerations](docs/releasing.md)

The build scripts produce a local installation. See the release guide before redistributing a built app or third-party components.

## License

Diffdex's original code and documentation are available under the [MIT License](LICENSE), copyright 2026 Michael Martin. Third-party code, applications and extensions retain their own licenses and terms; this license does not grant additional rights to VS Code or Codex.
