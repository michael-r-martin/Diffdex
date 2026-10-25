const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { registerChatContext } = require('../src/chat-context');
const { patchFileContext, originalFileContext } = require('../scripts/codex-file-context.cjs');

test('Explorer action attaches the clicked files instead of the open editor and handles failures', async () => {
  const calls = [], errors = [];
  let action, fail = false, activated = false;
  const uri = fsPath => ({ scheme: 'file', fsPath, toString: () => `file://${fsPath}` });
  const clicked = uri('/project/unopened ü.js'), other = uri('/project/other.js'), folder = uri('/project/folder');
  const vscode = {
    FileType: { File: 1 },
    extensions: { getExtension: () => ({ async activate() { activated = true; } }) },
    workspace: { fs: { stat: async value => ({ type: value === folder ? 2 : 1 }) } },
    commands: {
      registerCommand(name, handler) { assert.equal(name, 'codexDiff.addFileToChat'); action = handler; return {}; },
      async executeCommand(name, value) {
        assert.ok(activated);
        if (fail) throw new Error('Codex unavailable');
        calls.push([name, value]);
      }
    },
    window: { activeTextEditor: { document: { uri: other } }, showErrorMessage: message => errors.push(message) }
  };
  registerChatContext(vscode, { subscriptions: [] });
  assert.equal(await action(clicked), true);
  assert.deepEqual(calls, [['chatgpt.addFileToThread', clicked]]);
  calls.length = 0;
  assert.equal(await action(clicked, [clicked, other, clicked, folder]), true);
  assert.deepEqual(calls.map(call => call[1]), [clicked, other]);
  calls.length = 0;
  assert.equal(await action(clicked, [other]), true, 'Unselected right-click target takes precedence');
  assert.equal(calls[0][1], clicked);
  assert.equal(await action(folder), false);
  assert.equal(await action({ scheme: 'vscode-remote' }), false);
  fail = true;
  assert.equal(await action(clicked), false);
  assert.match(errors[0], /Codex unavailable/);
  const menu = require('../package.json').contributes.menus['explorer/context'].find(item => item.command === 'codexDiff.addFileToChat');
  assert.match(menu.when, /!explorerResourceIsFolder/);
});

test('pinned attachment adapter keeps the active panel chat and retains native sidebar queueing', async () => {
  const original = `before;${originalFileContext};after;`;
  const patched = patchFileContext(original);
  assert.equal(patchFileContext(patched), patched);
  assert.throws(() => patchFileContext('unknown build'), /Unsupported Codex build/);
  const files = [], revealed = [];
  const panel = { viewColumn: 2, reveal: column => revealed.push(column) };
  const host = { focusedView: { kind: 'panel', panel }, isPanelAlive: value => value === panel,
    addContextFile: file => files.push({ file, destination: host.focusedView.kind }) };
  let sidebarFocus = 0;
  const context = vm.createContext({ N6e: path, async Ru() { sidebarFocus++; host.focusedView = { kind: 'sidebar' }; } });
  vm.runInContext(patchFileContext(originalFileContext), context);
  await context.B6e(host, { fsPath: '/project/clicked ü.js' });
  assert.equal(sidebarFocus, 0);
  assert.deepEqual(revealed, [2]);
  assert.equal(files[0].destination, 'panel');
  assert.equal(files[0].file.fsPath, '/project/clicked ü.js');
  assert.equal(files[0].file.startLine, undefined, 'Attaches the entire clicked file');
  host.focusedView = { kind: 'sidebar' };
  await context.B6e(host, { fsPath: '/project/another.js' });
  assert.equal(sidebarFocus, 1);
  assert.equal(files[1].destination, 'sidebar');
});
