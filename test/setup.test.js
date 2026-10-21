const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerCaptureSetup } = require('../src/setup');

function setup(t, { trusted = true, packaged = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-project-setup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = name => {
    const fsPath = path.join(root, name);
    fs.mkdirSync(fsPath);
    return { name, uri: { scheme: 'file', fsPath } };
  };
  const first = folder('first');
  const events = {}, commands = new Map(), messages = [], errors = [], opened = [];
  const disposable = { dispose() {} };
  const vscode = {
    env: { appRoot: '/Applications/Diffdex.app/Contents/Resources/app' },
    Uri: { file: fsPath => ({ fsPath }) },
    commands: { registerCommand(name, handler) { commands.set(name, handler); return disposable; } },
    workspace: {
      isTrusted: trusted, workspaceFolders: [first],
      onDidChangeWorkspaceFolders(handler) { events.folders = handler; return disposable; },
      onDidGrantWorkspaceTrust(handler) { events.trust = handler; return disposable; }
    },
    window: {
      async showInformationMessage(message) { messages.push(message); return 'View hooks'; },
      showErrorMessage(message) { errors.push(message); },
      async showTextDocument(uri) { opened.push(uri.fsPath); }
    }
  };
  const context = { extensionPath: '/Applications/Diffdex.app/Contents/Resources/app/extensions/diffdex-reviews', subscriptions: [] };
  const options = { packaged, captureStore: () => path.join(root, 'captures'), log: { appendLine() {} } };
  const file = project => path.join(project.uri.fsPath, '.codex/hooks.json');
  return { folder, first, events, commands, messages, errors, opened, vscode, context, options, file };
}

test('opening another project installs hooks; reopening preserves hooks without prompting or backups', async t => {
  const x = setup(t);
  await registerCaptureSetup(x.vscode, x.context, x.options);
  assert.ok(fs.existsSync(x.file(x.first)));
  assert.match(x.messages[0], /Run \/hooks in Codex/);
  assert.deepEqual(x.opened, [x.file(x.first)]);

  const second = x.folder('second');
  fs.mkdirSync(path.dirname(x.file(second)));
  fs.writeFileSync(x.file(second), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'shell', hooks: [{ command: 'other-hook' }] }] } }));
  await x.events.folders({ added: [second] });
  const config = JSON.parse(fs.readFileSync(x.file(second), 'utf8'));
  assert.equal(config.hooks.PreToolUse[0].hooks[0].command, 'other-hook');
  for (const event of ['PreToolUse', 'PostToolUse']) {
    const capture = config.hooks[event].at(-1);
    assert.equal(capture.matcher, '.*');
    assert.match(capture.hooks[0].command, /Contents\/MacOS\/Diffdex/);
    assert.match(capture.hooks[0].command, /extensions\/diffdex-reviews\/hooks\/capture.cjs/);
  }
  const previous = fs.readFileSync(x.file(second), 'utf8');
  const entries = fs.readdirSync(path.dirname(x.file(second)));
  await x.events.folders({ added: [second] });
  assert.equal(x.messages.length, 2);
  assert.equal(fs.readFileSync(x.file(second), 'utf8'), previous);
  assert.deepEqual(fs.readdirSync(path.dirname(x.file(second))), entries);
});

test('setup waits for workspace trust and skips remote folders', async t => {
  const x = setup(t, { trusted: false });
  await registerCaptureSetup(x.vscode, x.context, x.options);
  assert.equal(fs.existsSync(x.file(x.first)), false);
  await x.commands.get('codexDiff.enableCapture')();
  assert.equal(fs.existsSync(x.file(x.first)), false);
  assert.match(x.messages[0], /Trust this workspace/);
  x.vscode.workspace.isTrusted = true;
  await x.events.trust();
  assert.ok(fs.existsSync(x.file(x.first)));
  const remote = x.folder('remote');
  remote.uri.scheme = 'vscode-remote';
  await x.events.folders({ added: [remote] });
  assert.equal(fs.existsSync(x.file(remote)), false);
});

test('invalid project hooks are preserved and do not prevent setup for other folders', async t => {
  const x = setup(t);
  fs.mkdirSync(path.dirname(x.file(x.first)));
  fs.writeFileSync(x.file(x.first), 'invalid JSON');
  const second = x.folder('second');
  x.vscode.workspace.workspaceFolders.push(second);
  await registerCaptureSetup(x.vscode, x.context, x.options);
  assert.equal(fs.readFileSync(x.file(x.first), 'utf8'), 'invalid JSON');
  assert.ok(fs.existsSync(x.file(second)));
  assert.equal(x.errors.length, 1);
  assert.match(x.errors[0], /first/);
});

test('development extension requires explicit setup', async t => {
  const x = setup(t, { packaged: false });
  await registerCaptureSetup(x.vscode, x.context, x.options);
  assert.equal(fs.existsSync(x.file(x.first)), false);
  await x.commands.get('codexDiff.enableCapture')();
  assert.ok(fs.existsSync(x.file(x.first)));
});
