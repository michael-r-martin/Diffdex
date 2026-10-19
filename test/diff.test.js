const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hunks } = require('../src/diff');
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
