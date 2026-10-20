const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Review}=require('../src/review');
const {planRejection}=require('../src/review-actions');
test('rejecting a captured change preserves newer unrelated work',()=>{
 const r=new Review('old\nanchor\nfooter\n','new\nanchor\nfooter\n');
 const initial=JSON.stringify([r.text,r.regions]);
 assert.equal(planRejection(r,0,'new\nanchor\nnewer work\n').text,'old\nanchor\nnewer work\n');
 assert.equal(JSON.stringify([r.text,r.regions]),initial);
});
test('rejection refuses overlapping newer edits without mutating review state',()=>{
 const r=new Review('old\n','new\n');const state=JSON.stringify([r.text,r.regions]);
 assert.equal(planRejection(r,0,'newer work\n').conflict,true);
 assert.equal(JSON.stringify([r.text,r.regions]),state);
});
test('accepting a detached block keeps its decision while unrelated file text stays untouched',()=>{
 const r=new Review('old\n','new\n');const current='newer work\n';
 r.accept(0);assert.equal(r.getHunks().length,0);assert.equal(current,'newer work\n');
 const saved={text:r.text,regions:r.regions,supported:r.supported};
 const restored=Object.assign(new Review('',''),saved);assert.equal(restored.getHunks().length,0);
});
test('later captures do not resurrect accepted blocks but keep new edits pending',()=>{
 const {advanceReview}=require('../src/review-actions');
 const old=new Review('before\nanchor\nold footer\n','accepted\nanchor\nold footer\n');old.accept(0);
 const next=advanceReview(old,'accepted\nanchor\nnew footer\n');
 assert.deepEqual(next.getHunks().map(h=>[h.removed,h.added]),[[['old footer'],['new footer']]]);
});
test('later captures preserve the original side of still pending changes',()=>{
 const {advanceReview}=require('../src/review-actions');
 const old=new Review('before\n','first proposal\n');
 const next=advanceReview(old,'second proposal\n');
 assert.deepEqual(next.getHunks().map(h=>h.removed),[['before']]);
});
