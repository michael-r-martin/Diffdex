const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { packageMac } = require('../packaging/package-macos.cjs');

test('packaging stops before building when a required check fails', async () => {
  let built = false;
  await assert.rejects(packageMac(undefined, {
    run() { throw Error('Required check failed'); }, build() { built = true; }
  }), /Required check failed/);
  assert.equal(built, false);
});

test('only verified packages get checksums and a package receipt', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, 'Diffdex-mac-arm64.zip');
  fs.writeFileSync(archive, 'archive fixture');
  fs.writeFileSync(path.join(directory, 'build-info.json'), JSON.stringify({ name: 'Diffdex', version: '0.2.0' }));
  const steps = { run() {}, build: () => path.join(directory, 'Diffdex.app'), verify() { throw Error('Signature mismatch'); } };
  await assert.rejects(packageMac(directory, steps), /Signature mismatch/);
  assert.equal(fs.existsSync(path.join(directory, 'SHA256SUMS')), false);
  steps.verify = () => {};
  assert.equal(await packageMac(directory, steps), directory);
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'package-info.json')));
  assert.equal(receipt.sha256, crypto.createHash('sha256').update('archive fixture').digest('hex'));
  assert.equal(receipt.version, '0.2.0');
  assert.match(receipt.distribution, /not approved for redistribution/);
  assert.equal(fs.readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8'), `${receipt.sha256}  Diffdex-mac-arm64.zip\n`);
});
