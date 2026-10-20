const vscode = require('vscode');
const { randomBytes } = require('node:crypto');

class ReviewSidebar {
  constructor(context, action) { this.context=context; this.action=action; this.state={files:[]}; }
  update(state) {
    const signature=JSON.stringify(state);
    if(signature===this.signature) return;
    this.signature=signature;this.state=state;
    this.view?.webview.postMessage(state);
  }
  resolveWebviewView(view) {
    this.view=view;
    const webview=view.webview;
    webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(this.context.extensionUri,'media')]};
    const nonce=randomBytes(18).toString('hex');
    const resource=name=>webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media',name));
    webview.html=`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${resource('sidebar.css')}"></head><body><header><button id="chat">Choose chat</button><p id="summary"></p><div><button id="accept">Accept all</button><button id="reject">Reject all</button></div><p id="notice" role="status"></p></header><main id="files"></main><script nonce="${nonce}" src="${resource('sidebar.js')}"></script></body></html>`;
    this.context.subscriptions.push(webview.onDidReceiveMessage(async message=>{
      if(message?.type==='ready') { await webview.postMessage(this.state);return; }
      try { await this.action(message); }
      catch(error) { vscode.window.showErrorMessage(`Codex review: ${error.message}`); }
      finally { webview.postMessage({...this.state,done:true}); }
    }));
  }
}
module.exports={ReviewSidebar};
