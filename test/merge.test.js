const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mergeText}=require('../src/merge');
test('incoming changes combine with unrelated unsaved typing',()=>{
  assert.deepEqual(mergeText('a\nb\nc','mine\nb\nc','a\nb\ncodex'),{text:'mine\nb\ncodex'});
  assert.deepEqual(mergeText('a\nb\nc','a\nextra\nb\nc','a\nb\nnew'),{text:'a\nextra\nb\nnew'});
});
test('conflicting rejection or typing is preserved for explicit resolution',()=>{
  assert.deepEqual(mergeText('generated','original','new generated'),{conflict:true});
  assert.deepEqual(mergeText('a\nb','a\nmine\nb','a\nother\nb'),{conflict:true});
});
test('identical edits are deduplicated and clean buffers take incoming changes',()=>{
  assert.deepEqual(mergeText('a\nb','x\nb','x\nb'),{text:'x\nb'});
  assert.deepEqual(mergeText('a','a','new'),{text:'new'});
});
