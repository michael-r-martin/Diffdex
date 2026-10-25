// Runs in the actual patched desktop extension host, with synthetic hook events.
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
exports.run = async function () {
  const root=path.resolve(__dirname,'..');
  const project=fs.realpathSync(vscode.workspace.workspaceFolders[0].uri.fsPath);
  const store=path.join(root,'.prototype-runtime/e2e/captures',String(Date.now()));
  const file=path.join(project,'actual change ü.js');
  const report=path.join(root,'.prototype-runtime/e2e/result.json');
  try {
    assert.ok(vscode.extensions.getExtension('vscode.theme-defaults'), 'Built-in themes must be registered');
    assert.ok(vscode.extensions.getExtension('vscode.javascript'), 'JavaScript grammar must be registered');
    await vscode.workspace.getConfiguration('workbench').update('colorTheme','Dark Modern',vscode.ConfigurationTarget.Global);
    const before='// existing user work\nfunction greet() {\n  const old = "hello";\n  return old;\n}\n';
    const after='// existing user work\nfunction greet() {\n  return "welcome";\n}\n';
    fs.writeFileSync(file,before);
    const event={session_id:`integration-${Date.now()}`,tool_use_id:'edit-one',tool_name:'apply_patch',cwd:project,tool_input:{command:'*** Begin Patch\n*** Update File: actual change ü.js\n@@\n-  const old = "hello";\n-  return old;\n+  return "welcome";\n*** End Patch'}};
    function hook(phase){const child=spawnSync(process.env.CODEX_DIFF_NODE,[path.join(root,'hooks/capture.cjs'),store],{input:JSON.stringify({...event,hook_event_name:phase}),encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');}
    hook('PreToolUse');fs.writeFileSync(file,after);hook('PostToolUse');
    await vscode.workspace.getConfiguration('codexDiff').update('storePath',store,vscode.ConfigurationTarget.Global);
    await vscode.extensions.getExtension('unserious-labs.codex-inline-diff-prototype').activate();
    const doc=await vscode.workspace.openTextDocument(file);await vscode.window.showTextDocument(doc);
    let result;
    for(let i=0;i<30;i++){
      result=await vscode.commands.executeCommand('codexDiff.refresh');
      if(result?.results?.some(r=>r.uri===doc.uri.toString()&&r.status==='rendered'&&r.deletedBlocks===1&&r.coloredDeletedBlocks===1&&r.tokenClasses.length>1&&r.sourceTokenClasses.length>1))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(result?.results?.some(r=>r.uri===doc.uri.toString()&&r.status==='rendered'&&r.deletedBlocks===1&&r.coloredDeletedBlocks===1&&r.tokenClasses.length>1&&r.sourceTokenClasses.length>1),JSON.stringify(result));
    assert.equal(doc.languageId,'javascript');
    const topEnter=new vscode.WorkspaceEdit();
    topEnter.insert(doc.uri,new vscode.Position(2,0),'\n');
    await vscode.workspace.applyEdit(topEnter);
    const topTyping=new vscode.WorkspaceEdit();
    topTyping.insert(doc.uri,new vscode.Position(2,0),'// independent line above the block');
    await vscode.workspace.applyEdit(topTyping);
    const topResult=await waitFor(info=>info.changes.find(d=>d.uri===doc.uri.toString())?.hunks[0]?.start===3);
    assert.ok(topResult.changes.find(d=>d.uri===doc.uri.toString()).hunks.every(h=>!h.added.some(line=>line.includes('independent line'))));
    await vscode.commands.executeCommand('undo');
    await vscode.commands.executeCommand('undo');
    assert.equal(doc.getText(),after);
    const hitTargets=result.results.find(r=>r.uri===doc.uri.toString()).buttonHitTargets;
    assert.equal(hitTargets.length,2);
    assert.ok(hitTargets.every(button=>button.reachable),JSON.stringify(hitTargets));
    await vscode.workspace.getConfiguration('workbench').update('colorTheme','Light Modern',vscode.ConfigurationTarget.Global);
    for(let i=0;i<30&&vscode.window.activeColorTheme.kind!==vscode.ColorThemeKind.Light;i++)await new Promise(r=>setTimeout(r,100));
    assert.equal(vscode.window.activeColorTheme.kind,vscode.ColorThemeKind.Light,'Built-in light theme must be selectable');
    assert.equal(doc.getText(),after);assert.equal(fs.readFileSync(file,'utf8'),after);
    const edit=new vscode.WorkspaceEdit();edit.insert(doc.uri,new vscode.Position(0,0),'// unsaved manual edit\n');await vscode.workspace.applyEdit(edit);
    let stale;
    for(let i=0;i<30;i++){
      stale=await vscode.commands.executeCommand('codexDiff.refresh');
      if(stale?.results?.some(r=>r.uri===doc.uri.toString()&&r.status==='rendered'&&r.deletedBlocks===1))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(stale?.results?.some(r=>r.uri===doc.uri.toString()&&r.status==='rendered'&&r.deletedBlocks===1),JSON.stringify(stale));
    assert.equal(fs.readFileSync(file,'utf8'),after);
    async function expectBlocks(count) {
      let update;
      for (let i=0;i<30;i++) {
        update=await vscode.commands.executeCommand('codexDiff.refresh');
        if (update?.results?.some(r=>r.uri===doc.uri.toString()&&(r.status==='rendered'||count===0&&r.status==='idle')&&r.deletedBlocks===count)) return;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.fail(JSON.stringify(update));
    }
    const inside = new vscode.WorkspaceEdit();
    inside.replace(doc.uri, doc.lineAt(3).range, '  return "typed inside the diff";');
    await vscode.workspace.applyEdit(inside);
    await expectBlocks(1);
    assert.ok(doc.getText().includes('typed inside the diff'));
    const outside = new vscode.WorkspaceEdit();
    outside.insert(doc.uri,doc.lineAt(3).range.end,'\n  // my own code');
    await vscode.workspace.applyEdit(outside);
    await expectBlocks(1);
    let boundary;
    for(let i=0;i<30;i++) {
      boundary=await vscode.commands.executeCommand('codexDiff.refresh');
      if(boundary?.changes) break;
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(boundary.changes.find(d=>d.uri===doc.uri.toString()).hunks.every(h=>!h.added.some(line=>line.includes('my own code'))));
    // Restoring original text must clear the diff, proving the live contents
    // rather than the last hook snapshot drive rendering.
    const restore = new vscode.WorkspaceEdit();
    restore.replace(doc.uri, doc.lineAt(3).range, '  const old = "hello";\n  return old;');
    await vscode.workspace.applyEdit(restore);
    await expectBlocks(0);
    await vscode.commands.executeCommand('undo');
    await expectBlocks(1);
    async function act(action, expected=doc.getText()) {
      let info;
      for(let i=0;i<30;i++) {
        info=await vscode.commands.executeCommand('codexDiff.refresh');
        if(info?.changes?.find(d=>d.uri===doc.uri.toString())?.hunks.length) break;
        await new Promise(r=>setTimeout(r,100));
      }
      const change=info.changes.find(d=>d.uri===doc.uri.toString());
      assert.ok(info.results.some(r=>r.uri===doc.uri.toString()&&r.actionBars===1));
      return vscode.commands.executeCommand('codexDiff.reviewBlock',{action,reviewKey:change.reviewKey,reviewVersion:change.reviewVersion,block:change.hunks[0].block,expected});
    }
    const reviewedText=doc.getText();
    let saveParticipants = 0;
    const participant = vscode.workspace.onWillSaveTextDocument(event => {
      if (event.document !== doc) return;
      saveParticipants++;
      event.waitUntil(Promise.resolve([vscode.TextEdit.insert(new vscode.Position(0,0),'// unexpected save formatting\n')]));
    });
    async function expectSaved(document = doc) {
      await waitFor(() => !document.isDirty && fs.readFileSync(document.uri.fsPath,'utf8') === document.getText());
    }
    assert.equal(await act('reject','outdated contents'),false);
    assert.equal(doc.getText(),reviewedText);
    assert.equal(await act('reject'),true);
    await expectSaved();
    await expectBlocks(0);
    assert.ok(doc.getText().includes('// my own code'));
    assert.ok(doc.getText().includes('const old = "hello";'));
    await vscode.commands.executeCommand('undo');
    await expectBlocks(1);
    assert.equal(doc.getText(),reviewedText);
    await expectSaved();
    assert.equal(await act('accept'),true);
    await expectSaved();
    await expectBlocks(0);
    assert.equal(doc.getText(),reviewedText);
    await vscode.commands.executeCommand('undo');
    await expectBlocks(1);
    assert.equal(doc.getText(),reviewedText);
    await expectSaved();
    await vscode.commands.executeCommand('redo');
    await expectBlocks(0);
    assert.equal(doc.getText(),reviewedText);
    await expectSaved();
    assert.equal(saveParticipants,0,'Review saves must skip formatting/save participants to preserve undo order');
    participant.dispose();
    // Later typing must undo first, followed by the acceptance itself.
    const later=new vscode.WorkspaceEdit();
    later.insert(doc.uri,doc.positionAt(doc.getText().length),'\n// after accepting');
    await vscode.workspace.applyEdit(later);
    await vscode.commands.executeCommand('undo');
    await expectBlocks(0);
    assert.equal(doc.getText(),reviewedText);
    await vscode.commands.executeCommand('undo');
    await expectBlocks(1);
    assert.equal(doc.getText(),reviewedText);
    assert.equal(fs.readFileSync(file,'utf8'),reviewedText);
    assert.equal(await act('reject'),true);
    const rejectedText=doc.getText();
    const afterReviewTyping=new vscode.WorkspaceEdit();
    afterReviewTyping.insert(doc.uri,new vscode.Position(0,0),'// unsaved after reviewing\n');
    await vscode.workspace.applyEdit(afterReviewTyping);
    async function captureNext(text,id) {
      event.tool_use_id=id;
      hook('PreToolUse');fs.writeFileSync(file,text);hook('PostToolUse');
    }
    async function waitFor(predicate) {
      for(let i=0;i<60;i++) {
        const info=await vscode.commands.executeCommand('codexDiff.refresh');
        if(info && predicate(info)) return info;
        await new Promise(r=>setTimeout(r,100));
      }
      assert.fail('Timed out waiting for incoming capture synchronization');
    }
    // Codex now reads the saved rejection as its starting point. Keep a new
    // unsaved edit in the buffer to exercise the incoming merge separately.
    const appended=rejectedText+'console.log("new capture");\n';
    await captureNext(appended,'capture-two');
    await waitFor(info=>!info.incoming.length&&doc.getText().includes('new capture'));
    assert.ok(doc.getText().includes('const old = "hello";'),'Rejected code must remain');
    assert.ok(doc.getText().includes('// my own code'),'Independent typing must remain');
    const localConflict=new vscode.WorkspaceEdit();
    const helloOffset=doc.getText().indexOf('hello');
    localConflict.replace(doc.uri,new vscode.Range(doc.positionAt(helloOffset),doc.positionAt(helloOffset+5)),'local edit');
    await vscode.workspace.applyEdit(localConflict);
    const preserved=doc.getText();
    const conflict=appended.replace('hello','conflicting edit');
    await captureNext(conflict,'capture-three');
    const pendingInfo=await waitFor(info=>info.incoming.length===1);
    assert.equal(doc.getText(),preserved,'Conflict must not overwrite editor');
    assert.equal(await vscode.commands.executeCommand('codexDiff.resolveIncoming',pendingInfo.incoming[0],'Keep editor version'),true);
    await waitFor(info=>info.incoming.length===0);
    assert.equal(doc.getText(),preserved);
    const conflictAgain=conflict.replace('conflicting edit','another incoming edit');
    await captureNext(conflictAgain,'capture-four');
    const pendingAgain=await waitFor(info=>info.incoming.length===1);
    assert.equal(await vscode.commands.executeCommand('codexDiff.resolveIncoming',pendingAgain.incoming[0],'Load Codex version'),true);
    await waitFor(info=>!info.incoming.length&&doc.getText()===conflictAgain);
    // A fresh incoming version can be clean when Reject makes it dirty. Those
    // metadata events must not erase the review state needed by Undo.
    await doc.save();
    const loadedInfo=await waitFor(info=>info.changes.some(d=>d.uri===doc.uri.toString()&&d.hunks.length));
    const loaded=loadedInfo.changes.find(d=>d.uri===doc.uri.toString());
    const loadedCount=loaded.hunks.length;
    assert.equal(await vscode.commands.executeCommand('codexDiff.reviewBlock',{
      action:'reject',reviewKey:loaded.reviewKey,reviewVersion:loaded.reviewVersion,
      block:loaded.hunks[0].block,expected:doc.getText()
    }),true);
    await expectSaved();
    await waitFor(info=>info.changes.find(d=>d.uri===doc.uri.toString())?.hunks.length===loadedCount-1);
    await vscode.commands.executeCommand('undo');
    await waitFor(info=>info.changes.find(d=>d.uri===doc.uri.toString())?.hunks.length===loadedCount);
    assert.equal(doc.getText(),conflictAgain);
    await expectSaved();
    await vscode.commands.executeCommand('redo');
    await waitFor(info=>info.changes.find(d=>d.uri===doc.uri.toString())?.hunks.length===loadedCount-1);
    await expectSaved();
    await vscode.commands.executeCommand('undo');
    await waitFor(info=>info.changes.find(d=>d.uri===doc.uri.toString())?.hunks.length===loadedCount);
    await vscode.commands.executeCommand('undo');
    assert.equal(doc.getText(),preserved,'Loading incoming code must be undoable');
    // Sidebar decisions use the same per-file undo stacks, including files
    // that have never been opened in an editor.
    const second=path.join(project,'sidebar.js');
    fs.writeFileSync(second,'const value = 1;\n');
    event.tool_use_id='sidebar-file';
    event.tool_input.command='*** Begin Patch\n*** Update File: sidebar.js\n@@\n-const value = 1;\n+const value = 2;\n*** End Patch';
    hook('PreToolUse');fs.writeFileSync(second,'const value = 2;\n');hook('PostToolUse');
    await waitFor(info=>info.changes.some(d=>d.uri===vscode.Uri.file(second).toString()));
    let panel=await vscode.commands.executeCommand('codexDiff.sidebarState');
    const secondRow=panel.files.find(f=>f.uri===vscode.Uri.file(second).toString());
    assert.equal(secondRow.hunks.length,1);
    assert.equal(await vscode.commands.executeCommand('codexDiff.sidebarAction',{type:'block',action:'reject',...secondRow,expected:secondRow.after,block:secondRow.hunks[0].block}),true);
    const secondDoc=await vscode.workspace.openTextDocument(second);
    assert.equal(secondDoc.getText(),'const value = 1;\n');
    await expectSaved(secondDoc);
    await vscode.window.showTextDocument(secondDoc);
    await vscode.commands.executeCommand('undo');
    await waitFor(info=>info.changes.find(d=>d.uri===secondDoc.uri.toString())?.hunks.length===1);
    await expectSaved(secondDoc);
    const flagged=path.join(project,'flagged.js');
    fs.writeFileSync(flagged,'// deleted fixture\n');
    event.tool_use_id='sidebar-flagged';
    event.tool_input.command='*** Begin Patch\n*** Delete File: flagged.js\n*** End Patch';
    hook('PreToolUse');fs.unlinkSync(flagged);hook('PostToolUse');
    await waitFor(()=>true);
    panel=await vscode.commands.executeCommand('codexDiff.sidebarState');
    assert.ok(panel.files.some(f=>f.warning));
    const bulk={type:'all',action:'accept',selection:panel.selection,files:panel.files.filter(f=>f.hunks.length&&!f.warning).map(f=>({reviewKey:f.reviewKey,reviewVersion:f.reviewVersion,expected:f.after}))};
    assert.ok(bulk.files.length>=2);
    assert.equal(await vscode.commands.executeCommand('codexDiff.sidebarAction',bulk),true);
    for(const request of bulk.files) await expectSaved(await vscode.workspace.openTextDocument(vscode.Uri.parse(panel.files.find(f=>f.reviewKey===request.reviewKey).uri)));
    await waitFor(info=>info.changes.every(d=>!d.hunks.length));
    await assert.rejects(vscode.commands.executeCommand('codexDiff.sidebarAction',bulk),/refreshed sidebar/);
    for(const request of bulk.files){
      const row=panel.files.find(f=>f.reviewKey===request.reviewKey);
      await vscode.window.showTextDocument(vscode.Uri.parse(row.uri));
      for(let i=0;i<row.hunks.length;i++)await vscode.commands.executeCommand('undo');
    }
    await waitFor(info=>info.changes.filter(d=>d.hunks.length).length>=2);
    panel=await vscode.commands.executeCommand('codexDiff.sidebarState');
    assert.equal(await vscode.commands.executeCommand('codexDiff.sidebarAction',{type:'all',action:'reject',selection:panel.selection,files:panel.files.filter(f=>f.hunks.length&&!f.warning).map(f=>({reviewKey:f.reviewKey,reviewVersion:f.reviewVersion,expected:f.after}))}),true);
    await waitFor(info=>info.changes.every(d=>!d.hunks.length));
    const selectedBefore=(await vscode.commands.executeCommand('codexDiff.sidebarState')).selection;
    const shared=path.join(project,'multi-chat.js');
    fs.writeFileSync(shared,'const a = 1;\n// anchor\nconst b = 1;\n');
    event.session_id=`chat-a-${Date.now()}`;event.tool_use_id='multi-a';
    event.tool_input.command='*** Begin Patch\n*** Update File: multi-chat.js\n@@\n-const a = 1;\n+const a = 2;\n*** End Patch';
    hook('PreToolUse');fs.writeFileSync(shared,'const a = 2;\n// anchor\nconst b = 1;\n');hook('PostToolUse');
    event.session_id=`chat-b-${Date.now()}`;event.tool_use_id='multi-b';
    event.tool_input.command='*** Begin Patch\n*** Update File: multi-chat.js\n@@\n-const b = 1;\n+const b = 2;\n*** End Patch';
    hook('PreToolUse');fs.writeFileSync(shared,'const a = 2;\n// anchor\nconst b = 2;\n');hook('PostToolUse');
    const sharedDoc=await vscode.workspace.openTextDocument(shared);
    await vscode.window.showTextDocument(sharedDoc);
    let mixed=await waitFor(info=>info.editorDocuments.find(d=>d.uri===sharedDoc.uri.toString())?.hunks.length===2);
    assert.equal((await vscode.commands.executeCommand('codexDiff.sidebarState')).selection,selectedBefore);
    assert.equal(mixed.changedFiles.length,0,'Old selected chat has no pending navigable files');
    await vscode.commands.executeCommand('codexDiff.followChat',{id:event.session_id});
    mixed=await waitFor(info=>info.changedFiles.includes(sharedDoc.uri.toString()));
    assert.equal(mixed.changedFiles.length,1);
    assert.notEqual((await vscode.commands.executeCommand('codexDiff.sidebarState')).selection,selectedBefore);
    assert.ok(mixed.results.some(r=>r.uri===sharedDoc.uri.toString()&&r.navigator));
    const combined=mixed.editorDocuments.find(d=>d.uri===sharedDoc.uri.toString());
    assert.notEqual(combined.hunks[0].reviewKey,combined.hunks[1].reviewKey);
    const unchanged=await vscode.workspace.openTextDocument({content:'// no captured changes',language:'javascript'});
    const unchangedFile=path.join(project,'unchanged.js');
    fs.writeFileSync(unchangedFile,unchanged.getText());
    for(const direction of [-1,1]){
      const outside=await vscode.workspace.openTextDocument(unchangedFile);
      await vscode.window.showTextDocument(outside);
      await waitFor(info=>info.results.some(r=>r.uri===outside.uri.toString()&&r.navigator));
      await vscode.commands.executeCommand('codexDiff.navigateChanged',{uri:outside.uri.toString(),direction});
      assert.equal(vscode.window.activeTextEditor.document.uri.toString(),mixed.changedFiles[0]);
    }
    await vscode.commands.executeCommand('codexDiff.navigateChanged',{uri:sharedDoc.uri.toString(),direction:1});
    assert.ok(mixed.changedFiles.includes(vscode.window.activeTextEditor.document.uri.toString()));
    await vscode.window.showTextDocument(sharedDoc);
    const h=combined.hunks[0];
    assert.equal(await vscode.commands.executeCommand('codexDiff.reviewBlock',{action:'reject',reviewKey:h.reviewKey,reviewVersion:h.reviewVersion,expected:combined.after,block:h.block}),true);
    assert.equal(sharedDoc.getText(),'const a = 1;\n// anchor\nconst b = 2;\n');
    await expectSaved(sharedDoc);
    await vscode.commands.executeCommand('undo');
    await waitFor(info=>info.editorDocuments.find(d=>d.uri===sharedDoc.uri.toString())?.hunks.length===2);
    await expectSaved(sharedDoc);
    for(const action of ['accept','reject']){
      const info=await waitFor(info=>info.editorDocuments.find(d=>d.uri===sharedDoc.uri.toString())?.hunks.length===2);
      const fileReview=info.editorDocuments.find(d=>d.uri===sharedDoc.uri.toString());
      const request={action,uri:fileReview.uri,expected:fileReview.after,stamp:JSON.stringify(info.changes.find(d=>d.uri===sharedDoc.uri.toString()).hunks.map(h=>[info.changes.find(d=>d.uri===sharedDoc.uri.toString()).reviewKey,info.changes.find(d=>d.uri===sharedDoc.uri.toString()).reviewVersion,h.block]))};
      assert.equal(await vscode.commands.executeCommand('codexDiff.reviewFile',request),true);
      await expectSaved(sharedDoc);
      await waitFor(info=>!info.changedFiles.includes(sharedDoc.uri.toString()));
      assert.equal(sharedDoc.getText(),action==='accept'?'const a = 2;\n// anchor\nconst b = 2;\n':'const a = 2;\n// anchor\nconst b = 1;\n');
      assert.equal(await vscode.commands.executeCommand('codexDiff.reviewFile',request),false);
      await vscode.commands.executeCommand('undo');
      await waitFor(info=>info.editorDocuments.find(d=>d.uri===sharedDoc.uri.toString())?.hunks.length===2);
      await expectSaved(sharedDoc);
    }
    await vscode.commands.executeCommand('codexDiff.followChat',{id:'new-chat-without-captures'});
    await waitFor(info=>info.selected===undefined&&info.changedFiles.length===0);
    assert.equal((await vscode.commands.executeCommand('codexDiff.sidebarState')).files.length,0);
    // Older overlapping chat remains a normal review; stale rejection never
    // replaces newer work, and metadata-only acceptance supports native undo.
    const overlap=path.join(project,'overlap-review.txt');
    const capture=require('../hooks/capture.cjs').capture;
    const oldChat='overlap-old-'+Date.now(),newChat='overlap-new-'+Date.now();
    function captureOverlap(id,text){
      const ev={session_id:id,tool_use_id:id,tool_name:'apply_patch',cwd:project,tool_input:{command:'*** Begin Patch\n*** Update File: overlap-review.txt\n*** End Patch'}};
      capture({...ev,hook_event_name:'PreToolUse'},store);fs.writeFileSync(overlap,text);capture({...ev,hook_event_name:'PostToolUse'},store);
    }
    fs.writeFileSync(overlap,'original\n');captureOverlap(oldChat,'first proposal\n');
    await new Promise(resolve=>setTimeout(resolve,5));captureOverlap(newChat,'newer important work\n');
    const overlapDoc=await vscode.workspace.openTextDocument(overlap);await vscode.window.showTextDocument(overlapDoc);
    await vscode.commands.executeCommand('codexDiff.followChat',{id:oldChat});
    await waitFor(info=>info.changedFiles.includes(overlapDoc.uri.toString()));
    const oldState=await vscode.commands.executeCommand('codexDiff.sidebarState');
    const oldFile=oldState.files.find(f=>f.uri===overlapDoc.uri.toString());
    assert.equal(oldFile.warning,undefined);assert.equal(oldFile.historical,undefined);assert.equal(oldFile.hunks.length,1);
    const renderedOld=await vscode.commands.executeCommand('codexDiff.refresh');
    assert.ok(renderedOld.editorDocuments.find(d=>d.uri===overlapDoc.uri.toString()).hunks.some(h=>h.reviewKey===oldFile.reviewKey));
    assert.ok(renderedOld.results.some(r=>r.uri===overlapDoc.uri.toString()&&r.deletedBlocks>0));
    await vscode.commands.executeCommand('codexDiff.sidebarAction',{type:'block',action:'open',reviewKey:oldFile.reviewKey,reviewVersion:oldFile.reviewVersion,expected:oldFile.after,block:oldFile.hunks[0].block});
    assert.equal(vscode.window.activeTextEditor.selection.active.line,0);

    const oldRequest={type:'block',action:'reject',reviewKey:oldFile.reviewKey,reviewVersion:oldFile.reviewVersion,expected:oldFile.after,block:oldFile.hunks[0].block};
    assert.equal(await vscode.commands.executeCommand('codexDiff.sidebarAction',oldRequest),false);
    assert.equal(overlapDoc.getText(),'newer important work\n');
    assert.equal(await vscode.commands.executeCommand('codexDiff.sidebarAction',{...oldRequest,action:'accept'}),true);
    assert.equal(overlapDoc.getText(),'newer important work\n');
    await vscode.commands.executeCommand('undo');
    await waitFor(info=>info.changes.some(f=>f.reviewKey===oldFile.reviewKey&&f.hunks.length===1));
    assert.equal(overlapDoc.getText(),'newer important work\n');
    // Commits settle all historical captures for clean files, without deleting
    // their hook history. Later tools in the same chat start at that checkpoint.
    function git(...args) {
      const child=spawnSync('git',['-C',project,'-c','user.name=Diffdex Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
    }
    for(const document of vscode.workspace.textDocuments) {
      if(document.uri.scheme==='file'&&document.uri.fsPath.startsWith(project+path.sep)&&document.isDirty&&fs.existsSync(document.uri.fsPath))assert.equal(await document.save(),true);
    }
    git('init','--quiet');git('add','--all');git('commit','--quiet','-m','Commit captured changes');
    await waitFor(info=>info.editorDocuments.length===0&&info.changedFiles.length===0&&info.incoming.length===0);
    assert.equal((await vscode.commands.executeCommand('codexDiff.sidebarState')).files.length,0);
    captureOverlap(oldChat,'after commit proposal\n');
    const postCommit=await waitFor(info=>info.changes.some(file=>file.hunks.length));
    const next=postCommit.changes.find(file=>file.uri===overlapDoc.uri.toString());
    assert.deepEqual(next.hunks[0].removed,['newer important work']);
    assert.deepEqual(next.hunks[0].added,['after commit proposal']);
    await overlapDoc.save();git('add','--all');
    await waitFor(info=>info.changedFiles.includes(overlapDoc.uri.toString()));
    git('commit','--quiet','-m','Commit next turn');
    await waitFor(info=>info.editorDocuments.length===0&&info.changedFiles.length===0);
    // Regression: an automatically saved rejection is Git-clean too. It must
    // not be checkpointed as a commit, or its normal text Undo loses the review.
    captureOverlap(oldChat,'undoable proposal\n');
    await waitFor(info=>info.changes.some(file=>file.uri===overlapDoc.uri.toString()&&file.hunks.length===1));
    await vscode.window.showTextDocument(overlapDoc);
    for(let cycle=0;cycle<2;cycle++) {
      const ready=await waitFor(info=>info.changes.some(file=>file.uri===overlapDoc.uri.toString()&&file.hunks.length===1));
      const row=ready.changes.find(file=>file.uri===overlapDoc.uri.toString());
      assert.equal(await vscode.commands.executeCommand('codexDiff.reviewBlock',{
        action:'reject',reviewKey:row.reviewKey,reviewVersion:row.reviewVersion,expected:overlapDoc.getText(),block:row.hunks[0].block
      }),true);
      await expectSaved(overlapDoc);
      assert.equal(overlapDoc.getText(),'after commit proposal\n');
      for(let i=0;i<3;i++)await waitFor(info=>!info.changedFiles.includes(overlapDoc.uri.toString()));
      await vscode.commands.executeCommand('undo');
      const restoredReview=await waitFor(info=>info.changedFiles.includes(overlapDoc.uri.toString()));
      const restoredFile=restoredReview.changes.find(file=>file.uri===overlapDoc.uri.toString());
      assert.deepEqual(restoredFile.hunks[0].removed,['after commit proposal']);
      assert.deepEqual(restoredFile.hunks[0].added,['undoable proposal']);
      await expectSaved(overlapDoc);
      assert.equal(overlapDoc.getText(),'undoable proposal\n');
      await vscode.commands.executeCommand('redo');
      await waitFor(info=>!info.changedFiles.includes(overlapDoc.uri.toString()));
      await expectSaved(overlapDoc);
      assert.equal(overlapDoc.getText(),'after commit proposal\n');
      await vscode.commands.executeCommand('undo');
      await waitFor(info=>info.changedFiles.includes(overlapDoc.uri.toString()));
      await expectSaved(overlapDoc);
    }
    git('add','--all');git('commit','--quiet','-m','Commit after review undo');
    await waitFor(info=>info.editorDocuments.length===0&&info.changedFiles.length===0);
    fs.writeFileSync(report,JSON.stringify({ok:true,checks:['hook subprocess capture','session store','extension bridge','real file editor view zone','source unchanged','manual edit preservation','accept and reject blocks','reject undo','reject undo and redo after incoming load and save','accept undo and redo','acceptance and typing undo order','stale action guard','built-in themes and JS grammar registered','source and deleted code tokenized','light theme selection','incoming edits merge into dirty buffers','conflicts preserve rejected code','explicit incoming resolution and undo'],result},null,2));
  }catch(error){fs.writeFileSync(report,JSON.stringify({ok:false,error:String(error),stack:error.stack},null,2));throw error;}
};
