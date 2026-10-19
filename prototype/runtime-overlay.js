// Injected only into the disposable workbench bundle by patch-copy.cjs.
function __codexDiffLabAttach(editor) {
  if (editor.__codexDiffLabScheduled) return;
  editor.__codexDiffLabScheduled = true;
  queueMicrotask(() => {
    try {
      if (!editor.changeViewZones || !editor.createDecorationsCollection) return;
      let zoneId, node, decoration, renderedModel, renderedLine;
      function clear() {
        if (zoneId) editor.changeViewZones(accessor => accessor.removeZone(zoneId));
        zoneId = undefined;
        decoration?.clear(); decoration = undefined;
        node?.remove(); node = undefined;
        renderedModel = undefined; renderedLine = undefined;
      }
      function render() {
        const model = editor.getModel();
        // Fixture-only rendering spike; real snapshot integration comes later.
        if (model?.uri.scheme !== 'file' || !model.uri.path.endsWith('/demo/view-zone-demo.js')) { clear(); return; }
        const matches = [];
        for (let n = 1; n <= model.getLineCount(); n++) {
          if (model.getLineContent(n).trim() === 'return `Welcome, ${name}!`;') matches.push(n);
        }
        if (matches.length !== 1) { clear(); return; }
        const line = matches[0];
        if (renderedModel === model && renderedLine === line && zoneId) return;
        clear();
        if (!editor.getDomNode()) return;
        node = document.createElement('div');
        Object.assign(node.style, {
          whiteSpace: 'pre', overflow: 'hidden', boxSizing: 'border-box',
          backgroundColor: 'var(--vscode-diffEditor-removedTextBackground, rgba(255,80,80,.2))',
          color: 'var(--vscode-editor-foreground)', borderLeft: '3px solid #e55'
        });
        node.textContent = '−   const prefix = "Hello";\n−   const punctuation = "!";\n−   return prefix + ", " + name + punctuation;';
        node.setAttribute('aria-label', 'Deleted code preview; not part of the file');
        editor.applyFontInfo(node);
        const style = document.createElement('style');
        style.textContent = '.codex-diff-lab-added { background: var(--vscode-diffEditor-insertedTextBackground, rgba(70,200,100,.2)); }';
        node.appendChild(style);
        const originalText = editor.getModel().getValue();
        editor.changeViewZones(accessor => {
          zoneId = accessor.addZone({ afterLineNumber: line - 1, heightInLines: 3, domNode: node, suppressMouseDown: true });
        });
        decoration = editor.createDecorationsCollection([{
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: { description: 'codex-diff-lab-added', isWholeLine: true, className: 'codex-diff-lab-added' }
        }]);
        renderedModel = model; renderedLine = line;
        console.info('[Codex Diff Lab] zone created', { line, sourceUnchanged: originalText === editor.getModel().getValue() });
      }
      const timers = [setTimeout(render, 100), setTimeout(render, 1000)];
      const listeners = [
        editor.onDidChangeModel(() => { clear(); render(); }), editor.onDidChangeModelContent(() => { clear(); render(); }),
        editor.onDidLayoutChange(render), editor.onDidFocusEditorText(render),
        editor.onDidChangeConfiguration(() => { if (node) editor.applyFontInfo(node); })
      ];
      editor.onDidDispose(() => { timers.forEach(clearTimeout); listeners.forEach(listener => listener.dispose()); node?.remove(); });
      render();
    } catch (error) { console.error('[Codex Diff Lab]', error); }
  });
}
