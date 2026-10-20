const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Review}=require('../src/review');
function edit(r, offset, length, text, undo=false) {
  r.update([{rangeOffset:offset,rangeLength:length,text}],r.text.slice(0,offset)+text+r.text.slice(offset+length),undo);
}
test('Enter at the first green line leaves personal text above the block',()=>{
  const r=new Review('old','new');
  edit(r,0,0,'\n');
  edit(r,0,0,'// my own text');
  assert.deepEqual(r.getHunks(),[{block:0,start:1,removed:['old'],added:['new']}]);
  assert.equal(r.rejection(0),'// my own text\nold');
  r.update([],'\nnew',true);
  r.update([],'new',true);
  assert.equal(r.getHunks()[0].start,0);
  r.update([],'\nnew',true);
  assert.equal(r.getHunks()[0].start,1);
});
test('ordinary typing at the first column still edits the changed code',()=>{
  const r=new Review('old','new');
  edit(r,0,0,'prefix ');
  assert.deepEqual(r.getHunks()[0].added,['prefix new']);
});
test('Enter at the bottom starts unhighlighted code, while inside typing stays reviewed',()=>{
  const r=new Review('top\nold\nbottom','top\nnew\nbottom');
  edit(r,7,0,'\n');
  edit(r,8,0,'my own code');
  assert.deepEqual(r.getHunks(),[{block:0,start:1,removed:['old'],added:['new']}]);
  edit(r,6,0,' typed');
  assert.deepEqual(r.getHunks(),[{block:0,start:1,removed:['old'],added:['ne typedw']}]);
});
test('EOF Enter, autoindent, outside edits, and undo/redo retain boundaries',()=>{
  const r=new Review('old','new');
  edit(r,3,0,'\n  ');
  const entered=r.text;
  edit(r,6,0,'mine');
  assert.deepEqual(r.getHunks(),[{block:0,start:0,removed:['old'],added:['new']}]);
  r.update([],entered,true);
  r.update([],'new',true);
  assert.deepEqual(r.getHunks(),[{block:0,start:0,removed:['old'],added:['new']}]);
  r.update([],entered,true);
  edit(r,6,0,'again');
  assert.deepEqual(r.getHunks()[0].added,['new']);
});
test('multiline edits within a block remain in the diff and restore original clears it',()=>{
  const r=new Review('old\nold2','new\nnew2');
  edit(r,2,0,'\ninside');
  assert.deepEqual(r.getHunks()[0].added,['ne','insidew','new2']);
  edit(r,0,r.text.length,'old\nold2');
  assert.deepEqual(r.getHunks(),[]);
});

test('accept leaves text unchanged and rejects only the chosen block',()=>{
  const r=new Review('old\nanchor\nold2','new\nanchor\nnew2');
  assert.equal(r.rejection(0),'old\nanchor\nnew2');
  assert.equal(r.accept(0),true);
  assert.equal(r.text,'new\nanchor\nnew2');
  assert.equal(r.getHunks().length,1);
  assert.equal(r.rejection(0),'new\nanchor\nold2');
});
test('reject handles insertions and deletions without extra blank lines',()=>{
  for (const [before,after] of [['a\nb','a\nx\nb'],['a\nx\nb','a\nb'],['a','a\nx'],['a\nx','a'],['','new'],['old','']]) {
    const r=new Review(before,after);
    assert.equal(r.rejection(0),before);
  }
});
test('a metadata-only document event during rejection cannot erase undo regions',()=>{
  const r=new Review('old','new');
  r.regions.splice(0,1);
  r.update([],'new'); // VS Code may report dirty-state changes without text edits.
  r.update([{rangeOffset:0,rangeLength:3,text:'old'}],'old');
  r.update([{rangeOffset:0,rangeLength:3,text:'new'}],'new',true);
  assert.equal(r.getHunks().length,1);
});
test('explicit rejection records survive cache resets and support redo',()=>{
  const r=new Review('old','new');
  const before={text:r.text,regions:r.regions.map(region=>({...region}))};
  r.regions.splice(0,1);
  r.update([{rangeOffset:0,rangeLength:3,text:'old'}],'old');
  r.recordRejection(before);
  r.history.clear();r.remember();
  r.update([{rangeOffset:0,rangeLength:3,text:'new'}],'new',true);
  assert.equal(r.getHunks().length,1);
  r.update([{rangeOffset:0,rangeLength:3,text:'old'}],'old',true);
  assert.equal(r.getHunks().length,0);
  r.update([{rangeOffset:0,rangeLength:3,text:'new'}],'new',true);
  assert.equal(r.getHunks().length,1);
});
