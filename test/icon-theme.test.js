const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareIconTheme } = require('../prototype/prepare-icon-theme.cjs');

test('copied icon theme resolves fonts inside the app and remains stable on relaunch', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-lab-icons-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const profile = path.join(root, 'profile');
  const app = path.join(root, 'Demo App.app');
  const relative = 'theme-seti/icons/vs-seti-icon-theme.json';
  const copiedPath = path.join(profile, 'builtin-extensions', relative);
  const bundledPath = path.join(app, 'Contents/Resources/app/extensions', relative);
  const theme = { fonts: [{ id: 'seti', src: [{ path: './seti.woff', format: 'woff' }] }], fileExtensions: { js: '_javascript' } };
  for (const file of [copiedPath, bundledPath]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(theme));
  }
  const fontPath = path.join(path.dirname(bundledPath), 'seti.woff');
  fs.writeFileSync(fontPath, 'bundled font');
  prepareIconTheme(profile, app);
  const content = fs.readFileSync(copiedPath, 'utf8');
  const updated = JSON.parse(content);
  assert.equal(path.resolve(path.dirname(copiedPath), updated.fonts[0].src[0].path), fontPath);
  assert.deepEqual(updated.fileExtensions, theme.fileExtensions);
  assert.equal(updated.fonts[0].src[0].format, 'woff');
  prepareIconTheme(profile, app);
  assert.equal(fs.readFileSync(copiedPath, 'utf8'), content);
  assert.deepEqual(JSON.parse(fs.readFileSync(bundledPath, 'utf8')), theme);
  fs.unlinkSync(fontPath);
  assert.throws(() => prepareIconTheme(profile, app), /ENOENT/);
  assert.equal(fs.readFileSync(copiedPath, 'utf8'), content);
});
