const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('renders real payload automatically, switches chats, and refuses stale contents', async () => {
  const events = {}, zones = new Map(), elements = [], buttons = [], calls = [];
  let host = null, model = null, next = 0, text = 'new\n', version=1;
  const uri='file:///project/a.js';
  const fixture = { uri:{scheme:'file',toString:()=>uri},getLineCount:()=>text.split('\n').length,getValue:()=>text,getVersionId:()=>version };
  const editor = {
    getDomNode:()=>host,getModel:()=>model,getPosition(){throw Error('Cursor must not be used');},applyFontInfo(){},focus(){},
    changeViewZones(cb){cb({addZone(z){const id=String(++next);zones.set(id,z);return id;},removeZone(id){zones.delete(id);}});},
    createDecorationsCollection(){return {clear(){}};}
  };
  for(const name of ['onDidChangeModel','onDidChangeModelContent','onDidLayoutChange','onDidFocusEditorText','onDidChangeConfiguration','onDidDispose'])editor[name]=cb=>{events[name]=cb;return {dispose(){}};};
  const context=vm.createContext({__codexDiffLabCommand:async (...args)=>{calls.push(args);return true;},queueMicrotask,setTimeout:()=>1,clearTimeout(){},console,document:{getElementById:()=>null,head:{appendChild(){}},createElement(tag){elements.push(tag);const node={style:{},setAttribute(){},remove(){},appendChild(){},addEventListener(name,fn){this[name]=fn;}};if(tag==='button')buttons.push(node);return node;}}});
  vm.runInContext(fs.readFileSync('prototype/runtime-overlay.js','utf8'),context);
  context.__codexDiffLabAttach(editor);await new Promise(resolve=>queueMicrotask(resolve));
  const payload={documents:[{uri,after:'new\n',hunks:[{start:0,removed:['old','older'],added:['new']}]}]};
  context.__codexDiffLabUpdate(payload);assert.equal(zones.size,0);
  host={};model=fixture;events.onDidChangeModel();assert.equal(zones.size,1);assert.equal([...zones.values()][0].afterLineNumber,0);
  assert.equal([...zones.values()][0].domNode.textContent,'− old\n− older');
  assert.ok(!elements.includes('button'));
  text='user edit\n';version++;events.onDidChangeModelContent();assert.equal(zones.size,1);
  assert.equal(context.__codexDiffLabUpdate(payload)[0].status,'rendered');
  text='new\n';version++;events.onDidChangeModelContent();assert.equal(zones.size,1);
  context.__codexDiffLabUpdate({documents:[]});assert.equal(zones.size,0);
  model={...fixture,uri:{scheme:'vscode-chat-input',toString:()=>uri}};context.__codexDiffLabUpdate(payload);assert.equal(zones.size,0);
  model=fixture;
  const actionable={documents:[{...payload.documents[0],reviewKey:'chat:file',hunks:[{...payload.documents[0].hunks[0],block:0}]}]};
  context.__codexDiffLabUpdate(actionable);
  assert.equal(buttons.length,2);
  await buttons[0].click({preventDefault(){},stopPropagation(){}});
  assert.equal(calls[0][1],'codexDiff.reviewBlock');
  assert.equal(calls[0][2].action,'accept');
  await buttons[1].click({preventDefault(){},stopPropagation(){}});
  assert.equal(calls[1][2].action,'reject');
  text='changed since render';
  await buttons[0].click({preventDefault(){},stopPropagation(){}});
  assert.equal(calls.length,2);
  host={appendChild(){}};
  text='new\n';
  const initialButtons=buttons.length;
  context.__codexDiffLabUpdate({...actionable,changedFiles:[uri,'file:///project/b.js']});
  const navigation=buttons.slice(initialButtons).find(button=>button.textContent==='→');
  assert.ok(navigation);
  await navigation.click({preventDefault(){},stopPropagation(){}});
  assert.equal(calls.at(-1)[1],'codexDiff.navigateChanged');
  assert.equal(calls.at(-1)[2].direction,1);
  const beforeEmpty=buttons.length;
  const empty=context.__codexDiffLabUpdate({documents:[],changedFiles:[]});
  assert.equal(empty[0].navigator,true);
  const emptyArrows=buttons.slice(beforeEmpty).filter(b=>b.textContent==='←'||b.textContent==='→');
  assert.equal(emptyArrows.length,2);
  assert.ok(emptyArrows.every(b=>b.disabled));


});
