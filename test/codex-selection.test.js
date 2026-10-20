const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('selection bridge sends resolved changes without keyboard focus and resumes on visibility/focus', () => {
  const messages = [], tasks = [], events = {};
  const document = { hidden: false, addEventListener: (name, cb) => events[name] = cb };
  const context = vm.createContext({ document,
    window: { addEventListener: (name, cb) => events[name] = cb },
    mm: { postMessage: message => messages.push(message.id) },
    queueMicrotask: cb => tasks.push(cb),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../scripts/codex-selection-client.js'), 'utf8'), context);
  const select = id => { context.__diffLabSelection(id); while (tasks.length) tasks.shift()(); };
  select(null); // A new chat may not yet have a server ID.
  select('saved-chat-a'); // Mapping resolves without another navigation.
  select('saved-chat-a');
  select('saved-chat-b');
  assert.deepEqual(messages, [null, 'saved-chat-a', 'saved-chat-b']);
  document.hidden = true;
  select('saved-chat-c');
  assert.equal(messages.length, 3);
  document.hidden = false;
  events.visibilitychange();
  events.focus();
  assert.deepEqual(messages.slice(-2), ['saved-chat-c', 'saved-chat-c']);
});
