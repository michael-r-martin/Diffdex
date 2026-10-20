const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');

function verify(app) {
  app = path.resolve(app);
  const base = path.join(app, 'Contents/Resources/app');
  const extension = path.join(base, 'extensions/diffdex-reviews');
  const binary = path.join(app, 'Contents/MacOS/Diffdex');
  const product = JSON.parse(fs.readFileSync(path.join(base, 'product.json')));
  assert.equal(product.nameShort, 'Diffdex');
  assert.equal(product.darwinBundleIdentifier, 'com.unseriouslabs.diffdex');
  assert.equal(product.urlProtocol, 'diffdex');
  assert.equal(product.updateUrl, undefined);
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  for (const [file, expected] of Object.entries(product.checksums)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(base, 'out', file))).digest('base64').replace(/=+$/, '');
    assert.equal(actual, expected, `Integrity: ${file}`);
  }
  const names = fs.readdirSync(extension).sort();
  assert.deepEqual(names, ['diffdex.json', 'hooks', 'media', 'package.json', 'scripts', 'src']);
  assert.ok(fs.statSync(path.join(app, 'Contents/Resources/Diffdex.icns')).size > 0);
  const version = execFileSync(path.join(base, 'bin/diffdex'), ['--version'], { encoding: 'utf8' });
  assert.match(version, /1\.142\.0/);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-package-smoke-'));
  try {
    const project = path.join(temporary, 'project');
    const store = path.join(temporary, 'captures');
    fs.mkdirSync(project);
    const file = path.join(project, 'hello.js');
    fs.writeFileSync(file, 'old\n');
    const event = { session_id: 'packaged-smoke', tool_use_id: 'edit-one', tool_name: 'apply_patch', cwd: project, tool_input: { command: '*** Begin Patch\n*** Update File: hello.js\n@@\n-old\n+new\n*** End Patch' } };
    for (const phase of ['PreToolUse', 'PostToolUse']) {
      if (phase === 'PostToolUse') fs.writeFileSync(file, 'new\n');
      const result = spawnSync(binary, [path.join(extension, 'hooks/capture.cjs'), store], { input: JSON.stringify({ ...event, hook_event_name: phase }), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const { listSessions } = require(path.join(extension, 'src/store.js'));
    const sessions = listSessions(store, [fs.realpathSync(project)]);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].files[0].before.text, 'old\n');
    assert.equal(sessions[0].files[0].after.text, 'new\n');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  console.log('Diffdex verification passed: signature, branding, integrity, clean contents, CLI and packaged capture.');
}
if (require.main === module) verify(process.argv[2]);
module.exports = { verify };
