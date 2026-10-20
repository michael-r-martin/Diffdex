# Releasing Diffdex

Last reviewed: 20 October 2026. This guide separates the intended first launch—a GitHub repository that people clone and build locally—from a later downloadable application. It records engineering requirements and unresolved third-party permissions; it does not treat a successful build as legal clearance.

## 1. The first launch: reproduce the existing local app

The intended user experience is:

1. Clone the repository.
2. Prepare the exact supported VS Code and Codex copies on the user's own Mac.
3. Build Diffdex with the existing review overlay and automatic chat following.
4. Install the resulting app locally, sign in, and enable/trust project capture hooks.

The [README](../README.md) documents the actual commands. GitHub hosts our code, icon, scripts and documentation. It does not need to host an editor binary or a modified Codex extension. Open VSX is an extension registry, not a requirement imposed by GitHub. Code - OSS is a possible basis for a future distributable editor, not a prerequisite for putting our own source on GitHub.

**Current readiness:** the local packager works with pinned inputs. `setup:mac` can fetch and verify the official editor archive. `setup:codex` reuses matching extension folders or installs missing pins through the original VS Code CLI, into an isolated extension directory and setup profile. The original Marketplace publisher returned successful VSIX responses for both exact pins during research. Open VSX returned 404 for this Codex version; that registry is not part of the chosen setup path. Publisher availability can change, so setup must refuse unsupported versions rather than silently using latest.

## 2. What belongs in the repository

Include our review extension, capture hook, overlay/selection adapter scripts, packaging scripts, tests, documentation and owned branding assets. Keep required third-party notices for any code included in source. Review the small upstream code fragments used as patch markers as part of the source-license review as well.

Exclude app bundles, VSIX archives, extracted vendor extensions, profiles, authentication data, local logs, hook captures, review decisions and generated project hooks. `dist/`, `.prototype-runtime/`, `*.vsix` and the root generated hook files are ignored. Ignore rules do not remove files already tracked or erase history.

Before making the repository public:

- Review `git ls-files`, the proposed commit diff and the complete history for private state and third-party assets. Secret scanning should include history, not just the working directory. Rotate any exposed credentials rather than merely deleting them.
- Keep the root MIT LICENSE file with our original code and documentation. Third-party components retain their own licenses and terms; do not apply MIT to them by implication.
- Ensure every required source/branding file is committed. A local build can succeed with untracked files that a clone will not receive.
- Confirm that the README clone URL matches the final repository name and visibility. A rename is optional; GitHub currently calls this repository `cursordiffs`.
- Mark the project experimental, state supported hardware and the exact input versions, and describe unavailable features honestly.
- Add contribution/support guidance and an issue template requesting app/editor/extension versions and redacted logs. Ask users not to attach captures or credentials.

Publishing a repository, tagging a release, changing visibility and uploading artifacts are separate actions; none is performed by the build scripts.

## 3. Dependency pins and reproducible setup

The current full-feature build targets:

| Input | Pin |
| --- | --- |
| Platform | macOS, Apple Silicon, APFS build location |
| Editor | VS Code 1.142.0 |
| Editor commit | `6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1` |
| Original workbench SHA-256 | `74de4ceb93610658c5eb15b64b228d085f25c9c95d6ec8b002f791df7be4614c` |
| Official editor ZIP SHA-256 | `099d3514fda308822a150d65ea36d4c4bfc565ee1b7fbc5a3fff97700f7af408` |
| Codex IDE extension | `openai.chatgpt-26.1007.21434-darwin-arm64` |
| Codex audio extension | `openai.codex-audio-26.1007.21434` |

The editor URL/hash came from Microsoft's official versioned download response. Setup checks the entire ZIP before extraction, then checks version, commit, workbench hash and original signature. An explicit `DIFFDEX_EDITOR_APP` override must satisfy the same pins.

The Codex adapter validates exact expected host/webview code markers before changing either file. It backs up changed files under the ignored runtime directory. Its preparation script copies extension code from the user's supplied directory, not their profile, or uses the original VS Code CLI's publisher installation path for missing pins. Do not make arbitrary current versions pass by changing the version string or suppressing checks.

The current extension acquisition path uses the original, pinned VS Code CLI and its exact-version Marketplace installer. Unlike the editor ZIP, extension VSIX hashes are not separately pinned in our setup script; record them if adding an independent download/cache pipeline. When updating, port and test the adapter against the newly obtainable version. Never use a maintainer's full extension/profile backup as a dependency distribution channel.

The root project has no npm dependencies. Source-building an editor later will add its own toolchain, lockfiles, Node requirements and native compilation prerequisites; document those separately. Claim repeatable setup only after testing it, and do not claim byte-for-byte reproducible artifacts without measuring that separately.

## 4. Source sharing does not settle modification permissions

There are three distinct questions: permission to publish our scripts, permission for a user to modify installed third-party software, and permission to distribute the resulting app. A source-only repository avoids directly shipping vendor binaries; it does not automatically answer the other questions.

Microsoft's [VS Code product license](https://code.visualstudio.com/license) governs the installed binary. Its scope includes restrictions on providing the software as a standalone offering, notices and reverse engineering. The [Code - OSS source license](https://github.com/microsoft/vscode/blob/main/LICENSE.txt) is different. Do not describe the current repackaged binary as MIT-licensed merely because upstream source is MIT-licensed.

The installed Codex extension points to OpenAI's terms. [OpenAI's component guide](https://learn.chatgpt.com/docs/open-source) distinguishes the proprietary IDE extension from the open-source CLI/app-server. The [UK/Europe terms](https://openai.com/policies/eu-terms-of-use/) and [other-region terms](https://openai.com/policies/row-terms-of-use/) contain modification restrictions. The auto-follow patch remains a permissions question even when applied locally. Establish permission, an applicable license/exception, or a supported integration before representing the public installation workflow as cleared. This guide does not claim the current adapter is authorized by OpenAI.

Our manual review picker and cross-chat dropdown are independent of the private selection bridge. Automatic following specifically depends on the patched extension reporting the focused chat. Keeping the adapter in the experimental project preserves functionality; it does not establish third-party approval.

## 5. Extension stores are a separate decision

GitHub is the repository/build-script distribution channel. An extension gallery is where the running editor browses and installs plugins. One does not require the other.

The existing full local build preserves the base editor's gallery configuration to reproduce the current installation. That is not a validated registry policy for a public Diffdex product. Microsoft's [Marketplace FAQ](https://code.visualstudio.com/docs/supporting/faq) restricts access from alternative products. Review and change this configuration before offering a supported fork; do not present a source-only installer as a way around the registry terms.

For a future fork, [Open VSX](https://open-vsx.org/extension/openai/chatgpt/) is an alternative registry with a verified Codex listing. A listing does not grant permission to modify/rebundle that extension or guarantee support for Diffdex. Its currently available versions may differ from our pin. [VSCodium's extension documentation](https://github.com/VSCodium/vscodium/blob/master/docs/extensions.md) describes registry compatibility limitations.

A future variant could omit the private Codex copies and use an unmodified extension with manual review selection. That would change the feature set. It is not the current default or the chosen first-launch workflow.

## 6. Test the clone-and-install promise

Use a separate clean checkout with no `.prototype-runtime`, no maintainer paths, no demo captures and no existing Diffdex profile. Test source paths with spaces as well.

Required checks before announcing the full local-install beta:

- Obtain each prerequisite through the documented path. Confirm a user without the pinned extensions gets a useful error before a partial app is built.
- Run setup, package, and installation from the README. Confirm wrong editor hashes and unsupported extension builds fail closed.
- Verify the resulting signature, editor integrity map, CLI, ZIP checksum and synthetic hook capture. `package:mac` runs these checks and writes `package-info.json` and `SHA256SUMS`.
- Launch the installed app in a clean macOS account and test Codex sign-in/callbacks. Packager success is not evidence that authentication works.
- Enable capture in a new project, trust hooks explicitly, make a real edit, and verify deleted/added rows, accept/reject, undo/redo, save and unsaved-conflict handling.
- Verify automatic following across existing chats, new chats, focus changes and multiple Codex views. Test the top-strip cross-chat jump and its transition back to automatic following.
- Test icons, light/dark themes, file creation/deletion, hook reload, large-file/scan limits and empty workspaces. Confirm demo files and other users' state are absent.
- Replace an earlier local app after quitting it. Confirm settings/review state survive and hook executable paths still resolve. Test rollback with a saved previous app.

The package verifier covers only part of this list. Record actual results and versions, including what was not tested. The original user's successful installation is useful evidence, but not a clean-machine test.

### Validation recorded on 20 October 2026

A separate clean source copy successfully installed both pinned Codex extensions from their original publisher using the original VS Code CLI, applied the auto-follow adapter, and completed `package:mac`. All 62 tests, syntax checks, signature/integrity checks, CLI startup, synthetic packaged capture and ZIP verification passed. A second run using existing local extension copies also passed. These runs reused the exact installed base editor; the fallback editor-download path was not exercised end to end. Its official download response/pin and archive-hash rejection logic were checked separately. GUI sign-in and live auto-follow were not re-tested on a clean macOS account in this pass.

## 7. A later downloadable app

Before uploading an app/ZIP/DMG for others to install, move to a distributable editor foundation or obtain the necessary permissions for the existing foundation. A practical source-based route is pinned Code - OSS with Diffdex branding; [VSCodium's MIT-licensed build tooling](https://github.com/VSCodium/vscodium/blob/master/LICENSE) is a reference. Preserve upstream licenses and notices and audit bundled components individually.

Port the workbench patch to maintained source integration rather than relying on minified identifiers. Keep our hook/review contract tested across upstream updates. Set the product identity, storage directories, helper identities, protocol, icon, extension gallery, update endpoints and telemetry deliberately. The current personal packager is not this source-build pipeline.

For Codex integration, choose a documented/permitted approach:

- Official, unmodified, user-installed extension plus manual review selection.
- A supported selected-chat interface or permission for the existing adapter.
- A Diffdex-owned chat interface using the open-source [Codex app-server](https://learn.chatgpt.com/docs/app-server). This requires implementing chat, approvals, authentication and history; it is not automatic feature parity with the official extension. Observe its support/experimental caveats and pin the protocol.

The [Codex Apache-2.0 license](https://github.com/openai/codex/blob/main/LICENSE) and NOTICE obligations govern the open-source component, not unrestricted service access. App-server managed authentication and [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) have their own eligibility rules, especially for paid/hosted products. Check them again before monetization; do not infer subscription-access rights from an open-source license.

## 8. Signing and download delivery

Local ad-hoc signing is the current approach. A general macOS download should use an Apple Developer ID certificate, appropriate hardened-runtime entitlements, signing of nested code in the correct order, notarization and stapling where supported. Validate the notarization result and downloaded artifact with Gatekeeper enabled on a clean Mac. Follow [Apple's distribution guidance](https://developer.apple.com/developer-id/); the current `codesign --deep --sign -` command is not the production signing pipeline.

Keep signing identities, private keys and notarization credentials in protected local/CI secret storage. Never put them in the repository, logs or artifacts. Separate untrusted pull-request checks from release jobs that can access signing credentials.

A later GitHub Release should identify the source commit/tag, app version, supported macOS/architecture, license/notices, checksums, known issues, installation and upgrade instructions. Publish only artifacts produced and verified from that exact source state. Start with manual replacement updates; add a signed update feed only once its trust and rollback model is implemented. A checksum checks integrity, not publisher identity by itself.

No macOS minimum version or non-arm64 compatibility has been established by this prototype. Determine and test those before claiming support. Build/test Intel, Windows and Linux separately if added.

## 9. Maintenance and release gates

Keep an upstream compatibility matrix with editor revision, Codex version, adapter revision and tested macOS version. Update dependencies deliberately, review upstream security fixes, and run the relevant UI/integration tests before changing pins. Disabled vendor updates make maintenance our responsibility.

Before each source-only release: review committed contents and license status, verify dependency availability, test a clean clone, update instructions, and tag the tested source. Before each binary release: additionally clear redistribution and service access, use a distributable foundation, audit the gallery and bundled extensions, sign/notarize, and test the downloaded artifact.

If a check fails, retain the previous working revision and explain the limitation. Do not publish the current personal ZIP merely because the package verifier passed. The initial goal is a faithful, documented local installation; the broader product-release work should not silently remove automatic following from that workflow.
