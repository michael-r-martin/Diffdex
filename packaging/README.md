# Diffdex for macOS

This is a personal local build assembled from the pinned VS Code 1.142.0 installation. It packages the working editor overlay and the pinned Codex selection adapter. It is not a Code - OSS source build or a notarized public release.

## Build

For the clone/install walkthrough, use the [main README](../README.md). The [release guide](../docs/releasing.md) separates this local workflow from a future public binary release.

Prepare inputs first:

```sh
npm run setup:mac
npm run setup:codex
```

The editor setup reuses a verified matching app or downloads a hash-pinned official archive. Set `DIFFDEX_EDITOR_APP` for a different app location. Codex setup copies matching extension folders from `~/.vscode/extensions` (or a parent directory passed after `--`). If no custom directory is supplied and a pin is missing, the original VS Code CLI installs it into the isolated runtime from its publisher. Setup then applies the existing auto-follow adapter. Use `npm run setup:codex -- --download` to prefer publisher installation over system extension copies in a fresh runtime. The default build keeps automatic following.


For a complete checked package, run this from the repository root:

```sh
npm run package:mac
```

This runs the tests and syntax checks, builds a fresh app, verifies its signature/integrity/CLI/capture, checks ZIP integrity, and writes `SHA256SUMS` plus a `package-info.json` verification receipt. It does not publish anything or replace a running installation. You can pass a fresh output directory: `npm run package:mac -- dist/my-build`. The Diffdex version comes from the root `package.json`.

For a build without the full package verification:

```sh
npm run build:mac
```

The command creates a fresh `dist/build-<timestamp>/` containing `Diffdex.app`, `Diffdex-mac-arm64.zip`, and build metadata (plus an icon set if one needs generating). Existing builds are never overwritten. The installed VS Code and the running demo are not modified. The build requires macOS, the exact supported editor, and the pinned Codex extensions already used by the prototype.

The PNG source, prepared ICNS and image-generation prompt live in `branding/`. Builds use the prepared ICNS; if it is absent, they regenerate it with `sips` and `iconutil` (the latter may need permission outside a restricted sandbox). Verify a built app with `npm run verify:mac -- /absolute/path/to/Diffdex.app`. This checks its signature, branding, integrity checksums, clean extension contents, terminal CLI and a synthetic capture using the app's bundled runtime.

The app has its own bundle ID (`com.unseriouslabs.diffdex`), `diffdex:` URL scheme, app name, icon, helper identities, CLI, and keychain service name. Editor integrity checks use the packaged file hashes. Automatic vendor app updates are disabled because they would replace the patched editor.

## Install and use

Copy `Diffdex.app` to `/Applications`, then launch it from Finder or the Dock. Open any project with **File → Open Folder**. Run **Diffdex: Enable Change Capture for Project** in the command palette, then review and trust the generated hooks in Codex. An existing chat may need to reload its hook configuration or be replaced with a new chat. Existing unrelated hooks are preserved and changed hook files are backed up.

The built-in review extension and Codex extension ship as application resources. No development-extension flag, source checkout, system Node installation or demo launcher is required. The capture hook uses the app's own Electron runtime as Node.

Settings and extension state use `~/Library/Application Support/Diffdex/`. Review captures use the review extension's permanent global storage there. User-installed extensions use the product's `.diffdex` directory. No state is imported from the demo. Existing external Codex account/session metadata may still be read by the Codex extension and chat-title adapter; account authentication is not embedded in the app.

To use the CLI directly:

```sh
/Applications/Diffdex.app/Contents/Resources/app/bin/diffdex .
```

The editor's standard **Shell Command: Install 'diffdex' command in PATH** can install the terminal shortcut. Test Codex sign-in and any authentication callbacks in the rebranded app; the new URL scheme is intentionally separate from VS Code.

## Contents and exclusions

The build copies only the base editor, review `src/` and `media/`, capture hooks, hook configuration helper, and the two pinned installed Codex extension directories. It excludes `demo/`, tests, this repository's `.git`, captures, temporary profiles, extension registries and review history. The original editor's licenses and third-party notices remain included.

Each package is ad-hoc signed and checked with `codesign --verify --deep --strict`. Developer ID signing, notarization, update delivery, a source-based distribution and third-party distribution arrangements remain separate release work.

Upstream references: [Electron application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution), [Code - OSS and VS Code distribution differences](https://github.com/microsoft/vscode/wiki/Differences-between-the-repository-and-Visual-Studio-Code).

## Sharing the project and later releases

The chosen first launch is this repository with local setup/build instructions, preserving the current auto-follow workflow. The repository does not include the editor or Codex extension binaries. Setup obtains missing pinned extensions through the original VS Code CLI; third-party terms still apply.

The current ZIP is a personal build assembled from Microsoft's installed editor binary. Do not upload it as a public Diffdex binary release. A source-only setup workflow also does not itself establish permission to modify third-party software.

See the [comprehensive release guide](../docs/releasing.md) for dependency availability, source/repository review, third-party permissions, extension registries, Code - OSS, signing/notarization, clean-machine testing and release maintenance. These future product-release decisions do not remove automatic following from the current local build.
