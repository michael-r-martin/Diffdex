const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('auto display follows replacement without cursor or toggle, excludes chat', async () => {
  const events = {}, zones = new Map(), elements = [];
  let host = null, model = null, next = 0;
  let lines = ['function greet(name) {', 'return `Welcome, ${name}!`;', '}'];
  const fixture = { uri: { scheme: 'file', path: '/project/demo/view-zone-demo.js' }, getLineCount: () => lines.length, getLineContent: n => lines[n-1], getValue: () => lines.join('\n') };
  const editor = {
    getDomNode: () => host, getModel: () => model,
    getPosition() { throw Error('Must not depend on cursor'); }, applyFontInfo() {},
    changeViewZones(cb) { cb({ addZone(z) { const id = String(++next); zones.set(id,z); return id; }, removeZone(id) { zones.delete(id); } }); },
    createDecorationsCollection() { return { clear() {} }; }
  };
  for (const name of ['onDidChangeModel','onDidChangeModelContent','onDidLayoutChange','onDidFocusEditorText','onDidChangeConfiguration','onDidDispose']) {
    editor[name] = cb => { events[name] = cb; return { dispose() {} }; };
  }
  const context = vm.createContext({ queueMicrotask, setTimeout: () => 1, clearTimeout() {}, console,
    document: { createElement(tag) { elements.push(tag); return { style: {}, setAttribute() {}, appendChild() {}, remove() {} }; } }
  });
  vm.runInContext(fs.readFileSync('prototype/runtime-overlay.js','utf8'), context);
  context.__codexDiffLabAttach(editor);
  await new Promise(resolve => queueMicrotask(resolve));
  host = {}; model = fixture; events.onDidChangeModel();
  assert.equal(zones.size,1); assert.equal([...zones.values()][0].afterLineNumber,1);
  events.onDidLayoutChange(); assert.equal(zones.size,1);
  lines.unshift('// inserted above'); events.onDidChangeModelContent();
  assert.equal([...zones.values()][0].afterLineNumber,2);
  assert.ok(!elements.includes('button'));
  model = { uri: { scheme: 'vscode-chat-input' } }; events.onDidChangeModel(); assert.equal(zones.size,0);
  model = {...fixture, uri: {scheme: 'file', path: '/project/other.js'}}; events.onDidChangeModel(); assert.equal(zones.size,0);
  model = fixture; lines = ['return somethingElse;']; events.onDidChangeModel(); assert.equal(zones.size,0);
});
