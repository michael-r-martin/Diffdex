const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Execute the real extension commands against a file-backed editor double. The
// external writer deliberately emits no document event (watcher has not caught up).
async function fixture(t, initial = 'baseline\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-external-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'prompt.txt'), uri = { fsPath: file, toString: () => `file://${file}` };
  let text = initial, disk = text;
  fs.writeFileSync(file, disk);
  const doc = { uri, version: 1, isDirty: false, getText: () => text, positionAt: offset => offset };
  const commands = new Map(), edits = [], logs = [], subscriptions = [];
  let onChange = () => {};
  let files = [{ path: file, before: { exists: true, text }, after: { exists: true, text }, updatedAt: 1 }];
  const noEvent = () => ({ dispose() {} });
  const vscode = {
    Uri: { file: () => uri }, Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    WorkspaceEdit: class { replace(uri, range, value) { this.range = range; this.value = value; } },
    StatusBarAlignment: { Left: 0 }, EventEmitter: class { fire() {} dispose() {} },
    commands: { registerCommand(name, callback) { commands.set(name, callback); return noEvent(); },
      async executeCommand(name, ...args) { return commands.get(name)?.(...args); } },
    window: { createOutputChannel: () => ({ appendLine: line => logs.push(line), dispose() {} }),
      createStatusBarItem: () => ({ show() {}, dispose() {} }), registerWebviewViewProvider: noEvent,
      registerTreeDataProvider: noEvent, onDidChangeVisibleTextEditors: noEvent,
      showWarningMessage: async () => undefined, showErrorMessage: noEvent },
    workspace: { textDocuments: [doc], workspaceFolders: [{ uri: { fsPath: root } }],
      getConfiguration: () => ({ get: () => undefined }), onWillSaveTextDocument: noEvent, onDidSaveTextDocument: noEvent, onDidChangeTextDocument: callback => { onChange = callback; return noEvent(); },
      async applyEdit(edit) { edits.push(edit); text = text.slice(0, edit.range.start) + edit.value + text.slice(edit.range.end); doc.version++; doc.isDirty = true; onChange({ document: doc, contentChanges: [{ rangeOffset: edit.range.start, rangeLength: edit.range.end-edit.range.start, text: edit.value }] }); return true; } }
  };
  const localRequire = createRequire(path.resolve('src/extension.js'));
  const overrides = {
    vscode, './setup': { registerCaptureSetup() {} }, './chat-context': { registerChatContext() {} },
    './store': { listSessions: () => [{ key: 'chat', cwd: root, sessionId: 'session', files }] },
    './git-review': { createGitReview: () => ({ reconcile: async sessions => ({ sessions, cleared: [] }) }) },
    './chat-titles': { createTitleReader: () => () => new Map() },
    './sidebar': { ReviewSidebar: class { update(state) { this.state = state; } } }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('src/extension.js', 'utf8'), {
    require: name => overrides[name] || localRequire(name), module, process, console,
    setTimeout, clearTimeout, queueMicrotask, setInterval: () => 0, clearInterval() {}
  });
  // Model the native service with current file metadata: its save accepts a
  // write unless the Diffdex bridge explicitly checks the expected disk text.
  const native = { read: async () => ({ value: fs.readFileSync(file, 'utf8') }),
    files: { get: () => ({ updateLastResolvedFileStat() {} }) },
    async save() { fs.writeFileSync(file, text); doc.isDirty = false; return uri; } };
  vm.runInNewContext(fs.readFileSync('prototype/review-undo.js', 'utf8'), {
    qe: { registerCommand: (name, handler) => commands.set(name, payload => handler({ get: () => native }, payload)) },
    wn: 'files', console: { info: line => logs.push(line) },
    __codexDiffLabGetState: () => ({ editors: [{ editor: { getModel: () => ({ uri: { ...uri, scheme: 'file' }, getVersionId: () => doc.version, getValue: () => text }) } }] })
  });
  const undo = [];
  commands.set('_codexDiff.pushReviewUndo', payload => { undo.push(payload); return true; });
  const state = new Map([['incomingSyncVersion', 1]]);
  module.exports.activate({ extensionPath: root, subscriptions, workspaceState: {
    get: key => state.get(key), update: async (key, value) => state.set(key, value)
  } });
  async function refresh() { await new Promise(setImmediate); return commands.get('codexDiff.refresh')(); }
  await refresh();
  t.after(() => subscriptions.forEach(s => s?.dispose?.()));
  return { doc, edits, logs, refresh, file, commands, state, undo,
    buffer(value) { text = value; doc.version++; doc.isDirty = false; },
    undoText(value) {
      const previous = text; text = value; doc.version++; doc.isDirty = true;
      onChange({ document: doc, reason: 1, contentChanges: [{ rangeOffset: 0, rangeLength: previous.length, text: value }] });
    },
    external(value) { disk = value; fs.writeFileSync(file, value); },
    capture(value) { files = [{ ...files[0], after: { exists: true, text: value }, updatedAt: files[0].updatedAt + 1 }]; }
  };
}

test('refresh never reapplies a stale capture over newer external contents', async t => {
  const f = await fixture(t);
  f.capture('old proposal\n');
  f.external('new external prompt\n');
  f.buffer('new external prompt\n'); // watcher has loaded the newer write
  await f.refresh();
  assert.equal(f.doc.getText(), 'new external prompt\n');
  assert.equal(f.edits.length, 0);
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'new external prompt\n');
});

test('refresh preserves a stale open buffer when disk has advanced beyond the capture', async t => {
  const f = await fixture(t);
  f.capture('old proposal\n');
  f.external('new external prompt\n'); // watcher has NOT loaded the newer write
  await f.refresh();
  assert.equal(f.doc.getText(), 'baseline\n');
  assert.equal(f.edits.length, 0);
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'new external prompt\n');
});

for (const action of ['accept', 'reject']) test(`review ${action} cannot save a stale buffer over external edits`, async t => {
  const f = await fixture(t);
  f.capture('proposal\n'); f.external('proposal\n'); f.buffer('proposal\n');
  const result = await f.refresh(), item = result.editorDocuments[0], h = item.hunks[0];
  f.external('new external prompt\n');
  // Metadata-only acceptance still saves dirty files in normal use.
  f.doc.isDirty = true;
  const saved = await f.commands.get('codexDiff.reviewBlock')({ action, reviewKey: h.reviewKey,
    reviewVersion: h.reviewVersion, expected: item.after, current: f.doc.getText(), block: h.block });
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'new external prompt\n');
  assert.equal(saved, false);
  assert.ok(f.logs.some(line => line.includes('blocked-disk')));
  if (action === 'reject') assert.equal(f.edits.length, 0, 'No stale edit may reach editor autosave');
});

test('acceptance undo/redo restoration cannot save over newer external edits', async t => {
  const f = await fixture(t);
  f.capture('proposal\n'); f.external('proposal\n'); f.buffer('proposal\n');
  const result = await f.refresh(), item = result.editorDocuments[0], h = item.hunks[0];
  assert.equal(await f.commands.get('codexDiff.reviewBlock')({ action: 'accept', reviewKey: h.reviewKey,
    reviewVersion: h.reviewVersion, expected: item.after, block: h.block }), true);
  f.external('new external prompt\n'); f.doc.isDirty = true;
  for (const snapshot of [f.undo[0].before, f.undo[0].after]) {
    assert.equal(await f.commands.get('codexDiff.restoreReview')(snapshot), false);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'new external prompt\n');
  }
});

test('refresh still merges independent local edits when the capture matches disk', async t => {
  const f = await fixture(t, 'baseline\nanchor\nlast\n');
  f.buffer('baseline\nanchor\nlocal addition\n'); f.doc.isDirty = true;
  f.capture('proposal\nanchor\nlast\n'); f.external('proposal\nanchor\nlast\n');
  await f.refresh();
  assert.equal(f.doc.getText(), 'proposal\nanchor\nlocal addition\n');
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'proposal\nanchor\nlast\n', 'Refresh itself does not save');
  const entry = f.logs.find(line => line.includes('buffer-replace'));
  assert.ok(entry.includes('refresh.incoming'));
  assert.ok(entry.includes('"version":'));
});

test('explicit incoming resolution refuses a capture superseded on disk', async t => {
  const f = await fixture(t);
  f.buffer('conflicting local edit\n'); f.doc.isDirty = true;
  f.capture('proposal\n'); f.external('proposal\n');
  const result = await f.refresh();
  assert.equal(result.incoming.length, 1);
  f.external('new external prompt\n');
  assert.equal(await f.commands.get('codexDiff.resolveIncoming')(result.incoming[0], 'Load Codex version'), false);
  assert.equal(f.doc.getText(), 'conflicting local edit\n');
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'new external prompt\n');
});

test('native rejection undo and redo cannot save over newer external edits', async t => {
  const f = await fixture(t);
  f.capture('proposal\n'); f.external('proposal\n'); f.buffer('proposal\n');
  const result = await f.refresh(), item = result.editorDocuments[0], h = item.hunks[0];
  assert.equal(await f.commands.get('codexDiff.reviewBlock')({ action: 'reject', reviewKey: h.reviewKey,
    reviewVersion: h.reviewVersion, expected: item.after, block: h.block }), true);
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'baseline\n');
  f.external('new external prompt\n');
  for (const text of ['proposal\n', 'baseline\n']) {
    f.undoText(text);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'new external prompt\n');
  }
  assert.ok(f.logs.some(line => line.includes('review.undoRedo') && line.includes('save-request')));
});
