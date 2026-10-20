// Registered inside the pinned workbench bundle: native resource undo history.
qe.registerCommand('_codexDiff.pushReviewUndo', (accessor, payload) => {
  const state=__codexDiffLabGetState();
  const editor=[...state.editors].map(entry=>entry.editor).find(editor=>editor.getModel()?.uri.toString()===payload?.uri);
  const model=editor?.getModel();
  if (!model || model.getValue()!==payload.before.text) return false;
  const commands=accessor.get(be);
  model.pushStackElement();
  accessor.get(Nl).pushElement({
    type:0, resource:model.uri, label:'Accept Codex diff block', code:'codexDiff.accept',
    undo:()=>commands.executeCommand('codexDiff.restoreReview',payload.before),
    redo:()=>commands.executeCommand('codexDiff.restoreReview',payload.after)
  });
  return true;
});
