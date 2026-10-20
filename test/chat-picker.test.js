const test=require('node:test');
const assert=require('node:assert/strict');
const {chatPickerItems}=require('../src/chat-picker');
test('picker distinguishes pending reviews, warnings and caught-up chats without exposing IDs or paths',()=>{
  const sessions=[{key:'a',title:'Pending',reviewSummary:{files:2,warnings:0}},{key:'b',title:'Conflicting',reviewSummary:{files:0,warnings:1}},{key:'c',title:'Done',files:[{path:'/private/path'}],sessionId:'raw-id',reviewSummary:{files:0,warnings:0}}];
  const items=chatPickerItems(sessions,'b');
  assert.equal(items[0].label,'$(diff) Pending');
  assert.equal(items[0].description,'2 files ready to review');
  assert.equal(items[1].label,'$(warning) Conflicting');
  assert.match(items[1].description,/1 unresolved file · Selected/);
  assert.equal(items[2].label,'$(check) Done');
  assert.equal(items[2].description,'Caught up');
  assert.ok(items.every(i=>!i.detail));
});
