const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { build } = require('./build-macos.cjs');
const { verify } = require('./verify-macos.cjs');
const root = path.resolve(__dirname, '..');

// Injected steps let tests check release gates without cloning/signing a full IDE.
async function packageMac(output, steps = {}) {
  const run = steps.run || ((command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' }));
  run('npm', ['test']);
  run('npm', ['run', 'check']);
  const app = (steps.build || build)(output);
  (steps.verify || verify)(app);
  const directory = path.dirname(app);
  const archive = path.join(directory, 'Diffdex-mac-arm64.zip');
  run('/usr/bin/unzip', ['-tq', archive]);
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archive)) digest.update(chunk);
  const checksum = digest.digest('hex');
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), `${checksum}  ${path.basename(archive)}\n`);
  const receipt = {
    ...JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json'), 'utf8')),
    archive: path.basename(archive), sha256: checksum,
    verification: 'tests, syntax, signature, integrity, CLI, capture and ZIP passed',
    distribution: 'personal-local-build; not approved for redistribution'
  };
  fs.writeFileSync(path.join(directory, 'package-info.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`Verified local package: ${directory}\nInstall the new app after quitting the running Diffdex. Your application data stays in place.`);
  return directory;
}

if (require.main === module) packageMac(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { packageMac };
