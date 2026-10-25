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

qe.registerCommand('_codexDiff.saveReviewFile', async (accessor, payload) => {
  const state=__codexDiffLabGetState();
  const model=[...state.editors].map(entry=>entry.editor.getModel()).find(model=>model?.uri.toString()===payload?.uri);
  if (!model || model.uri.scheme!=='file') return false;
  const files=accessor.get(wn);
  const trace=(phase,details={})=>console.info('[Diffdex write] '+JSON.stringify({
    time:new Date().toISOString(),source:payload.source||'review.bridge',phase,uri:payload.uri,
    version:model.getVersionId(),expectedVersion:payload.expectedVersion,...details
  }));
  trace('save-check');
  if (typeof payload.expectedDisk!=='string' || model.getVersionId()!==payload.expectedVersion) {
    trace('blocked-version-or-baseline');
    return false;
  }
  const disk=await files.read(model.uri,{acceptTextOnly:true,limits:{size:1024*1024}});
  // Native conflict checks alone are insufficient: the editor's cached stat may
  // already describe the external write while its buffer is still stale.
  if ((disk.value!==payload.expectedDisk && disk.value!==model.getValue()) || model.getVersionId()!==payload.expectedVersion) {
    trace('blocked-disk-or-version-changed',{diskMatches:disk.value===payload.expectedDisk});
    return false;
  }
  // An already-identical disk/buffer is safe too (e.g. the user saved manually).
  files.files.get(model.uri)?.updateLastResolvedFileStat(disk);
  // The native save retains its etag/mtime check for writes after our disk read.
  trace('save-start');
  const saved=!!await files.save(model.uri,{reason:1,skipSaveParticipants:true});
  trace('save-finish',{saved});
  return saved;
});
