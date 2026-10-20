# Diffdex

**Cursor-like inline diffs. A native IDE experience. The native Codex harness.**

Diffdex brings inline code review to your Codex workflow in a standalone macOS editor. Use Codex in the terminal, the Codex Mac app, or the embedded IDE extension, then inspect and accept or reject its changes directly in your files.

## Why Diffdex?

- **Review changes where you write code.** See added and deleted lines inside the editor, with surrounding code for context. Accept or reject individual blocks, entire files, or a chat's changes.
- **Use Codex your way.** Keep the native Codex harness and work from its terminal UI, Mac app, or IDE extension. Diffdex captures local changes through Codex hooks and adds the review interface.
- **Follow the conversation automatically inside the IDE.** Switch chats in the embedded Codex extension and the review sidebar and file navigator follow the selected chat. Terminal and Mac-app sessions can be selected from Diffdex's chat picker.
- **Find unfinished reviews across chats.** The top strip shows when other chats have pending changes. Pick one to jump straight to its first changed file.
- **Stay in a full IDE.** Browse your project, edit files, use the integrated terminal, and review AI changes in one VS Code-based application.
- **Change your mind with undo.** Accept and reject decisions support normal undo/redo. Rejected changes stay in an unsaved buffer so you can inspect them before saving.

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

Setup prepares isolated copies inside the checkout. It leaves your existing VS Code and extension installations intact.

Build the app:

```sh
npm run package:mac -- dist/my-first-build
```

The build runs automated checks and creates `dist/my-first-build/Diffdex.app`.

1. Open `dist/my-first-build` in Finder.
2. Drag `Diffdex.app` into `/Applications`.
3. Launch Diffdex and open your project with **File → Open Folder**.
4. Use the embedded Codex extension, or keep working in your Codex terminal UI or Mac app.

If you are replacing an existing Diffdex installation, quit it first. Use a new build output directory each time.

The app is signed for local use but is not notarized by Apple. If macOS blocks it, check the build's verification output and the [signing guidance](docs/releasing.md#8-signing-and-download-delivery).

## Review your first changes

Enable change capture once for each project:

1. Open the command palette (`⇧⌘P`) and run **Diffdex: Enable Change Capture for Project**.
2. Review the generated `.codex/hooks.json`. Existing unrelated hooks are preserved.
3. Run `codex` in that checkout and use `/hooks` to review and trust the two capture handlers. If necessary, reload the client/session you will use or start a fresh chat so it loads the configuration.
4. Ask Codex to make a small edit from your chosen client. Open the file in Diffdex to review it, and select the captured session in **Review Changes**.

When using the embedded extension, switching Codex chats automatically updates the review selection. For terminal and Mac-app sessions, choose the chat manually or use **Other chats** in the top strip to jump to its pending changes.

**Accept** clears a review overlay while keeping the code. **Reject** restores the previous code in the editor and leaves the file unsaved. Normal undo restores review decisions.

Only edits made after capture is enabled are available for review. See [capture scope and limitations](hooks/README.md) for supported files, concurrent edits and scan limits.

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
| No changes appear | Enable capture for the project, trust the hooks, reload the chat and make a new edit. |
| Review selection stops following Codex | Rerun `npm run setup:codex` and rebuild. Use the manual chat picker while diagnosing. |
| Incoming changes conflict with unsaved work | Use the offered conflict-resolution controls to choose which changes to keep. |

For custom editor/extension locations and exact supported versions, see the [packager reference](packaging/README.md) and [dependency pins](docs/releasing.md#3-dependency-pins-and-reproducible-setup).

## Roadmap

- [ ] **Follow the latest edits across Codex clients.** Add an optional mode that selects the chat that most recently changed a file, including TUI and Mac-app sessions. Pause automatic following when you manually select a chat so background tasks do not interrupt your review.
- [ ] **Explore following the active TUI or Mac-app chat.** Investigate client signals for switching review context when you switch conversations, even before an edit occurs.
- [ ] **Ship a fully distributable app.** Move to a source-built Code - OSS foundation, resolve third-party extension and integration permissions, and provide signed, notarized macOS downloads with a tested update path—so installation no longer requires a local build.

These are planned directions, not released features. See the [release guide](docs/releasing.md) for the distribution work in more detail.

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
