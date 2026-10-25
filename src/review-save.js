const { traceWrite, fingerprint } = require('./write-diagnostics');
// Only review decisions request saves. Ordinary typing and its undo stay under
// the editor's normal save settings. The workbench command skips save participants
// so formatting cannot create an extra undo step inside a review decision.
function createReviewSaver(vscode, log, onSaved = () => {}) {
  const pending = new Map();
  const timers = new Map();
  let disposed = false;
  async function save(document, expectedDisk, source = 'review.save', version = document.version) {
    const key = document.uri.toString();
    const previous = pending.get(key) || Promise.resolve();
    const task = previous.then(async () => {
      if (disposed || document.isClosed) return false;
      if (document.version !== version) {
        traceWrite(log,source,'blocked-version-changed',document,{expectedVersion:version});
        return false;
      }
      try {
        traceWrite(log,source,'save-request',document,{expectedVersion:version,expectedDiskHash:fingerprint(expectedDisk)});
        const saved = await vscode.commands.executeCommand('_codexDiff.saveReviewFile', { uri: key, expectedDisk, expectedVersion: version, source });
        if (!saved || document.isDirty || document.version !== version) throw new Error('The editor could not save the file.');
        traceWrite(log,source,'save-complete',document);
        await onSaved(document);
        return true;
      } catch (error) {
        traceWrite(log,source,'save-failed',document,{error:error.message});
        log.appendLine(`Review save for ${document.uri.fsPath}: ${error.message}`);
        vscode.window.showErrorMessage(`Diffdex applied the review decision but could not save ${document.uri.fsPath}: ${error.message} Save the file manually or retry. Undo is still available.`);
        return false;
      }
    });
    pending.set(key, task);
    try { return await task; }
    finally { if (pending.get(key) === task) pending.delete(key); }
  }
  function afterUndoRedo(document, expectedDisk) {
    const key = document.uri.toString(), version = document.version;
    clearTimeout(timers.get(key));
    // Defer until the native undo operation has released the model's undo stack.
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      if (!disposed && !document.isClosed && document.version === version) void save(document, expectedDisk, 'review.undoRedo');
    }, 0));
  }
  return { save, afterUndoRedo, dispose() {
    disposed = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  } };
}

module.exports = { createReviewSaver };
