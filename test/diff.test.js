const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hunks } = require('../src/diff');
test('live edits retain the original baseline and disappear only when restored', () => {
  const before = 'header\nold\nfooter';
  assert.deepEqual(hunks(before, 'header\nnew typed text\nfooter'), [{start:1,removed:['old'],added:['new typed text']}]);
  assert.deepEqual(hunks(before, 'header\nfooter'), [{start:1,removed:['old'],added:[]}]);
  assert.deepEqual(hunks(before, before), []);
});
test('replacement retains all removed lines and current anchor', () => {
  assert.deepEqual(hunks('a\nb\nc\nd', 'a\nx\nd'), [{ start: 1, removed: ['b', 'c'], added: ['x'] }]);
});
test('deletions at beginning and EOF', () => {
  assert.deepEqual(hunks('a\nb\nc', 'b'), [
    { start: 0, removed: ['a'], added: [] }, { start: 1, removed: ['c'], added: [] }
  ]);
});
test('unchanged and CRLF equivalent text have no hunks', () => {
  assert.deepEqual(hunks('a\r\nb', 'a\nb'), []);
});
test('large files are bounded', () => assert.equal(hunks('a\n'.repeat(1500), 'b\n'.repeat(1500)), null));
test('new and emptied files do not invent a deleted or added blank line', () => {
  assert.deepEqual(hunks('', 'new'), [{ start: 0, removed: [], added: ['new'] }]);
  assert.deepEqual(hunks('old', ''), [{ start: 0, removed: ['old'], added: [] }]);
});
test('coalesces weak brace and whitespace anchors inside a larger rewrite', () => {
  const before = 'old function\n}\n\nold call';
  const after = 'new helper\n}\n\nnew function\n}\nnew call';
  const changes = hunks(before, after);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { start: 0, removed: before.split('\n'), added: after.split('\n') });
});
test('keeps meaningful unchanged code between independent hunks', () => {
  const changes = hunks('old\nkeepThis();\nold2', 'new\nkeepThis();\nnew2');
  assert.equal(changes.length, 2);
});
test('grouping still reconstructs the new text exactly', () => {
  for (const [before,after] of [['a\n}\n\nb','x\n}\n\ny'], ['a\n\n\n\n\nb','x\n\n\n\n\ny'], ['', 'added'], ['removed','']]) {
    const lines = before === '' ? [] : before.split('\n');
    for (const h of hunks(before,after)) lines.splice(h.start,h.removed.length,...h.added);
    assert.equal(lines.join('\n'),after);
  }
});
