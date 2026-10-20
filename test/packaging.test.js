const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { extensionManifest, brandProduct } = require('../packaging/build-macos.cjs');
const { captureCommand, installProjectHooks } = require('../src/setup');

test('packaged manifest has permanent-storage guidance and safe app defaults', () => {
  const original = require('../package.json');
  const manifest = extensionManifest(original);
  assert.equal(manifest.displayName, 'Diffdex Reviews');
  assert.equal(manifest.scripts, undefined);
  assert.equal(manifest.contributes.configurationDefaults['update.mode'], 'none');
  assert.equal(manifest.contributes.configurationDefaults['workbench.iconTheme'], 'vs-seti');
  assert.ok(manifest.contributes.commands.some(item => item.command === 'codexDiff.enableCapture'));
  assert.match(manifest.contributes.configuration.properties['codexDiff.storePath'].description, /permanent/);
  assert.ok(original.scripts, 'Source manifest is unchanged');
});

test('product branding separates identity and retains real integrity checks', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-product-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'out'));
  fs.writeFileSync(path.join(directory, 'out/main.js'), 'patched');
  const product = brandProduct({ checksums: { 'main.js': 'old' }, updateUrl: 'vendor-update', extensionsGallery: { serviceUrl: 'existing' } }, directory);
  assert.equal(product.nameShort, 'Diffdex');
  assert.equal(product.darwinBundleIdentifier, 'com.unseriouslabs.diffdex');
  assert.equal(product.urlProtocol, 'diffdex');
  assert.equal(product.updateUrl, undefined);
  assert.equal(product.checksums['main.js'], require('node:crypto').createHash('sha256').update('patched').digest('base64').replace(/=+$/, ''));
  assert.equal(product.extensionsGallery.serviceUrl, 'existing');
});

test('project setup preserves other hooks, quotes executable paths, and is idempotent', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-setup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const command = captureCommand("/Applications/Someone's Diffdex.app/reviews", '/Users/test/Application Support/Diffdex/captures', '/Applications/Diffdex.app/Contents/MacOS/Diffdex', true);
  assert.match(command, /^\/usr\/bin\/env ELECTRON_RUN_AS_NODE=1 /);
  assert.ok(command.includes("Someone'\\''s"));
  fs.mkdirSync(path.join(directory, '.codex'));
  const file = path.join(directory, '.codex/hooks.json');
  fs.writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'shell', hooks: [{ type: 'command', command: 'existing-hook' }] }] } }));
  installProjectHooks(directory, command);
  const content = fs.readFileSync(file, 'utf8');
  const config = JSON.parse(content);
  assert.equal(config.hooks.PreToolUse[0].hooks[0].command, 'existing-hook');
  assert.equal(config.hooks.PostToolUse[0].hooks[0].command, command);
  const files = fs.readdirSync(path.dirname(file));
  installProjectHooks(directory, command);
  assert.equal(fs.readFileSync(file, 'utf8'), content);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), files);
  fs.writeFileSync(file, 'invalid JSON');
  assert.throws(() => installProjectHooks(directory, command), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid JSON');
});
