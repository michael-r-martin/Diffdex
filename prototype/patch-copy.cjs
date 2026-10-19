const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, '.prototype-runtime');
const bundle = path.join(runtime, 'Codex Diff Lab.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js');
const expected = '74de4ceb93610658c5eb15b64b228d085f25c9c95d6ec8b002f791df7be4614c';
const source = fs.readFileSync('/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js', 'utf8');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
if (sha(source) !== expected) throw new Error('Unexpected installed version; refusing to patch.');
const currentHash = sha(fs.readFileSync(bundle));
const manifestPath = path.join(runtime, 'patch-manifest.json');
const previousHash = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)).patchedSha256 : undefined;
if (currentHash !== expected && currentHash !== previousHash) throw new Error('Disposable bundle has unknown changes; refusing to overwrite.');
const needle = 'this._codeEditorService.addCodeEditor(this)}static{this.dropIntoEditorDecorationOptions=';
if (source.split(needle).length !== 2) throw new Error('Editor hook is not unique.');
const injection = fs.readFileSync(path.join(__dirname, 'runtime-overlay.js'), 'utf8');
const replacement = needle.replace('addCodeEditor(this)}', 'addCodeEditor(this);__codexDiffLabAttach(this)}');
fs.writeFileSync(bundle, source.replace(needle, replacement) + '\n' + injection);
const settingsDir = path.join(runtime, 'user-data/User');
fs.mkdirSync(settingsDir, { recursive: true });
fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
  'update.mode': 'none', 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false,
  'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none', 'editor.minimap.enabled': false
}, null, 2));
fs.writeFileSync(path.join(runtime, 'patch-manifest.json'), JSON.stringify({
  version: '1.142.0', originalSha256: expected, patchedSha256: sha(fs.readFileSync(bundle)), bundle
}, null, 2));
console.log('Patched disposable copy only:', bundle);
