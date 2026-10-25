function registerChatContext(vscode, context) {
  context.subscriptions.push(vscode.commands.registerCommand('codexDiff.addFileToChat', async (resource, selection) => {
    const files = Array.isArray(selection) && selection.some(uri => uri.toString() === resource?.toString())
      ? selection : [resource];
    try {
      const extension = vscode.extensions.getExtension('openai.chatgpt');
      if (!extension) throw new Error('The Codex extension is not installed.');
      await extension.activate();
      const seen = new Set();
      let attached = 0;
      for (const uri of files) {
        if (uri?.scheme !== 'file' || seen.has(uri.toString())) continue;
        seen.add(uri.toString());
        const stat = await vscode.workspace.fs.stat(uri);
        if (!(stat.type & vscode.FileType.File)) continue;
        await vscode.commands.executeCommand('chatgpt.addFileToThread', uri);
        attached++;
      }
      return attached > 0;
    } catch (error) {
      vscode.window.showErrorMessage(`Diffdex could not add the file to Codex: ${error.message}`);
      return false;
    }
  }));
}

module.exports = { registerChatContext };
