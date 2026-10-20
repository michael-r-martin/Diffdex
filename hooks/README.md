# Codex hook capture

The two synchronous hooks observe all tool calls. `apply_patch` keeps its targeted file capture; other tools snapshot supported workspace files before and after the call. Only changed files acquire a first baseline for that chat. PostToolUse saves actual resulting contents, including absence for deleted files. They do not edit source files or return permission decisions.

```sh
node scripts/install-hooks.cjs /absolute/path/to/project
```

The installer merges with existing `.codex/hooks.json` and backs up an existing file. Generated configuration contains machine-specific absolute paths and is ignored by Git. Snapshots live in this prototype's ignored `.prototype-runtime/captures` directory with owner-only file permissions. Nothing is uploaded.

Codex requires trust for the project config layer and the exact hook definitions. Open `codex` in the project, run `/hooks`, review the two capture handlers, and trust them. Changing the matcher from `^apply_patch$` to `.*` changes the hook definitions and may require renewed trust. No trust bypass is used. Existing desktop chats may need their configuration reloaded (or a fresh chat) before discovering newly installed hooks.

Each checkout path and session ID has separate storage. Parent and subagent edits share the parent session ID supplied by Codex. The first baseline survives later turns, while each chat retains its own latest captured contents. Chat titles are resolved separately from the local Codex session index.

## Current scope

- Supported: UTF-8 text files up to 1 MiB, changed during a hooked tool call (including shell commands and MCP tools), inside the hook's working directory. New files, deletions, and moves are captured.
- Not captured: background writes after a tool returns, unsaved editor buffers, paths outside the checkout, binary files, symlinks during workspace scans, and `.git`, `.codex`, `.prototype-runtime`, or `node_modules` contents.
- Workspace scans stop at 20,000 entries, 64 MiB of supported text, or six seconds. An incomplete scan is skipped with a hook diagnostic rather than generating false deletions. Gitignored text is included unless it is in an excluded directory.
- No retroactive history: edits made before installation cannot be reconstructed.
- Concurrent tools or chats modifying the same file can overlap; snapshots do not provide transactional attribution in that case.
- A missing pre-event is skipped rather than inventing an original version. Interrupted tools may leave pending capture records.
- Fully deleted files are listed in the sidebar but have no live file editor to decorate yet.

The extension polls local snapshots once per second. Review state tracks subsequent user edits; overlapping incoming changes use the conflict-resolution flow. Inline files can show pending changes across chats while the sidebar and navigation strip follow the selected chat.

References: [official hook events, input fields, and trust flow](https://learn.chatgpt.com/docs/hooks).
