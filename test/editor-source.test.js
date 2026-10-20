const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveEditor, verifyArchive, version, commit } = require('../packaging/editor-source.cjs');

test('editor resolution gives setup guidance and never silently ignores an explicit override', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-editor-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  assert.throws(() => resolveEditor({ override: '', candidates: [temporary] }), /npm run setup:mac/);
  assert.throws(() => resolveEditor({ override: temporary, candidates: [] }), /ENOENT/);
  const base = path.join(temporary, 'Contents/Resources/app');
  fs.mkdirSync(path.join(base, 'out/vs/workbench'), { recursive: true });
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(base, 'product.json'), JSON.stringify({ commit }));
  fs.writeFileSync(path.join(base, 'out/vs/workbench/workbench.desktop.main.js'), 'modified');
  assert.throws(() => resolveEditor({ override: temporary }), /Unsupported editor/);
});

test('downloaded bytes must match the pinned archive checksum before extraction', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-archive-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const archive = path.join(temporary, 'archive.zip');
  fs.writeFileSync(archive, 'archive fixture');
  const digest = crypto.createHash('sha256').update('archive fixture').digest('hex');
  await verifyArchive(archive, digest);
  fs.appendFileSync(archive, 'corruption');
  await assert.rejects(verifyArchive(archive, digest), /SHA-256 mismatch/);
});
