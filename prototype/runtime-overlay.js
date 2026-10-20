// Private editor-core bridge; receives session snapshots from the extension.
var __codexDiffLabState;
function __codexDiffLabGetState() {
  return __codexDiffLabState ||= { documents: new Map(), editors: new Set() };
}
function __codexDiffLabUpdate(payload) {
  const state = __codexDiffLabGetState();
  const documents = new Map();
  for (const item of payload?.documents || []) {
    if (typeof item.uri !== 'string' || typeof item.after !== 'string' || !Array.isArray(item.hunks)) continue;
    documents.set(item.uri, item);
  }
  state.changedFiles=payload?.changedFiles||[];
  state.otherChats=payload?.otherChats||[];
  state.navigationDocuments=new Map((payload?.navigationDocuments||payload?.documents||[]).map(d=>[d.uri,d]));
  const signature = JSON.stringify([payload?.documents || [],state.changedFiles,payload?.navigationDocuments,state.otherChats]);
  const changed = signature !== state.signature;
  state.signature = signature;
  if (changed) state.documents = documents;
  const results = [];
  for (const entry of state.editors) { entry.render(changed); results.push(entry.report()); }
  return results;
}
function __codexDiffLabAttach(editor) {
  if (editor.__codexDiffLabScheduled) return;
  editor.__codexDiffLabScheduled = true;
  queueMicrotask(() => {
    const state = __codexDiffLabGetState();
    let zoneIds = [], nodes = [], controls = [], decoration, lastModel, lastItem, lastVersion, status = 'idle';
    let navigator,navigatorSignature;
    function renderNavigator(model) {
      const item=model&&state.navigationDocuments?.get(model.uri.toString());
      const signature=JSON.stringify([model?.uri.toString(),state.changedFiles||[],item,state.otherChats]);
      if(navigator&&navigator.isConnected!==false&&signature===navigatorSignature&&(!editor.getDomNode()?.getClientRects||editor.getDomNode().getClientRects().length))return;
      navigatorSignature=signature;
      navigator?.remove();navigator=undefined;
      const host=editor.getDomNode(),files=state.changedFiles||[];
      if(model?.uri.scheme!=='file'||!host?.appendChild)return;
      if(host.getClientRects&&!host.getClientRects().length)return;
      const breadcrumbs=host.closest?.('.editor-group-container')?.querySelector('.breadcrumbs-control');
      const header=breadcrumbs?.getClientRects().length?breadcrumbs:null;
      navigator=document.createElement('div');
      navigator.className='codex-diff-navigator';
      navigator.setAttribute('role','group');navigator.setAttribute('aria-label','Pending files in the selected Codex chat');
      navigator.addEventListener('mousedown',event=>event.stopPropagation());
      const index=files.indexOf(model.uri.toString());
      const label=document.createElement('span');label.textContent=index<0?`${files.length} files in this chat`:`${index+1} of ${files.length} files in this chat`;
      const otherChats=state.otherChats||[];
      if(otherChats.length){
        const select=document.createElement('select');
        select.className='codex-other-chats';
        select.setAttribute('aria-label','Switch chat and open its first changed file');
        select.title='Switch to another chat with pending changes in this repository';
        const placeholder=document.createElement('option');
        placeholder.value='';placeholder.disabled=true;placeholder.selected=true;
        placeholder.textContent=files.length?`Other chats · ${otherChats.length}`:`Changes in ${otherChats.length} other ${otherChats.length===1?'chat':'chats'}`;
        select.appendChild(placeholder);
        for(const chat of otherChats){
          const option=document.createElement('option');option.value=chat.key;
          option.textContent=`${chat.title} · ${chat.files.length} ${chat.files.length===1?'file':'files'}${chat.warnings?` · ⚠ ${chat.warnings} unresolved`:''}`;
          select.appendChild(option);
        }
        select.addEventListener('change',async event=>{
          event.stopPropagation();
          const key=select.value;if(!key)return;
          select.disabled=true;
          try{await __codexDiffLabCommand(editor,'codexDiff.jumpToChat',{key});}
          finally{select.value='';select.disabled=false;}
        });
        navigator.appendChild(select);
      }
      for(const direction of files.length||!otherChats.length?[-1,1]:[]){
        const button=document.createElement('button');button.textContent=direction===-1?'←':'→';
        button.disabled=!files.length;
        button.setAttribute('aria-label',direction===-1?'Previous changed file':'Next changed file');
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();__codexDiffLabCommand(editor,'codexDiff.navigateChanged',{uri:model.uri.toString(),direction});});
        if(direction===1)navigator.appendChild(label);
        navigator.appendChild(button);
      }
      for(const action of files.length||!otherChats.length?['reject','accept']:[]){
        const button=document.createElement('button');
        button.textContent=action==='accept'?'Accept File':'Reject File';
        button.className=action==='accept'?'codex-accept-file':'codex-reject-file';
        button.disabled=!item?.hunks.length;
        button.setAttribute('aria-label',`${action==='accept'?'Accept':'Reject'} pending changes in this file`);
        button.addEventListener('click',async event=>{
          event.preventDefault();event.stopPropagation();
          if(!item?.hunks.length||model.getValue()!==item.after)return;
          button.disabled=true;
          try{await __codexDiffLabCommand(editor,'codexDiff.reviewFile',{action,uri:model.uri.toString(),expected:item.after,stamp:JSON.stringify(item.hunks.map(h=>[h.reviewKey,h.reviewVersion,h.block]))});}
          finally{button.disabled=false;editor.focus();}
        });
        navigator.appendChild(button);
      }
      (header||host).appendChild(navigator);
    }
    function clear() {
      if (zoneIds.length) editor.changeViewZones(accessor => zoneIds.forEach(id => accessor.removeZone(id)));
      zoneIds = []; nodes.forEach(node => node.remove()); nodes = [];
      controls.forEach(node=>node.remove()); controls=[];
      decoration?.clear(); decoration = undefined;
      lastModel = lastItem = lastVersion = undefined;
    }
    function render(force = false) {
      const model = editor.getModel();
      renderNavigator(model);
      const item = model && state.documents.get(model.uri.toString());
      if (!force && lastModel === model && lastItem === item && lastVersion === model?.getVersionId()) return;
      // Wait for the extension to re-anchor hunks after typing. Preserve existing
      // zones while the asynchronous extension-host update is in flight.
      if (lastModel === model && item && model.getValue().replace(/\r\n/g, '\n') !== item.after.replace(/\r\n/g, '\n')) return;
      clear(); status = 'idle';
      if (model?.uri.scheme !== 'file' || !item || !editor.getDomNode()) return;
      // Do not display an old chat's rows over newer or unsaved edits.
      if (model.getValue().replace(/\r\n/g, '\n') !== item.after.replace(/\r\n/g, '\n')) { status = 'stale'; return; }
      const greens = [];
      editor.changeViewZones(accessor => {
        for (const hunk of item.hunks) {
          if (!Number.isInteger(hunk.start) || hunk.start < 0 || !Array.isArray(hunk.removed) || !Array.isArray(hunk.added)) continue;
          if ((hunk.reviewKey||item.reviewKey) && Number.isInteger(hunk.block)) {
            const bar=document.createElement('div');
            bar.className='codex-diff-actions';
            // View zones sit underneath Monaco's full-size text hit surface.
            // Raise only interactive controls, leaving deleted code as display-only.
            bar.style.zIndex='10';
            bar.style.pointerEvents='auto';
            bar.addEventListener('mousedown',event=>event.stopPropagation());
            for (const action of ['accept','reject']) {
              const button=document.createElement('button');
              button.textContent=action==='accept'?'✓ Accept':'✕ Reject';
              button.setAttribute('aria-label',`${action==='accept'?'Accept':'Reject'} this diff block`);
              button.addEventListener('click',async event=>{
                event.preventDefault(); event.stopPropagation();
                if (model.getValue()!==item.after) return;
                button.disabled=true;
                try {
                  await __codexDiffLabCommand(editor,'codexDiff.reviewBlock',{action,reviewKey:hunk.reviewKey||item.reviewKey,reviewVersion:hunk.reviewVersion||item.reviewVersion,block:hunk.block,expected:item.after});
                } catch(error) { console.error('[Codex Diffs] Review action failed',error); }
                finally { button.disabled=false; editor.focus(); }
              });
              bar.appendChild(button);
            }
            if(hunk.chat){const label=document.createElement('span');label.textContent=`Chat ${hunk.chat}`;bar.appendChild(label);}
            controls.push(bar);
            zoneIds.push(accessor.addZone({afterLineNumber:Math.min(hunk.start,model.getLineCount()),heightInPx:26,domNode:bar,suppressMouseDown:false}));
          }
          if (hunk.removed.length) {
            const node = document.createElement('div');
            Object.assign(node.style, {
              whiteSpace: 'pre', overflow: 'hidden', boxSizing: 'border-box',
              backgroundColor: 'var(--vscode-diffEditor-removedTextBackground, rgba(255,80,80,.2))',
              color: 'var(--vscode-editor-foreground)', borderLeft: '3px solid #e55'
            });
            node.textContent = hunk.removed.map(line => `− ${line}`).join('\n');
            node.setAttribute('aria-label', 'Deleted code from Codex chat; display only');
            editor.applyFontInfo(node);
            nodes.push(node);
            // Tokenize actual deleted code, not the visual minus prefix. The internal
            // tokenizer escapes source text and uses the current theme's token classes.
            if (typeof __codexDiffLabTokenize === 'function') {
              __codexDiffLabTokenize(editor, hunk.removed.join('\n')).then(html => {
                if (!nodes.includes(node)) return; // Ignore an obsolete async result.
                __codexDiffLabSetHTML(node, html);
                node.classList.add('codex-diff-deleted');
              }).catch(error => console.warn('[Codex Diffs] Tokenization failed', error));
            }
            zoneIds.push(accessor.addZone({ afterLineNumber: Math.min(hunk.start, model.getLineCount()), heightInLines: hunk.removed.length, domNode: node, suppressMouseDown: true }));
          }
          for (let i = 0; i < hunk.added.length; i++) {
            const line = hunk.start + i + 1;
            if (line > model.getLineCount()) break;
            greens.push({ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, options: { description: 'codex-diff-added', isWholeLine: true, className: 'codex-diff-lab-added' } });
          }
        }
      });
      decoration = editor.createDecorationsCollection(greens);
      lastModel = model; lastItem = item; lastVersion = model.getVersionId(); status = 'rendered';
    }
    if (!document.getElementById('codex-diff-lab-styles')) {
      const style = document.createElement('style'); style.id = 'codex-diff-lab-styles';
      style.textContent = '.codex-diff-lab-added { background: var(--vscode-diffEditor-insertedTextBackground, rgba(70,200,100,.2)); } .codex-diff-deleted { padding-left: 1ch; } .codex-diff-deleted .monaco-tokenized-source { font: inherit; white-space: pre; }';
      style.textContent += '.codex-diff-actions { display:flex; gap:6px; align-items:center; padding-left:8px; background:var(--vscode-editor-background); } .codex-diff-actions button { cursor:pointer; border:1px solid var(--vscode-button-border, transparent); border-radius:3px; padding:2px 8px; font:12px var(--vscode-font-family); color:var(--vscode-button-foreground); background:var(--vscode-button-background); } .codex-diff-actions button:hover { background:var(--vscode-button-hoverBackground); } .codex-diff-actions button:focus-visible { outline:1px solid var(--vscode-focusBorder); }';
      style.textContent += '.codex-diff-navigator { position:absolute; right:16px; top:0; height:22px; z-index:40; display:flex; align-items:center; gap:8px; padding:0 4px; color:var(--vscode-foreground); background:var(--vscode-breadcrumb-background, var(--vscode-editor-background)); font:12px var(--vscode-font-family); white-space:nowrap; pointer-events:auto; } .breadcrumbs-control:has(> .codex-diff-navigator) { position:relative; padding-right:410px; box-sizing:border-box; } .codex-diff-navigator button { background:transparent; color:inherit; border:0; padding:2px 6px; cursor:pointer; } .codex-diff-navigator button:hover { background:var(--vscode-toolbar-hoverBackground); } .codex-diff-navigator button.codex-accept-file { background:var(--vscode-button-background); color:var(--vscode-button-foreground); border-radius:3px; } .codex-diff-navigator button:disabled { opacity:.45; cursor:default; } .codex-diff-navigator button:focus-visible { outline:1px solid var(--vscode-focusBorder); }';
      style.textContent += '.monaco-workbench.mac { font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; } .monaco-workbench { --vscode-font-family: -apple-system, BlinkMacSystemFont, sans-serif; }';
      style.textContent += '.codex-diff-navigator { max-width:calc(100% - 24px); overflow-x:auto; } .breadcrumbs-control:has(> .codex-diff-navigator .codex-other-chats) { padding-right:620px; } .codex-diff-navigator .codex-other-chats { min-width:0; max-width:220px; height:21px; flex-shrink:0; font:inherit; color:var(--vscode-dropdown-foreground); background:var(--vscode-dropdown-background); border:1px solid var(--vscode-dropdown-border, transparent); border-radius:3px; cursor:pointer; } .codex-other-chats:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }';
      document.head.appendChild(style);
    }
    const entry = { editor, render, report: () => ({ uri: editor.getModel()?.uri.toString(), status, navigator:!!navigator, changedFiles:state.changedFiles?.length||0, deletedBlocks: nodes.length, actionBars: controls.length,
      buttonHitTargets: controls.flatMap(bar=>[...(bar.querySelectorAll?.('button') || [])].map(button=>{
        const rect=button.getBoundingClientRect();
        const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
        return {label:button.textContent,reachable:hit===button||button.contains(hit),hitClass:hit?.className};
      })),
      language: editor.getModel()?.getLanguageId?.(),
      sourceColors: [...new Set([...(editor.getDomNode()?.querySelectorAll?.('.view-line [class*="mtk"]') || [])].map(span => getComputedStyle(span).color))],
      coloredDeletedBlocks: nodes.filter(node => node.querySelector?.('.mtk1, [class*="mtk"]')).length,
      tokenClasses: [...new Set(nodes.flatMap(node => [...(node.querySelectorAll?.('[class*="mtk"]') || [])].map(span => span.className)))],
      sourceTokenClasses: [...new Set([...(editor.getDomNode()?.querySelectorAll?.('.view-line [class*="mtk"]') || [])].map(span => span.className))]
    }) };
    state.editors.add(entry);
    const listeners = [
      editor.onDidChangeModel(() => render(true)), editor.onDidChangeModelContent(() => render(true)),
      editor.onDidLayoutChange(() => render()), editor.onDidFocusEditorText(() => render()),
      editor.onDidChangeConfiguration(() => nodes.forEach(node => editor.applyFontInfo(node)))
    ];
    if (editor.onDidChangeModelLanguage) listeners.push(editor.onDidChangeModelLanguage(() => render(true)));
    const timers = [setTimeout(() => render(), 100), setTimeout(() => render(), 1000)];
    editor.onDidDispose(() => { navigator?.remove();timers.forEach(clearTimeout); listeners.forEach(listener => listener.dispose()); nodes.forEach(node => node.remove()); state.editors.delete(entry); });
    render();
  });
}
