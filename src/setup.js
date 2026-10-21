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
  if (previous === text) return { file: destination, changed: false };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (previous !== null) fs.copyFileSync(destination, `${destination}.${Date.now()}.bak`);
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return { file: destination, changed: true };
}

function registerCaptureSetup(vscode, context, { packaged, captureStore, log }) {
  const local = folder => folder.uri.scheme === 'file' && !vscode.env.remoteName;
  const install = folder => {
    const executable = packaged ? path.resolve(vscode.env.appRoot, '../../MacOS/Diffdex') : process.execPath;
    return installProjectHooks(folder.uri.fsPath, captureCommand(context.extensionPath, captureStore(), executable));
  };
  async function showInstalled(files) {
    const action = await vscode.window.showInformationMessage(
      `Diffdex capture hooks installed for ${files.length === 1 ? 'this project' : `${files.length} projects`}. Run /hooks in Codex to review and trust them, then reload your session or start a new chat.`, 'View hooks');
    if (action === 'View hooks') for (const file of files) await vscode.window.showTextDocument(vscode.Uri.file(file));
  }
  function reportError(folder, error) {
    log.appendLine(`Capture setup for ${folder.uri.fsPath}: ${error.message}`);
    vscode.window.showErrorMessage(`Diffdex could not set up capture for ${folder.name || folder.uri.fsPath}: ${error.message}. Retry with Diffdex: Enable Change Capture for Project.`);
  }
  async function ensureCapture(folders = vscode.workspace.workspaceFolders || []) {
    if (!packaged || !vscode.workspace.isTrusted) return;
    const installed = [];
    for (const folder of folders.filter(local)) {
      try {
        const result = install(folder);
        if (result.changed) installed.push(result.file);
      } catch (error) { reportError(folder, error); }
    }
    if (installed.length) await showInstalled(installed);
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('codexDiff.enableCapture', async () => {
      if (!vscode.workspace.isTrusted) {
        vscode.window.showInformationMessage('Trust this workspace in Diffdex before enabling change capture.');
        return;
      }
      const folders = (vscode.workspace.workspaceFolders || []).filter(local);
      if (!folders.length) {
        vscode.window.showInformationMessage('Open a local project folder, then run Diffdex: Enable Change Capture for Project.');
        return;
      }
      const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Choose the project to capture' });
      if (!folder || !local(folder)) return;
      try { await showInstalled([install(folder).file]); }
      catch (error) { reportError(folder, error); }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(event => ensureCapture(event.added)),
    vscode.workspace.onDidGrantWorkspaceTrust(() => ensureCapture())
  );
  return ensureCapture();
}

module.exports = { captureCommand, installProjectHooks, registerCaptureSetup };
