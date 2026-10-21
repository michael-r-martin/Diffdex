const { projectReview } = require('./project-review');
const { planRejection, advanceReview } = require('./review-actions');
const { chatPickerItems } = require('./chat-picker');
const { chatNavigationItems } = require('./chat-navigation');
const { registerCaptureSetup } = require('./setup');
const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { Review } = require('./review');
const { mergeText } = require('./merge');
const { listSessions } = require('./store');
const { ReviewSidebar } = require('./sidebar');
const { reconcileReview, reconcileLatestReview, combineDocuments } = require('./combined');
const { createTitleReader } = require('./chat-titles');
function activate(context) {
  const packaged = fs.existsSync(path.join(context.extensionPath, 'diffdex.json'));
  const captureStore = () => vscode.workspace.getConfiguration('codexDiff').get('storePath') || (packaged
    ? path.join(context.globalStorageUri.fsPath, 'captures')
    : path.join(context.extensionPath, '.prototype-runtime/captures'));
  const readTitles=createTitleReader();
  const log = vscode.window.createOutputChannel('Codex Diffs');
  registerCaptureSetup(vscode, context, { packaged, captureStore, log });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'codexDiff.selectChat'; status.show();
  const treeChanged = new vscode.EventEmitter();
  let sessions = [], selected = context.workspaceState.get('selectedChat'), lastTree, busy = false, pending = false, disposed = false;
  let bridgeWarning = false;
  const reviews = new Map((context.workspaceState.get('reviewRegions') || []).map(([key,data]) => {
    const review=Object.assign(new Review('',''),data);
    review.remember();
    return [key,review];
  }));
  let saveTimer;
  const incoming = new Map(context.workspaceState.get('pendingIncoming') || []);
  const migration = !context.workspaceState.get('incomingSyncVersion');
  const migrationChecked = new Set();
  let sidebarActionBusy=false;
  let changedFiles=[];
  let inlineDocuments=[];
  let navigationDocuments=[];
  let navigationChats=[];
  let followedChatId;
  const sidebar=new ReviewSidebar(context, async message=>{
    if(message?.type==='resolve') return vscode.commands.executeCommand('codexDiff.resolveFile',message);
    if(message?.type==='chat') return vscode.commands.executeCommand('codexDiff.selectChat');
    return vscode.commands.executeCommand('codexDiff.sidebarAction',message);
  });
  async function replaceBuffer(doc,text) {
    const current=doc.getText();
    if (current===text) return true;
    let start=0,end=current.length,nextEnd=text.length;
    while(start<end&&start<nextEnd&&current[start]===text[start]) start++;
    while(end>start&&nextEnd>start&&current[end-1]===text[nextEnd-1]) {end--;nextEnd--;}
    const edit=new vscode.WorkspaceEdit();
    edit.replace(doc.uri,new vscode.Range(doc.positionAt(start),doc.positionAt(end)),text.slice(start,nextEnd));
    return vscode.workspace.applyEdit(edit);
  }
  function queueIncoming(key,file,signature) {
    if (incoming.get(key)?.signature===signature) return;
    incoming.set(key,{file,signature});
    saveReviews();
    vscode.window.showWarningMessage(`New Codex changes overlap unsaved edits in ${path.basename(file.path)}. Your editor version has been preserved.`, 'Review incoming').then(choice=>{
      if(choice) vscode.commands.executeCommand('codexDiff.resolveIncoming',key);
    });
  }

  const reviewVersion = review => createHash('sha256').update(JSON.stringify(review.regions)).digest('hex');
  async function saveReviews() {
    await context.workspaceState.update('reviewRegions',[...reviews].map(([key,r])=>[key,{text:r.text,regions:r.regions,rejections:r.rejections,supported:r.supported,signature:r.signature,uri:r.uri}]));
    await context.workspaceState.update('pendingIncoming',[...incoming]);
  }
  const tree = {
    onDidChangeTreeData: treeChanged.event,
    getTreeItem: element => element,
    getChildren() {
      const session = sessions.find(s => s.key === selected);
      return (session?.files || []).map(file => {
        const item = new vscode.TreeItem(path.relative(session.cwd, file.path));
        item.resourceUri = vscode.Uri.file(file.path);
        item.iconPath = vscode.ThemeIcon.File;
        item.tooltip = file.path;
        item.description = !file.after.exists ? 'deleted' : !file.before.exists ? 'added' : 'modified';
        item.command = { command: 'codexDiff.openFile', title: 'Open changed file', arguments: [file] };
        return item;
      });
    }
  };
  async function refresh() {
    if (disposed) return;
    if (busy) { pending = true; return; }
    busy = true;
    try {
      const store = captureStore();
      const roots = (vscode.workspace.workspaceFolders || []).map(f => { try { return fs.realpathSync(f.uri.fsPath); } catch { return f.uri.fsPath; } });
      sessions = packaged && !roots.length ? [] : listSessions(store, roots);
      const titles=readTitles();
      sessions=sessions.map(s=>({...s,title:titles.get(s.sessionId)||'Untitled chat'}));
      if(followedChatId!==undefined)selected=sessions.find(s=>s.sessionId===followedChatId)?.key;
      else if (!sessions.some(s => s.key === selected)) selected = sessions[0]?.key;
      const session = sessions.find(s => s.key === selected);
      let unsupported = 0;
      const documents = [];
      const warnings=[];
      const allDocuments=[];
      let reconciled=false;
      const reconcile=(review,current,isLatest=false)=>{
        const previous=review.text;
        if((isLatest?reconcileLatestReview(review,current):reconcileReview(review,current))&&previous!==review.text)reconciled=true;
      };
      const newest=new Map();
      for(const chat of sessions)for(const file of chat.files)if(!newest.has(file.path)||newest.get(file.path).file.updatedAt<file.updatedAt)newest.set(file.path,{chat,file});
      for(const chat of sessions) {
      const documentsForChat=[], warningsForChat=[];
      for (const file of chat.files) {
        const warnings=warningsForChat;
        const session=chat;
        if (!file.after.exists) { warnings.push({name:path.relative(session.cwd,file.path),warning:'Deleted file: restoration is not supported by this prototype yet.',after:'',hunks:[{start:0,removed:file.before.text.split('\n'),added:[]}]});continue; }
        const uri = vscode.Uri.file(file.path).toString();
        const open = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri);
        let current;
        try { current=open ? open.getText() : fs.readFileSync(file.path,'utf8'); }
        catch { warnings.push({name:path.relative(session.cwd,file.path),warning:'File is unavailable on disk.',hunks:[]});continue; }
        const key = `${chat.key}:${uri}`;
        const isLatest=newest.get(file.path).chat.key===chat.key;
        const signature = JSON.stringify([file.before.text,file.after.text]);
        let review = reviews.get(key);
        const migrate=migration&&!migrationChecked.has(key)&&open?.isDirty&&current!==file.after.text;
        migrationChecked.add(key);
        if (isLatest && open && current!==file.after.text && (migrate || !review || review.signature!==signature)) {
          const base=review?.signature ? JSON.parse(review.signature)[1] : null;
          const merged=base===null||migrate ? {conflict:true} : mergeText(base,current,file.after.text);
          if (merged.conflict) {
            queueIncoming(key,file,signature);
          } else {
            if (open.getText()!==current || !await replaceBuffer(open,merged.text)) { queueIncoming(key,file,signature); }
            else current=open.getText();
          }
        }
        if (incoming.has(key) && current===file.after.text) incoming.delete(key);
        if ((!review || review.signature !== signature) && !incoming.has(key)) {
          review = review ? (advanceReview(review,file.after.text)||new Review(file.before.text,file.after.text)) : new Review(file.before.text,file.after.text);
          review.signature = signature; review.uri = uri;
          if (current !== review.text) reconcile(review,current,isLatest);
          reviews.set(key,review);
        }
        // Reconcile resolved state for every capture. Latest pending regions
        // track current edits; older chats must still pass conservative checks.
        if(review&&!incoming.has(key)&&review.text!==current)reconcile(review,current,isLatest);
        if (!review) { warnings.push({name:path.relative(session.cwd,file.path),warning:'Incoming edits need resolving before review.',reviewKey:key,resolution:'incoming',hunks:[]});continue; }
        const changes = review.getHunks();
        if (changes === null) { unsupported++; warnings.push({name:path.relative(session.cwd,file.path),warning:'File exceeds the prototype diff limit.',hunks:[]});continue; }
        documentsForChat.push({ uri, chat:chat.title, updatedAt:file.updatedAt, name:path.relative(session.cwd,file.path), reviewKey:key, reviewVersion:reviewVersion(review), after: review.text, current, detached:review.text!==current, hunks: changes, ...(incoming.has(key)?{warning:'Incoming Codex edits conflict with your editor contents. Choose which version to keep.',resolution:'incoming'}:{}) });
      }
      chat.reviewSummary={files:documentsForChat.filter(d=>!d.warning&&d.hunks.length).length,warnings:warningsForChat.length+documentsForChat.filter(d=>d.warning).length};
      allDocuments.push(...documentsForChat);
      if(chat.key===selected){documents.push(...documentsForChat);warnings.push(...warningsForChat);}
      }
      if(reconciled)await saveReviews();
      sidebar.update({selection:selected,chat:session?.title||(followedChatId?titles.get(followedChatId)||'Untitled chat':undefined),files:[...documents,...warnings]});
      await context.workspaceState.update('incomingSyncVersion',1);
      const projected=allDocuments.map(d=>projectReview({...d,selected:d.reviewKey.startsWith(`${selected}:`)},d.current)).filter(Boolean);
      const editorDocuments=combineDocuments(projected);
      inlineDocuments=editorDocuments;
      navigationDocuments=combineDocuments(documents.map(d=>projectReview(d,d.current)).filter(Boolean));
      navigationChats=chatNavigationItems(sessions,projected);
      changedFiles=navigationChats.find(chat=>chat.key===selected)?.files||[];
      const otherChats=navigationChats.filter(chat=>chat.key!==selected);
      const payload = { documents:editorDocuments, changedFiles, navigationDocuments, otherChats };
      // Content events update the diff immediately; polling discovers hook captures.
      const results = await vscode.commands.executeCommand('_codexDiff.setChanges', payload);
      if (process.env.CODEX_DIFF_DIAGNOSTICS) fs.writeFileSync(path.join(context.extensionPath, '.prototype-runtime/render-status.json'), JSON.stringify({ languages: await vscode.languages.getLanguages(), extensions: vscode.extensions.all.map(e => e.id), theme: vscode.workspace.getConfiguration('workbench').get('colorTheme'), results }, null, 2));
      const stale = (results || []).filter(r => r.status === 'stale').length;
      status.text = session ? `$(diff) ${session.title} · ${changedFiles.length} pending files${stale ? ' · file changed since capture' : ''}` : '$(diff) Codex: waiting for hooks';
      if (incoming.size) {
        status.text=`$(warning) Codex: ${incoming.size} incoming conflict${incoming.size===1?'':'s'}`;
        status.command='codexDiff.resolveIncoming';
      } else status.command='codexDiff.selectChat';
      status.tooltip = incoming.size ? 'New Codex edits conflict with your unsaved buffer. Click to review.' : session ? `Reviewing ${session.title}\nClick to switch chats.${unsupported ? '\nSome files exceed the prototype diff limit.' : ''}` : 'No captured edits yet. Review and trust the installed Codex hooks.';
      const treeSignature = JSON.stringify([selected, session?.files]);
      if (treeSignature !== lastTree) { lastTree = treeSignature; treeChanged.fire(); }
      bridgeWarning = false;
      return { incoming: [...incoming.keys()], sessions: sessions.length, selected, documents: documents.length, changes: documents.map(d=>({uri:d.uri,reviewKey:d.reviewKey,reviewVersion:d.reviewVersion,hunks:d.hunks})), editorDocuments, changedFiles, results };
    } catch (error) {
      status.text = '$(warning) Codex Diffs: bridge unavailable';
      if (!bridgeWarning) { log.appendLine(String(error)); bridgeWarning = true; }
    } finally {
      busy = false;
      if (pending && !disposed) { pending = false; queueMicrotask(refresh); }
    }
  }
  context.subscriptions.push(log, status, treeChanged,
    vscode.commands.registerCommand('codexDiff.followChat',async request=>{
      if(request?.id!==null&&(typeof request?.id!=='string'||!request.id.length||request.id.length>200))return false;
      followedChatId=request.id;
      log.appendLine(`[follow] ${new Date().toISOString()} Codex selected ${request.id ?? '(new chat)'}`);
      await refresh();
      log.appendLine(`[follow] selected capture=${selected ?? '(none)'}; changed files=${changedFiles.length}`);
      return true;
    }),
    vscode.commands.registerCommand('codexDiff.reviewFile',async request=>{
      if(sidebarActionBusy||!['accept','reject'].includes(request?.action))return false;
      const item=navigationDocuments.find(d=>d.uri===request.uri);
      const doc=vscode.workspace.textDocuments.find(d=>d.uri.toString()===request.uri);
      const stamp=d=>JSON.stringify(d.hunks.map(h=>[h.reviewKey,h.reviewVersion,h.block]));
      if(!item||!doc||!item.hunks.length||doc.getText()!==request.expected||item.after!==request.expected||stamp(item)!==request.stamp)return false;
      const blocks=[...item.hunks].sort((a,b)=>b.start-a.start||b.block-a.block);
      const originals=new Map();
      for(const h of blocks){
        const r=reviews.get(h.reviewKey);
        if(!r||reviewVersion(r)!==h.reviewVersion||incoming.has(h.reviewKey))return false;
        originals.set(h.reviewKey,{review:r,signature:r.signature});
      }
      sidebarActionBusy=true;
      try{
        for(const h of blocks){
          const {review,signature}=originals.get(h.reviewKey);
          if(reviews.get(h.reviewKey)!==review||review.signature!==signature||incoming.has(h.reviewKey))throw new Error('New changes arrived; remaining blocks were left pending.');
          if(!await vscode.commands.executeCommand('codexDiff.reviewBlock',{action:request.action,reviewKey:h.reviewKey,reviewVersion:reviewVersion(review),expected:review.text,current:doc.getText(),block:h.block}))throw new Error('The file changed; remaining blocks were left pending.');
        }
        return true;
      }catch(error){vscode.window.showWarningMessage(error.message);return false;}
      finally{sidebarActionBusy=false;await refresh();}
    }),
    vscode.commands.registerCommand('codexDiff.navigateChanged',async request=>{
      if(!changedFiles.length)return;
      const current=request?.uri||vscode.window.activeTextEditor?.document.uri.toString();
      const index=changedFiles.indexOf(current),direction=request?.direction===-1?-1:1;
      const next=index<0?0:(index+direction+changedFiles.length)%changedFiles.length;
      await vscode.window.showTextDocument(vscode.Uri.parse(changedFiles[next]),{preview:false});
    }),
    vscode.commands.registerCommand('codexDiff.jumpToChat',async request=>{
      if(typeof request?.key!=='string')return false;
      await refresh();
      if(!navigationChats.some(chat=>chat.key===request.key)){
        vscode.window.showInformationMessage('That chat no longer has changes ready to review.');
        return false;
      }
      followedChatId=undefined;
      selected=request.key;
      await context.workspaceState.update('selectedChat',selected);
      await refresh();
      const first=navigationChats.find(chat=>chat.key===selected)?.files[0];
      if(!first)return false;
      await vscode.window.showTextDocument(vscode.Uri.parse(first),{preview:false});
      return true;
    }),
    vscode.window.registerWebviewViewProvider('codexDiff.review',sidebar),
    vscode.commands.registerCommand('codexDiff.sidebarState',()=>sidebar.state),
    vscode.commands.registerCommand('codexDiff.sidebarAction', async message=>{
      if(sidebarActionBusy || !message || !['block','all'].includes(message.type) || !['accept','reject','open'].includes(message.action)) return false;
      sidebarActionBusy=true;
      try {
        const state=sidebar.state;
        const requests=message.type==='all'?message.files:[message];
        if(!Array.isArray(requests)||!requests.length)throw new Error('There are no reviewable blocks in this selection.');
        if(message.type==='all' && message.selection!==selected)throw new Error('The selected chat changed. Review the refreshed sidebar and try again.');
        // Validate the entire batch before the first decision. Never silently
        // apply a stale button to a different block after incoming edits.
        for(const request of requests){
          const r=reviews.get(request.reviewKey);
          if(!r||state.files.find(f=>f.reviewKey===request.reviewKey)?.warning||!request.reviewKey.startsWith(`${selected}:`)||incoming.has(request.reviewKey)||r.text!==request.expected||reviewVersion(r)!==request.reviewVersion)throw new Error('These changes have moved. Review the refreshed sidebar and try again.');
        }
        for(const request of requests){
          const review=reviews.get(request.reviewKey);
          const doc=await vscode.workspace.openTextDocument(vscode.Uri.parse(review.uri));
          const editor=await vscode.window.showTextDocument(doc,{preview:true,preserveFocus:message.action!=='open'});
          if(message.action==='open'){
            const projected=projectReview({after:review.text,hunks:review.getHunks()||[]},doc.getText());
            const h=projected?.hunks.find(h=>h.block===request.block);
            if(h){
              const position=new vscode.Position(Math.min(h.start,doc.lineCount-1),0);
              editor.selection=new vscode.Selection(position,position);
              editor.revealRange(new vscode.Range(position,position),vscode.TextEditorRevealType.InCenter);
            }
            continue;
          }
          const blocks=message.type==='all'?review.getHunks().map(h=>h.block).sort((a,b)=>b-a):[request.block];
          if(reviewVersion(review)!==request.reviewVersion)throw new Error('The file changed. Review the refreshed sidebar and try again.');
          const signature=review.signature;
          for(const block of blocks){
            if(reviews.get(request.reviewKey)!==review||review.signature!==signature||incoming.has(request.reviewKey))throw new Error('New changes arrived. Remaining blocks were left pending.');
            const ok=await vscode.commands.executeCommand('codexDiff.reviewBlock',{action:message.action,reviewKey:request.reviewKey,reviewVersion:reviewVersion(review),expected:review.text,current:doc.getText(),block});
            if(!ok)return false;
          }
        }
        if(message.type==='all') {
          const skipped=state.files.filter(f=>f.warning).length;
          if(skipped)vscode.window.showInformationMessage(`Codex Diffs: ${message.action==='accept'?'accepted':'rejected'} the reviewable blocks. ${skipped} flagged file(s) were skipped.`);
        }
        return true;
      } finally {sidebarActionBusy=false;await refresh();}
    }),
    vscode.commands.registerCommand('codexDiff.resolveFile', async message => {
      const file=sidebar.state.files.find(f=>f.reviewKey===message.reviewKey&&f.resolution);
      if(!file||!file.reviewKey.startsWith(`${selected}:`))return false;
      if(file.resolution==='incoming')return vscode.commands.executeCommand('codexDiff.resolveIncoming',file.reviewKey);
      return false;
    }),
    vscode.commands.registerCommand('codexDiff.resolveIncoming', async (key,decision) => {
      if (!key) {
        if(incoming.size===1) key=[...incoming.keys()][0];
        else {
          const pick=await vscode.window.showQuickPick([...incoming].map(([key,value])=>({label:path.basename(value.file.path),detail:value.file.path,key})),{title:'Incoming Codex changes'});
          key=pick?.key;
        }
      }
      const item=incoming.get(key);
      if(!item) return false;
      const doc=vscode.workspace.textDocuments.find(d=>d.uri.fsPath===item.file.path);
      if(!doc) return false;
      if(!decision) decision=await vscode.window.showWarningMessage(`Resolve incoming changes for ${path.basename(item.file.path)}. Loading Codex's version replaces the editor contents and can be undone.`, 'Load Codex version','Keep editor version');
      if(!['Load Codex version','Keep editor version'].includes(decision)) return false;
      if(incoming.get(key)!==item) return false;
      if(decision==='Load Codex version') {
        if(!await replaceBuffer(doc,item.file.after.text)) return false;
        const review=new Review(item.file.before.text,item.file.after.text);
        review.signature=item.signature;review.uri=doc.uri.toString();reviews.set(key,review);
      } else {
        let review=reviews.get(key);
        if(!review) {review=new Review(doc.getText(),doc.getText());review.uri=doc.uri.toString();reviews.set(key,review);}
        review.signature=item.signature;
      }
      incoming.delete(key);
      await saveReviews();await refresh();return true;
    }),
    vscode.commands.registerCommand('codexDiff.restoreReview', async snapshot => {
      const review=reviews.get(snapshot?.reviewKey);
      const doc=vscode.workspace.textDocuments.find(d=>d.uri.toString()===review?.uri);
      if (!review || !doc || review.signature!==snapshot.signature || doc.getText()!==snapshot.text) return false;
      review.regions=snapshot.regions.map(r=>({...r}));
      review.text=snapshot.reviewText??snapshot.text;
      review.history.clear(); review.remember();
      await saveReviews(); await refresh();
      return true;
    }),
    vscode.commands.registerCommand('codexDiff.reviewBlock', async request => {
      if (!request || !['accept','reject'].includes(request.action)) return false;
      const review=reviews.get(request.reviewKey);
      const doc=vscode.workspace.textDocuments.find(d=>d.uri.toString()===review?.uri);
      const projected=inlineDocuments.some(d=>d.uri===review?.uri&&d.after===request.expected&&d.hunks.some(h=>h.reviewKey===request.reviewKey&&h.block===request.block&&h.reviewVersion===request.reviewVersion));
      // A button belongs to a specific rendered version and chat.
      if (!review || !doc || !sessions.some(s=>request.reviewKey.startsWith(`${s.key}:`)) || incoming.has(request.reviewKey) || doc.getText()!==(request.current??request.expected) || (review.text!==request.expected&&!projected) || request.reviewVersion!==reviewVersion(review)) return false;
      if (request.action==='accept') {
        const before={reviewKey:request.reviewKey,signature:review.signature,text:doc.getText(),reviewText:review.text,regions:review.regions.map(r=>({...r}))};
        if (!review.accept(request.block)) return false;
        const after={...before,regions:review.regions.map(r=>({...r}))};
        try {
          const pushed=await vscode.commands.executeCommand('_codexDiff.pushReviewUndo',{uri:review.uri,before,after});
          if (!pushed) throw new Error('Could not attach acceptance to editor undo history');
        } catch(error) {
          review.regions=before.regions; review.remember();
          throw error;
        }
      } else {
        const current=doc.getText();
        const planned=planRejection(review,request.block,current);
        if(planned.missing)return false;
        if(planned.conflict){
          vscode.window.showWarningMessage('This change overlaps later edits. Nothing was changed. Open the file to edit it manually, or accept this block to keep the current work.');
          return false;
        }
        const next=planned.text;
        let start=0,end=current.length,nextEnd=next.length;
        while(start<end&&start<nextEnd&&current[start]===next[start]) start++;
        while(end>start&&nextEnd>start&&current[end-1]===next[nextEnd-1]) { end--; nextEnd--; }
        if(next===current){
          return vscode.commands.executeCommand('codexDiff.reviewBlock',{...request,action:'accept',current});
        }
        if(review.text!==current&&!reconcileReview(review,current)){
          vscode.window.showWarningMessage('The change could not be safely located in the current file. Nothing was changed.');
          return false;
        }
        const previous=review.regions.map(r=>({...r}));
        const beforeReject={text:review.text,regions:previous};
        review.remember();
        review.regions.splice(request.block,1);
        const edit=new vscode.WorkspaceEdit();
        edit.replace(doc.uri,new vscode.Range(doc.positionAt(start),doc.positionAt(end)),next.slice(start,nextEnd));
        if (!await vscode.workspace.applyEdit(edit)) { review.regions=previous; return false; }
        review.recordRejection(beforeReject);
      }
      await saveReviews(); await refresh();
      return true;
    }),
    vscode.window.registerTreeDataProvider('codexDiff.files', tree),
    vscode.commands.registerCommand('codexDiff.refresh', refresh),
    vscode.commands.registerCommand('codexDiff.selectChat', async () => {
      await refresh();
      if (!sessions.length) { vscode.window.showInformationMessage('No captured chats yet. Review/trust the Codex hooks, then make a Codex edit.'); return; }
      const pick = await vscode.window.showQuickPick(chatPickerItems(sessions,selected), { title: 'Review a chat', placeHolder: 'Changes = pending files · Warning = needs attention · Check = caught up' });
      if (pick) { followedChatId=undefined;selected = pick.key; await context.workspaceState.update('selectedChat', selected); await refresh(); }
    }),
    vscode.commands.registerCommand('codexDiff.openFile', async file => {
      if (!file.after.exists) { vscode.window.showInformationMessage('This file was deleted. There is no live editor to decorate for a deleted file yet.'); return; }
      await vscode.window.showTextDocument(vscode.Uri.file(file.path)); await refresh();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => refresh()),
    vscode.workspace.onDidChangeTextDocument(event => {
      for (const review of reviews.values()) if (review.uri===event.document.uri.toString()) {
        let expected=review.text;
        for(const change of [...event.contentChanges].sort((a,b)=>b.rangeOffset-a.rangeOffset))expected=expected.slice(0,change.rangeOffset)+change.text+expected.slice(change.rangeOffset+change.rangeLength);
        if(expected!==event.document.getText())continue;
        review.update(event.contentChanges,event.document.getText(),!!event.reason);
      }
      clearTimeout(saveTimer); saveTimer=setTimeout(saveReviews,200);
      refresh();
    })
  );
  const interval = setInterval(refresh, 1000);
  context.subscriptions.push({ dispose: () => { disposed = true; clearTimeout(saveTimer); saveReviews(); clearInterval(interval); vscode.commands.executeCommand('_codexDiff.setChanges', { documents: [] }); } });
  refresh();
}
module.exports = { activate };
