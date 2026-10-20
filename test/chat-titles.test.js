const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createTitleReader}=require('../src/chat-titles');
test('titles tolerate missing and partial metadata and follow renames without conflating IDs',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-title-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'index.jsonl'),read=createTitleReader(file);
  assert.equal(read().size,0);
  fs.writeFileSync(file,'{"id":"a","thread_name":"Original"}\n{"id":"b","thread_name":"Original"}\n{');
  assert.equal(read().get('a'),'Original');assert.equal(read().get('b'),'Original');
  fs.appendFileSync(file,'}\n{"id":"a","thread_name":"Renamed chat"}\n');
  assert.equal(read().get('a'),'Renamed chat');assert.equal(read().get('b'),'Original');
  fs.unlinkSync(file);assert.equal(read().size,0);
});
