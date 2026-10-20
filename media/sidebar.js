const api=acquireVsCodeApi();
let state={files:[]},waiting=false;
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
function send(message){waiting=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);api.postMessage(message);}
document.getElementById('chat').onclick=()=>send({type:'chat'});
for(const action of ['accept','reject'])document.getElementById(action).onclick=()=>send({type:'all',action,selection:state.selection,files:state.files.filter(f=>f.hunks?.length&&!f.warning).map(f=>({reviewKey:f.reviewKey,reviewVersion:f.reviewVersion,expected:f.after}))});
window.addEventListener('message',event=>{
  state=event.data;if(state.done)waiting=false;

  const available=state.files.filter(f=>!f.warning).reduce((n,f)=>n+(f.hunks?.length||0),0);
  const skipped=state.files.filter(f=>f.warning).length;
  const readyFiles=state.files.filter(f=>!f.warning&&f.hunks?.length).length;
  document.getElementById('summary').textContent=state.chat?`${available} ${available===1?'block':'blocks'} in ${readyFiles} ${readyFiles===1?'file':'files'} ready to review${skipped?` · ${skipped} unresolved ${skipped===1?'file':'files'}`:''}`:'Waiting for captured changes';
  document.getElementById('notice').textContent=state.notice||(skipped?`Accept all / Reject all apply only to ready blocks. Resolve the ${skipped} unresolved ${skipped===1?'file':'files'} below separately.`:'Reviewing the selected chat. Rejected changes stay unsaved; undo is available in each file.');
  const container=document.getElementById('files');const scroll=window.scrollY;container.replaceChildren();
  for(const file of state.files){
    if(!file.hunks?.length&&!file.warning)continue;
    const section=el('section');section.append(el('h2',file.name));
    if(file.detached)section.append(el('p','This chat’s change is shown below. Reject preserves later edits or stops if they conflict.','empty'));
    if(file.warning)section.append(el('p',file.warning,'empty'));
    if(file.resolution){
      const actions=el('div',undefined,'actions');
      for(const [action,label] of [['resolve','Resolve incoming edits']]){
        const button=el('button',label);button.disabled=waiting;
        button.onclick=()=>send({type:'resolve',action,reviewKey:file.reviewKey});actions.append(button);
      }
      section.append(actions);
    }
    for(const h of file.hunks||[]){
      const actions=el('div',undefined,'actions');
      for(const [action,label] of [['accept','Accept'],['reject','Reject'],['open','Open file']]){
        const button=el('button',label);button.disabled=waiting||!!file.warning;
        button.onclick=()=>send({type:'block',action,reviewKey:file.reviewKey,reviewVersion:file.reviewVersion,expected:file.after,block:h.block});actions.append(button);
      }
      section.append(actions);const code=el('div',undefined,'code');
      code.append(el('pre',`@@ line ${h.start+1} · −${h.removed.length} +${h.added.length} @@`,'range'));
      const lines=file.after.split(/\r?\n/);
      for(const line of lines.slice(Math.max(0,h.start-2),h.start))code.append(el('pre','  '+line));
      for(const line of h.removed)code.append(el('pre','− '+line,'removed'));
      for(const line of h.added)code.append(el('pre','+ '+line,'added'));
      for(const line of lines.slice(h.start+h.added.length,h.start+h.added.length+2))code.append(el('pre','  '+line));
      section.append(code);
    }container.append(section);
  }
  if(!container.childNodes.length)container.append(el('p',state.chat?'You’re all caught up. New changes from this chat will appear here.':'Make a Codex edit to start reviewing.','empty'));
  document.getElementById('chat').textContent=`${state.chat||'Select a chat'} ▾`;
  document.getElementById('chat').title='Switch chat — see which chats have pending changes';
  document.getElementById('chat').disabled=waiting;
  for(const action of ['accept','reject'])document.getElementById(action).disabled=waiting||!available;
  window.scrollTo(0,scroll);
});
api.postMessage({type:'ready'});
