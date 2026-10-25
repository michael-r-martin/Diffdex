const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createReviewSaver } = require('../src/review-save');
const { Review } = require('../src/review');

test('review saves report failures and leave ordinary undo unsaved', async () => {
  const calls = [], errors = [], saved = [];
  const doc = { uri: { fsPath: '/project/a.js', toString: () => 'file:///project/a.js' }, version: 1, isDirty: true };
  let fail = false;
  const saver = createReviewSaver({
    commands: { async executeCommand(name, request) {
      calls.push({ name, request });
      if (fail) return false;
      doc.isDirty = false;
      return true;
    } }, window: { showErrorMessage: message => errors.push(message) }
  }, { appendLine() {} }, document => saved.push(document));
  assert.equal(await saver.save(doc), true);
  assert.equal(calls[0].name, '_codexDiff.saveReviewFile');
  const review = new Review('old', 'new');
  const before = { text: review.text, regions: review.regions.map(region => ({ ...region })) };
  review.regions = [];
  review.update([{ rangeOffset: 0, rangeLength: 3, text: 'old' }], 'old');
  review.recordRejection(before);
  doc.isDirty = true;
  assert.equal(review.update([{ rangeOffset: 0, rangeLength: 3, text: 'new' }], 'new', true), true);
  saver.afterUndoRedo(doc);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(doc.isDirty, false);
  assert.equal(review.update([{ rangeOffset: 0, rangeLength: 3, text: 'old' }], 'old', true), true);
  saver.afterUndoRedo(doc);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls.length, 3);
  assert.notEqual(review.update([{ rangeOffset: 0, rangeLength: 0, text: 'typing' }], 'typingold'), true);
  assert.notEqual(review.update([{ rangeOffset: 0, rangeLength: 6, text: '' }], 'old', true), true);
  saver.afterUndoRedo(doc);
  doc.version++; // New typing after undo must not be saved by that queued action.
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls.length, 3);
  fail = true;
  doc.isDirty = true;
  assert.equal(await saver.save(doc), false);
  assert.equal(doc.isDirty, true);
  assert.match(errors[0], /applied the review decision but could not save/);
  saver.afterUndoRedo(doc);
  saver.dispose();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls.length, 4);
  assert.equal(saved.length, 3, 'Only successful saves advance the incoming merge baseline');
});

test('saves for the same file wait for the previous save and baseline update', async () => {
  const doc = { uri: { toString: () => 'file:///project/a.js' }, isDirty: false };
  const order = [];
  let release;
  const firstSave = new Promise(resolve => { release = resolve; });
  const saver = createReviewSaver({ commands: { async executeCommand() {
    order.push('save');
    if (order.length === 1) await firstSave;
    return true;
  } } }, { appendLine() {} }, () => { order.push('baseline'); });
  const first = saver.save(doc), second = saver.save(doc);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['save']);
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(order, ['save', 'baseline', 'save', 'baseline']);
  saver.dispose();
});

test('native save bridge uses the requested model and skips formatting without skipping conflict checks', async () => {
  const commands = new Map(), saves = [];
  const uri = { scheme: 'file', toString: () => 'file:///project/target.js' };
  const context = vm.createContext({
    qe: { registerCommand: (name, handler) => commands.set(name, handler) }, wn: 'textFileService',
    __codexDiffLabGetState: () => ({ editors: [{ editor: { getModel: () => ({ uri, getVersionId: () => 1, getValue: () => 'review buffer' }) } }] })
  });
  vm.runInContext(fs.readFileSync('prototype/review-undo.js', 'utf8'), context);
  const accessor = { get(service) {
    assert.equal(service, 'textFileService');
    return { read: async () => ({ value: 'proposal' }), files: { get() {} }, async save(resource, options) { saves.push({ resource, options }); return resource; } };
  } };
  assert.equal(await commands.get('_codexDiff.saveReviewFile')(accessor, { uri: uri.toString(), expectedDisk: 'proposal', expectedVersion: 1 }), true);
  assert.equal(saves[0].resource, uri);
  assert.equal(saves[0].options.skipSaveParticipants, true);
  assert.equal(saves[0].options.ignoreModifiedSince, undefined);
  assert.equal(await commands.get('_codexDiff.saveReviewFile')(accessor, { uri: 'file:///unrelated.js' }), false);
});

test('save metadata refresh requires exact known disk contents and keeps native conflict checks', async () => {
  const commands = new Map(), updates = [], saves = [];
  const uri = { scheme: 'file', toString: () => 'file:///project/a.js' };
  let disk = { value: 'captured proposal', mtime: 20, etag: 'captured-stat' };
  const context = vm.createContext({
    qe: { registerCommand: (name, handler) => commands.set(name, handler) }, wn: 'textFileService',
    __codexDiffLabGetState: () => ({ editors: [{ editor: { getModel: () => ({ uri, getVersionId: () => 1, getValue: () => 'review buffer' }) } }] })
  });
  vm.runInContext(fs.readFileSync('prototype/review-undo.js', 'utf8'), context);
  const service = {
    files: { get: () => ({ updateLastResolvedFileStat: stat => updates.push(stat) }) },
    read: async () => disk,
    save: async (resource, options) => { saves.push(options); return resource; }
  };
  const save = request => commands.get('_codexDiff.saveReviewFile')({ get: () => service }, { uri: uri.toString(), expectedVersion: 1, ...request });
  assert.equal(await save({ expectedDisk: 'captured proposal' }), true);
  assert.equal(updates[0], disk);
  disk = { value: 'unexpected external edit', mtime: 30, etag: 'newer-stat' };
  assert.equal(await save({ expectedDisk: 'captured proposal' }), false);
  assert.equal(saves.length, 1, 'Unknown disk content must block save even if native cached metadata is current');
  assert.equal(updates.length, 1, 'An unknown external edit cannot replace the saved stat');
  assert.ok(saves.every(options => options.ignoreModifiedSince === undefined));
  disk = { value: 'review buffer', mtime: 40, etag: 'manual-save-stat' };
  assert.equal(await save({ expectedDisk: 'captured proposal' }), true, 'Already identical disk/buffer permits review after a manual save');
});

test('queued saves keep the requested document version while waiting for an earlier save', async () => {
  const calls = [], logs = [];
  const doc = { uri: { toString: () => 'file:///project/a.js' }, version: 1, isDirty: false };
  let release;
  const firstSave = new Promise(resolve => { release = resolve; });
  const saver = createReviewSaver({ commands: { async executeCommand(name, request) {
    calls.push(request); await firstSave; return true;
  } }, window: { showErrorMessage() {} } }, { appendLine: line => logs.push(line) });
  const first = saver.save(doc, 'disk', 'review.accept');
  const second = saver.save(doc, 'disk', 'review.reject');
  await new Promise(setImmediate);
  doc.version++;
  release();
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedVersion, 1);
  assert.ok(logs.some(line => line.includes('blocked-version-changed')));
  saver.dispose();
});

test('native bridge refuses model changes during its asynchronous disk read', async () => {
  const commands = new Map(), logs = [];
  const uri = { scheme: 'file', toString: () => 'file:///project/a.js' };
  let version = 7, saved = false, updated = false;
  vm.runInNewContext(fs.readFileSync('prototype/review-undo.js', 'utf8'), {
    qe: { registerCommand: (name, handler) => commands.set(name, handler) }, wn: 'files',
    console: { info: line => logs.push(line) },
    __codexDiffLabGetState: () => ({ editors: [{ editor: { getModel: () => ({ uri, getVersionId: () => version, getValue: () => 'review buffer' }) } }] })
  });
  const service = { read: async () => { version++; return { value: 'proposal' }; },
    files: { get: () => ({ updateLastResolvedFileStat() { updated = true; } }) },
    save: async () => { saved = true; return uri; } };
  const save = commands.get('_codexDiff.saveReviewFile');
  assert.equal(await save({ get: () => service }, { uri: uri.toString(), expectedDisk: 'proposal', expectedVersion: 7 }), false);
  assert.equal(saved, false);
  assert.equal(updated, false);
  assert.ok(logs.some(line => line.includes('blocked-disk-or-version-changed')));
});
