const vscode = require('vscode');
const { hunks } = require('./diff');

function activate(context) {
  const snapshots = new Map();
  const changed = new vscode.EventEmitter();
  let experiment = false;
  const originalUri = uri => uri.with({ scheme: 'codex-before' });
  const sourceUri = uri => uri.with({ scheme: 'file' });
  const added = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground')
  });
  const removed = vscode.window.createTextEditorDecorationType({
    before: { color: new vscode.ThemeColor('editorError.foreground'), backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground') },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  const scm = vscode.scm.createSourceControl('codexDiffPrototype', 'Codex Diff Prototype');
  scm.inputBox.visible = false;
  scm.quickDiffProvider = {
    label: 'Codex snapshot',
    provideOriginalResource: uri => snapshots.has(uri.toString()) ? originalUri(uri) : undefined
  };
  const group = scm.createResourceGroup('changes', 'Snapshot comparisons');
  const lenses = new vscode.EventEmitter();
  function refresh() {
    group.resourceStates = [...snapshots.keys()].map(key => ({ resourceUri: vscode.Uri.parse(key) }));
    for (const editor of vscode.window.visibleTextEditors) {
      const before = snapshots.get(editor.document.uri.toString());
      const changes = before === undefined ? [] : hunks(before, editor.document.getText()) || [];
      const greens = [], reds = [];
      for (const h of changes) {
        for (let line = h.start; line < h.start + h.added.length; line++) {
          if (line < editor.document.lineCount) greens.push(editor.document.lineAt(line).range);
        }
        if (h.removed.length) {
          const line = Math.min(h.start, editor.document.lineCount - 1);
          const hover = new vscode.MarkdownString('Deleted from the snapshot:\n\n');
          hover.appendCodeblock(h.removed.join('\n'), editor.document.languageId);
          reds.push({
            range: new vscode.Range(line, 0, line, Math.min(1, editor.document.lineAt(line).text.length)),
            hoverMessage: hover,
            renderOptions: { before: { contentText: experiment
              ? h.removed.map(text => `− ${text}`).join('\n') + '\n'
              : `− ${h.removed.length} deleted line(s)  ` } }
          });
        }
      }
      editor.setDecorations(added, greens);
      editor.setDecorations(removed, reds);
    }
    lenses.fire();
  }
  function capture(document, text = document.getText()) {
    snapshots.set(document.uri.toString(), text);
    changed.fire(originalUri(document.uri));
    refresh();
  }
  context.subscriptions.push(added, removed, scm, changed, lenses,
    vscode.workspace.registerTextDocumentContentProvider('codex-before', {
      onDidChange: changed.event,
      provideTextDocumentContent: uri => snapshots.get(sourceUri(uri).toString()) ?? ''
    }),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, {
      onDidChangeCodeLenses: lenses.event,
      provideCodeLenses(document) {
        if (!snapshots.has(document.uri.toString())) return [];
        return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: experiment ? 'Multiline attachment ON — inspect deleted text layout' : 'Try multiline deleted-text attachment',
          command: 'codexDiff.toggle'
        })];
      }
    }),
    vscode.workspace.onDidChangeTextDocument(refresh),
    vscode.window.onDidChangeVisibleTextEditors(refresh),
    vscode.commands.registerCommand('codexDiff.capture', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.uri.scheme === 'file') capture(editor.document);
    }),
    vscode.commands.registerCommand('codexDiff.toggle', () => { experiment = !experiment; refresh(); }),
    vscode.commands.registerCommand('codexDiff.clear', () => {
      const keys = [...snapshots.keys()]; snapshots.clear();
      keys.forEach(key => changed.fire(originalUri(vscode.Uri.parse(key)))); refresh();
    }),
    vscode.commands.registerCommand('codexDiff.demo', async () => {
      // Unique disposable fixture, never modifies a user's existing file.
      await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      const uri = vscode.Uri.joinPath(context.globalStorageUri, `rendering-demo-${Date.now()}.js`);
      const before = '// Rendering experiment: this is a real, editable file.\nfunction greet(name) {\n  const prefix = "Hello";\n  const punctuation = "!";\n  return prefix + ", " + name + punctuation;\n}\n\nconsole.log(greet("world"));\n';
      const after = '// Rendering experiment: this is a real, editable file.\nfunction greet(name) {\n  return `Welcome, ${name}!`;\n}\n\nconsole.log(greet("world"));\n';
      await vscode.workspace.fs.writeFile(uri, Buffer.from(after));
      const doc = await vscode.workspace.openTextDocument(uri);
      capture(doc, before);
      await vscode.window.showTextDocument(doc);
      refresh();
      vscode.window.showInformationMessage('Click the changed gutter to expand deleted lines. Click the CodeLens to test multiline attachments.');
    })
  );
}
module.exports = { activate };
