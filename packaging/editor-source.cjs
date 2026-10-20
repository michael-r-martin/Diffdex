// Pinned input for the experimental, personal macOS build.
// Public binary releases must use a separate Code - OSS source-build pipeline.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { expected, sha } = require('../prototype/workbench-patch.cjs');
const root = path.resolve(__dirname, '..');
const version = '1.142.0';
const commit = '6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1';
const archiveSha256 = '099d3514fda308822a150d65ea36d4c4bfc565ee1b7fbc5a3fff97700f7af408';
const url = `https://update.code.visualstudio.com/${version}/darwin-arm64/stable`;
const cached = path.join(root, '.prototype-runtime/base-editor/Visual Studio Code.app');
const installed = '/Applications/Visual Studio Code.app';

function validateEditor(app) {
  const base = path.join(app, 'Contents/Resources/app');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
  const product = JSON.parse(fs.readFileSync(path.join(base, 'product.json'), 'utf8'));
  if (manifest.version !== version || product.commit !== commit ||
      sha(fs.readFileSync(path.join(base, 'out/vs/workbench/workbench.desktop.main.js'), 'utf8')) !== expected) {
    throw Error(`Unsupported editor at ${app}. Required: VS Code ${version}, commit ${commit}.`);
  }
  return app;
}

function resolveEditor({ override = process.env.DIFFDEX_EDITOR_APP, candidates = [cached, installed] } = {}) {
  if (override) return validateEditor(path.resolve(override));
  for (const app of candidates) {
    try { return validateEditor(app); } catch { /* Try the next known location. */ }
  }
  throw Error('Pinned editor not found. Run npm run setup:mac to download and verify it.');
}

async function verifyArchive(file, expectedHash = archiveSha256) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expectedHash) throw Error('Editor archive SHA-256 mismatch; refusing to extract.');
}

async function setup({ download = false } = {}) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('This build supports Apple Silicon macOS only.');
  if (process.env.DIFFDEX_EDITOR_APP) return resolveEditor();
  if (!download) {
    try { return resolveEditor(); } catch { /* Fetch an isolated copy below. */ }
  }
  if (fs.existsSync(path.dirname(cached))) {
    throw Error(`Editor cache already exists: ${path.dirname(cached)}. Move it aside before downloading again.`);
  }
  const runtime = path.join(root, '.prototype-runtime');
  fs.mkdirSync(runtime, { recursive: true });
  const staging = fs.mkdtempSync(path.join(runtime, 'editor-download-'));
  const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
  try {
    const archive = path.join(staging, 'editor.zip');
    console.log(`Downloading VS Code ${version} from Microsoft for a personal local build.\nIts product license applies: https://code.visualstudio.com/license`);
    run('/usr/bin/curl', ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--retry', '2', '--connect-timeout', '30', '--max-time', '1200', '--output', archive, url]);
    await verifyArchive(archive);
    const extracted = path.join(staging, 'extracted');
    run('/usr/bin/ditto', ['-x', '-k', archive, extracted]);
    const app = validateEditor(path.join(extracted, 'Visual Studio Code.app'));
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    fs.renameSync(extracted, path.dirname(cached));
    return cached;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) setup({ download: process.argv.includes('--download') })
  .then(app => console.log(`Editor ready: ${app}\nNext: npm run package:mac`))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { setup, resolveEditor, validateEditor, verifyArchive, version, commit, archiveSha256, url };
