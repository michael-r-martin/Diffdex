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
if (!source.includes('qe.registerCommand("_executeCodeActionProvider"')) throw new Error('Unknown command registry');
if (!source.includes('async function HU(s,o,e)') || !source.includes('m(1,Gt)],$re)')) throw new Error('Unknown tokenizer bridge');
if (!source.includes('var be=ue("commandService")')) throw new Error('Unknown command service');
if (!source.includes('var Nl=ue("undoRedoService")')) throw new Error('Unknown undo service');
const injection = fs.readFileSync(path.join(__dirname, 'runtime-overlay.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'review-undo.js'), 'utf8');
const uiFontNeedle = 'gt?"-apple-system, BlinkMacSystemFont, sans-serif"';
if (source.split(uiFontNeedle).length !== 2) throw new Error('Unknown UI font default');
const fontSource = source.replace(uiFontNeedle, 'gt?"-apple-system, BlinkMacSystemFont, sans-serif"');
const replacement = needle.replace('addCodeEditor(this)}', 'addCodeEditor(this);__codexDiffLabAttach(this)}');
fs.writeFileSync(bundle, fontSource.replace(needle, replacement) + '\n' + injection + '\nfunction __codexDiffLabCommand(editor, command, args) { return editor.invokeWithinContext(accessor => accessor.get(be).executeCommand(command, args)); }\n' + "\nfunction __codexDiffLabTokenize(editor, text) { return editor.invokeWithinContext(accessor => HU(accessor.get(Gt), text, editor.getModel().getLanguageId())); }\nfunction __codexDiffLabSetHTML(node, html) { node.innerHTML = $re._ttpTokenizer ? $re._ttpTokenizer.createHTML(html) : html; }\n" + "\nqe.registerCommand('_codexDiff.setChanges', (_accessor, payload) => __codexDiffLabUpdate(payload));\n");
const settingsDir = path.join(runtime, 'user-data/User');
fs.mkdirSync(settingsDir, { recursive: true });
fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
  'editor.fontFamily': '"SF Mono", Menlo, monospace', 'terminal.integrated.fontFamily': '"SF Mono", Menlo, monospace',
  'debug.console.fontFamily': '"SF Mono", Menlo, monospace', 'markdown.preview.fontFamily': '"SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif',
  'update.mode': 'none', 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false,
  'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none', 'editor.minimap.enabled': false, 'workbench.colorTheme': 'Dark Modern'
}, null, 2));
fs.writeFileSync(path.join(runtime, 'patch-manifest.json'), JSON.stringify({
  version: '1.142.0', originalSha256: expected, patchedSha256: sha(fs.readFileSync(bundle)), bundle
}, null, 2));
console.log('Patched disposable copy only:', bundle);
