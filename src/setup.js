const fs = require('node:fs');
const path = require('node:path');
const { mergedConfig } = require('../scripts/install-hooks.cjs');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

function captureCommand(extensionPath, store, executable = process.execPath, electron = !!process.versions.electron) {
  return `${electron ? '/usr/bin/env ELECTRON_RUN_AS_NODE=1 ' : ''}${quote(executable)} ${quote(path.join(extensionPath, 'hooks/capture.cjs'))} ${quote(store)}`;
}

function installProjectHooks(project, command) {
  const destination = path.join(project, '.codex/hooks.json');
  const previous = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : null;
  const existing = previous === null ? {} : JSON.parse(previous);
  const text = JSON.stringify(mergedConfig(existing, command), null, 2) + '\n';
  if (previous === text) return destination;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (previous !== null) fs.copyFileSync(destination, `${destination}.${Date.now()}.bak`);
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return destination;
}

module.exports = { captureCommand, installProjectHooks };
