const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const expected = '74de4ceb93610658c5eb15b64b228d085f25c9c95d6ec8b002f791df7be4614c';
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

function patchWorkbench(source) {
  if (sha(source) !== expected) throw new Error('Unexpected installed version; refusing to patch.');
  const needle = 'this._codeEditorService.addCodeEditor(this)}static{this.dropIntoEditorDecorationOptions=';
  if (source.split(needle).length !== 2) throw new Error('Editor hook is not unique.');
  for (const marker of ['qe.registerCommand("_executeCodeActionProvider"', 'async function HU(s,o,e)', 'm(1,Gt)],$re)', 'var be=ue("commandService")', 'var Nl=ue("undoRedoService")']) {
    if (!source.includes(marker)) throw new Error(`Unknown workbench bridge: ${marker}`);
  }
  const injection = ['runtime-overlay.js', 'review-undo.js'].map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  return source.replace(needle, needle.replace('addCodeEditor(this)}', 'addCodeEditor(this);__codexDiffLabAttach(this)}')) + '\n' + injection + '\n' +
    'function __codexDiffLabCommand(editor, command, args) { return editor.invokeWithinContext(accessor => accessor.get(be).executeCommand(command, args)); }\n' +
    'function __codexDiffLabTokenize(editor, text) { return editor.invokeWithinContext(accessor => HU(accessor.get(Gt), text, editor.getModel().getLanguageId())); }\n' +
    'function __codexDiffLabSetHTML(node, html) { node.innerHTML = $re._ttpTokenizer ? $re._ttpTokenizer.createHTML(html) : html; }\n' +
    'qe.registerCommand("_codexDiff.setChanges", (_accessor, payload) => __codexDiffLabUpdate(payload));\n';
}
module.exports = { patchWorkbench, expected, sha };
