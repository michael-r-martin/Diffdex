const fs = require('node:fs');
const { createHash } = require('node:crypto');
const fingerprint = text => typeof text === 'string' ? createHash('sha256').update(text).digest('hex') : null;
function readDisk(document) {
  try { return fs.readFileSync(document.uri.fsPath, 'utf8'); }
  catch { return null; } // Missing/unreadable files must never authorize a write.
}
function traceWrite(log, source, phase, document, details = {}) {
  log.appendLine(`[write] ${JSON.stringify({ time: new Date().toISOString(), source, phase,
    uri: document.uri.toString(), version: document.version, dirty: document.isDirty,
    bufferHash: fingerprint(document.getText?.()), diskHash: fingerprint(readDisk(document)), ...details })}`);
}
module.exports = { readDisk, traceWrite, fingerprint };
