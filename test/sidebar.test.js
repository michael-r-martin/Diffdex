const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

test('bulk buttons submit eligible files despite warnings and unlock on completion',()=>{
  const nodes=[],ids={},sent=[];let receive;
  function node(){const n={childNodes:[],disabled:false,append(...children){this.childNodes.push(...children);},replaceChildren(){this.childNodes=[];}};nodes.push(n);return n;}
  const document={createElement:node,getElementById:id=>ids[id]??=node(),querySelectorAll:()=>nodes};
  const context={document,acquireVsCodeApi:()=>({postMessage:m=>sent.push(m)}),window:{addEventListener:(_,fn)=>receive=fn,scrollY:0,scrollTo(){}}};
  vm.runInNewContext(fs.readFileSync('media/sidebar.js','utf8'),context);
  const file={name:'a.js',reviewKey:'chat:a',reviewVersion:'v1',after:'new',hunks:[{start:0,block:0,removed:['old'],added:['new']}]};
  const state={selection:'chat',chat:'chat',files:[file,{name:'unavailable.js',warning:'Unavailable',hunks:[]}]};
  receive({data:state});
  for(const action of ['accept','reject']){
    assert.equal(ids[action].disabled,false);
    ids[action].onclick();
    assert.equal(sent.at(-1).action,action);
    assert.equal(sent.at(-1).files.length,1);
    assert.equal(sent.at(-1).files[0].reviewKey,'chat:a');
    assert.equal(ids[action].disabled,true);
    receive({data:{...state,done:true}});
    assert.equal(ids[action].disabled,false);
  }
  assert.match(ids.notice.textContent,/1 unresolved file/);
  receive({data:{...state,files:[state.files[1]]}});
  assert.equal(ids.accept.disabled,true);
  assert.equal(ids.reject.disabled,true);
  receive({data:{...state,done:true,files:[{name:'old.js',reviewKey:'chat:old',warning:'Overlap',resolution:'incoming',hunks:[]}]}});
  const keep=nodes.find(n=>n.textContent==='Resolve incoming edits');
  assert.ok(keep);assert.equal(keep.disabled,false);keep.onclick();
  assert.equal(sent.at(-1).type,'resolve');assert.equal(sent.at(-1).action,'resolve');
  assert.equal(sent.at(-1).reviewKey,'chat:old');
});
