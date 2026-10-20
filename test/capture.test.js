const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { capture } = require('../hooks/capture.cjs');
const { listSessions } = require('../src/store');
const { mergedConfig } = require('../scripts/install-hooks.cjs');
function setup(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-capture-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const cwd = path.join(temp, 'repo'); fs.mkdirSync(cwd);
  const store = path.join(temp, 'store');
  const file = path.join(cwd, 'a.js'); fs.writeFileSync(file, 'existing user change\n');
  function event(session, id, patch, phase) { return { session_id: session, tool_use_id: id, tool_name: 'apply_patch', hook_event_name: phase, cwd, tool_input: { command: `*** Begin Patch\n${patch}\n*** End Patch` } }; }
  function edit(session, id, patch, mutate) { capture(event(session,id,patch,'PreToolUse'),store); mutate(); capture(event(session,id,patch,'PostToolUse'),store); }
  return { temp, cwd, store, file, edit, event };
}
test('accumulates from first actual contents, separates chats, and preserves latest snapshots', t => {
  const x = setup(t);
  x.edit('chat1','one','*** Update File: a.js', () => fs.writeFileSync(x.file,'first\n'));
  x.edit('chat1','two','*** Update File: a.js', () => fs.writeFileSync(x.file,'second\n'));
  x.edit('chat2','three','*** Update File: a.js', () => fs.writeFileSync(x.file,'third\n'));
  const chats = listSessions(x.store,[x.cwd]);
  const a = chats.find(c=>c.sessionId==='chat1').files[0], b = chats.find(c=>c.sessionId==='chat2').files[0];
  assert.equal(a.before.text,'existing user change\n'); assert.equal(a.after.text,'second\n');
  assert.equal(b.before.text,'second\n'); assert.equal(b.after.text,'third\n');
  assert.equal(listSessions(x.store,['/another-checkout']).length,0);
});
test('records creation, deletion and rename as absence-aware snapshots', t => {
  const x = setup(t); const b = path.join(x.cwd,'b.js');
  x.edit('chat','move','*** Update File: a.js\n*** Move to: b.js',()=>fs.renameSync(x.file,b));
  const files = listSessions(x.store,[])[0].files;
  assert.equal(files.find(f=>f.path===x.file).after.exists,false);
  assert.equal(files.find(f=>f.path===b).before.exists,false);
  x.edit('chat','delete','*** Delete File: b.js',()=>fs.unlinkSync(b));
  assert.equal(listSessions(x.store,[])[0].files.length,1); // add then delete cancels out
});
test('missing pre-event never fabricates a baseline; no-op patch produces no diff', t => {
  const x=setup(t);
  capture(x.event('chat','lost','*** Update File: a.js','PostToolUse'),x.store);
  assert.equal(listSessions(x.store,[]).length,0);
  x.edit('chat','noop','*** Update File: a.js',()=>{});
  assert.equal(listSessions(x.store,[])[0].files.length,0);
});
test('rejects traversal and symlink escapes without reading outside the checkout', t => {
  const x=setup(t); fs.writeFileSync(path.join(x.temp,'secret'),'secret');
  fs.symlinkSync(path.join(x.temp,'secret'),path.join(x.cwd,'link'));
  x.edit('chat','bad','*** Update File: ../secret\n*** Update File: link',()=>{});
  assert.equal(listSessions(x.store,[])[0].files.length,0);
});
test('installer merges without removing other hooks and is idempotent',()=>{
  const original = { hooks: { PreToolUse: [{matcher:'Bash',hooks:[{command:'existing'}]}] } };
  const merged=mergedConfig(original,'new');
  assert.equal(merged.hooks.PreToolUse[0].hooks[0].command,'existing');
  assert.deepEqual(mergedConfig(merged,'new'),merged);
  assert.equal(original.hooks.PreToolUse.length,1);
});
test('shell and other tools capture updates, additions, deletion and rename', t => {
  const x = setup(t);
  const run = (id, tool, mutate) => {
    const event = { ...x.event('chat', id, '', 'PreToolUse'), tool_name: tool };
    capture(event, x.store); mutate();
    capture({ ...event, hook_event_name: 'PostToolUse' }, x.store);
  };
  run('read', 'exec_command', () => {});
  fs.writeFileSync(x.file, 'personal edit before tool\n');
  run('shell', 'exec_command', () => {
    fs.writeFileSync(x.file, 'shell edit\n');
    fs.writeFileSync(path.join(x.cwd, 'new.txt'), 'created\n');
    fs.mkdirSync(path.join(x.cwd, 'node_modules'));
    fs.writeFileSync(path.join(x.cwd, 'node_modules/ignored'), 'ignored');
  });
  let files = listSessions(x.store, [x.cwd])[0].files;
  assert.equal(files.length, 2);
  assert.equal(files.find(f => f.path === x.file).before.text, 'personal edit before tool\n');
  run('mcp', 'mcp_filesystem_write', () => {
    fs.renameSync(x.file, path.join(x.cwd, 'renamed.js'));
    fs.unlinkSync(path.join(x.cwd, 'new.txt'));
  });
  files = listSessions(x.store, [x.cwd])[0].files;
  assert.equal(files.length, 2);
  assert.equal(files.find(f => f.path === x.file).after.exists, false);
  assert.equal(files.find(f => f.path.endsWith('renamed.js')).before.exists, false);
});
test('workspace scans skip binary files, external symlinks and the capture store', t => {
  const x = setup(t);
  const store = path.join(x.cwd, 'captures');
  fs.writeFileSync(path.join(x.temp, 'secret'), 'private');
  fs.symlinkSync(path.join(x.temp, 'secret'), path.join(x.cwd, 'link'));
  const event = { ...x.event('chat', 'scan', '', 'PreToolUse'), tool_name: 'exec_command' };
  capture(event, store);
  fs.writeFileSync(x.file, Buffer.from([0, 1, 2]));
  capture({ ...event, hook_event_name: 'PostToolUse' }, store);
  assert.equal(listSessions(store, [x.cwd])[0].files.length, 0);
});
test('installer upgrades patch matcher while preserving unrelated handlers', () => {
  const old = { hooks: { PreToolUse: [{ matcher: '^apply_patch$', hooks: [{command:'ours'}, {command:'theirs'}] }] } };
  const result = mergedConfig(old, 'ours');
  assert.equal(result.hooks.PreToolUse[0].matcher, '^apply_patch$');
  assert.deepEqual(result.hooks.PreToolUse[0].hooks, [{command:'theirs'}]);
  assert.equal(result.hooks.PreToolUse[1].matcher, '.*');
});
