// The pinned native attachment command focuses the sidebar before dispatching,
// which can switch away from the user's active editor-panel chat. Keep that
// destination intact; otherwise use the native sidebar startup/queueing path.
const original = 'async function B6e(t,e,r){let n=e.fsPath,i={label:N6e.basename(n),path:n,fsPath:n},s=r?{...i,startLine:r.startLine,endLine:r.endLine}:i;await Ru(),t.addContextFile(s)}';
const marker = '/* diffdex-file-context-v1 */';
const replacement = original.replace('await Ru(),t.addContextFile(s)', `${marker}if(t.focusedView?.kind==="panel"&&t.isPanelAlive(t.focusedView.panel)){let o=t.focusedView.panel;t.addContextFile(s);o.reveal(o.viewColumn);return}await Ru(),t.addContextFile(s)`);

function patchFileContext(source) {
  const clean = source.replace(replacement, original);
  if (clean.split(original).length !== 2) throw new Error('Unsupported Codex build: file context command');
  return clean.replace(original, replacement);
}

module.exports = { patchFileContext, marker, originalFileContext: original };
