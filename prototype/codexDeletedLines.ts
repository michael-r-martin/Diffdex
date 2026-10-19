/* Prototype editor-core contribution. Not an extension-host module. */
import { localize } from '../nls.js';
import { ICodeEditor } from './browser/editorBrowser.js';
import { EditorAction, registerEditorAction } from './browser/editorExtensions.js';
import { Range } from './common/core/range.js';
import { ServicesAccessor } from '../platform/instantiation/common/instantiation.js';

const active = new WeakMap<ICodeEditor, () => void>();

class CodexDeletedLinesDemo extends EditorAction {
  constructor() {
    super({
      id: 'codexPrototype.toggleDeletedLines',
      label: localize('codexPrototype.toggleDeletedLines', 'Codex Prototype: Toggle Deleted Rows at Cursor'),
      alias: 'Codex Prototype: Toggle Deleted Rows at Cursor',
      precondition: undefined,
      f1: true,
    });
  }

  run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
    const previous = active.get(editor);
    if (previous) { previous(); return; }
    if (!editor.hasModel()) { return; }
    const line = editor.getPosition()?.lineNumber ?? 1;
    const node = document.createElement('div');
    node.style.backgroundColor = 'var(--vscode-diffEditor-removedTextBackground, rgba(255,80,80,.18))';
    node.style.color = 'var(--vscode-editor-foreground)';
    node.style.whiteSpace = 'pre';
    node.style.overflow = 'hidden';
    node.setAttribute('aria-label', 'Deleted code, display only');
    node.textContent = [
      '−   const prefix = "Hello";',
      '−   const punctuation = "!";',
      '−   return prefix + ", " + name + punctuation;'
    ].join('\n');
    editor.applyFontInfo(node);

    let zoneId: string | undefined;
    editor.changeViewZones(accessor => {
      zoneId = accessor.addZone({
        afterLineNumber: line - 1,
        heightInLines: 3,
        domNode: node,
        suppressMouseDown: true,
      });
    });
    const decorations = editor.createDecorationsCollection([{
      range: new Range(line, 1, line, 1),
      options: { description: 'codex-prototype-added-line', isWholeLine: true, className: 'codex-prototype-added-line' }
    }]);
    const style = document.createElement('style');
    style.textContent = '.codex-prototype-added-line { background: var(--vscode-diffEditor-insertedTextBackground, rgba(80,200,120,.18)); }';
    node.appendChild(style);

    const listeners: { dispose(): void }[] = [];
    const clear = () => {
      active.delete(editor);
      for (const listener of listeners) { listener.dispose(); }
      if (zoneId) { editor.changeViewZones(accessor => accessor.removeZone(zoneId!)); zoneId = undefined; }
      decorations.clear();
      node.remove();
    };
    active.set(editor, clear);
    listeners.push(editor.onDidChangeModel(clear), editor.onDidChangeModelContent(clear), editor.onDidDispose(clear));
    listeners.push(editor.onDidChangeConfiguration(() => editor.applyFontInfo(node)));
  }
}

registerEditorAction(CodexDeletedLinesDemo);
