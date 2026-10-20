# Weekend Studio

A small, dependency-free project board for testing Codex diffs across HTML, CSS, and JavaScript. It stays inside the parent repository so the existing capture hooks can see its files.

## Run

From this directory:

```sh
npm start
```

Open http://127.0.0.1:4173. If that port is occupied, use `PORT=4174 npm start`.

## Appearance

Use the Light, Dark, and System controls in the header to choose a theme. System follows your device’s appearance and is the default. Your choice is saved in this browser and applied before the page renders. If browser storage is unavailable, switching still works for the current visit.

## Files

Combine the category buttons with the Show menu to view unfinished or finished projects. Adding an idea resets both filters so the new card is visible.

- `dist/index.html`: page structure, form, and project card template.
- `dist/styles.css`: responsive layout, colors, typography, and card states.
- `dist/theme.js`: early theme setup, appearance controls, and saved preferences.
- `dist/app.js`: starter projects, category filtering, adding ideas, completion, and local browser storage.
- `server.cjs`: local static server, bound only to loopback.

Refresh the browser after accepting or rejecting **and saving** source edits. There is no build step or automatic reload. Browser data persists independently of source-code undo; clear this site's local storage to restore the starter board.

## Diff exercises

These files were created in the current chat, so its cumulative diff shows additions. To test replacement blocks with deleted rows, make the next edit pass in a new Codex chat: its first snapshot will contain the existing page.

1. Change the headline and starter project descriptions.
2. Adjust the purple note and green category colors.
3. Add a delete-project button or a text search.
4. Reject one block, then undo and redo it.
5. Type a personal comment above or below a block, then request a separate Codex edit.

Run `npm run check` for JavaScript syntax checks.
