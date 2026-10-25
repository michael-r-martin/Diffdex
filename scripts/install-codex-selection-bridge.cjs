// Private, version-pinned adapter for the disposable prototype's Codex extension.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const { patchFileContext }=require('./codex-file-context.cjs');
const root=path.resolve(__dirname,'..');
const base=path.join(root,'.prototype-runtime/extensions/openai.chatgpt-26.1007.21434-darwin-arm64');
const oldHost='case"codex-diff-active-chat":{void je.commands.executeCommand("codexDiff.followChat",{id:r.id}).then(()=>{},()=>{});break}';
const hostNeedle='case"view-focused":{this.setFocusedViewForWebview(e);break}';
const hostReplacement='case"codex-diff-active-chat":{void je.commands.executeCommand("codexDiff.followChat",{id:r.id}).then(()=>{},error=>console.error("Codex Diffs selection bridge:",error));break}'+hostNeedle;
const oldClient='a=i?Qd(i):null,e[0]=i,e[1]=a),__diffLabSelection(a),a}var pPn;';
const originalClient='a=i?Qd(i):null,e[0]=i,e[1]=a),a}var pPn;';
// This component subscribes to dv, which resolves temporary UI IDs to saved thread IDs.
const clientNeedle='e[8]=x,e[9]=T):T=e[9];let E=y?.params.taskId';
const clientReplacement='e[8]=x,e[9]=T):T=e[9];__diffLabSelection(T);let E=y?.params.taskId';
const marker='/* codex-diff-selection-bridge-v2 */';
const addition='\n'+marker+'\n'+fs.readFileSync(path.join(__dirname,'codex-selection-client.js'),'utf8');
const edits=[['out/extension.js',hostNeedle,hostReplacement],['webview/assets/app-initial-c014f9ee4429.js',clientNeedle,clientReplacement]];
const planned=edits.map(([relative,needle,replacement])=>{
  const file=path.join(base,relative),source=fs.readFileSync(file,'utf8');
  let clean=source;
  if(relative.startsWith('webview/')){
    clean=clean.replace(oldClient,originalClient);
    for(const version of ['v1','v2']){
      const at=clean.indexOf('/* codex-diff-selection-bridge-'+version+' */');
      if(at>=0)clean=clean.slice(0,at).trimEnd();
    }
    clean=clean.replace(clientReplacement,clientNeedle);
  }else clean=clean.replace(oldHost,'').replace(hostReplacement,hostNeedle);
  if(clean.split(needle).length!==2)throw Error(`Unsupported Codex build: ${relative}`);
  let result=clean.replace(needle,replacement)+(relative.startsWith('webview/')?addition:'');
  if(relative==='out/extension.js')result=patchFileContext(result);
  return result===source?null:{file,source,result};
});
for(const entry of planned.filter(Boolean)){
  const hash=crypto.createHash('sha256').update(entry.source).digest('hex');
  const backup=path.join(root,'.prototype-runtime/codex-selection-backup',hash);
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  if(!fs.existsSync(backup))fs.writeFileSync(backup,entry.source);
  fs.writeFileSync(entry.file,entry.result);
  console.log('Installed selection adapter:',entry.file);
}
