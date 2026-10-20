const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Review}=require('../src/review');
const {rebaseReview,combineDocuments}=require('../src/combined');
test('older chat reanchors across separate changes without claiming new code',()=>{
  const review=new Review('first\nold\nanchor\nlast\n','first\nnew\nanchor\nlast\n');
  assert.equal(rebaseReview(review,'intro\nfirst\nnew\nanchor\nchanged last\n'),true);
  assert.deepEqual(review.getHunks().map(h=>({start:h.start,added:h.added})),[{start:2,added:['new']}]);
  assert.equal(review.rejection(0),'intro\nfirst\nold\nanchor\nchanged last\n');
  assert.equal(rebaseReview(review,'intro\nfirst\noverlap\nanchor\nchanged last\n'),false);
});
test('combined files preserve per-chat action identity, deduplicate files and prefer newer overlaps',()=>{
  const doc={uri:'file:///a',after:'one\ntwo\nthree',reviewKey:'old',reviewVersion:'v1',updatedAt:1,hunks:[{start:0,added:['one'],removed:['old'],block:0}]};
  const other={...doc,reviewKey:'new',updatedAt:2,hunks:[{start:2,added:['three'],removed:['older'],block:0}]};
  const combined=combineDocuments([doc,other]);
  assert.equal(combined.length,1);
  assert.deepEqual(combined[0].hunks.map(h=>h.reviewKey),['old','new']);
  assert.equal(combineDocuments([doc,{...other,hunks:doc.hunks}])[0].hunks[0].reviewKey,'new');
  assert.equal(combineDocuments([{...doc,hunks:[]}]).length,0);
  assert.equal(combineDocuments([{...doc,warning:'conflict'}]).length,0);
});
const {reconcileReview}=require('../src/combined');
test('exact restored changes clear automatically, including unrelated surrounding edits',()=>{
  const review=new Review('top\nold\nbottom\n','top\nnew\nbottom\n');
  assert.equal(reconcileReview(review,'intro\ntop\nold\nbottom\n'),true);
  assert.deepEqual(review.getHunks(),[]);
});
test('incorporated but unaccepted changes remain pending; ambiguous replacements remain untouched',()=>{
  const review=new Review('top\nold\nbottom\n','top\nnew\nbottom\n');
  assert.equal(reconcileReview(review,'intro\ntop\nnew\nbottom\n'),true);
  assert.equal(review.getHunks().length,1);
  const before=JSON.stringify([review.text,review.regions]);
  assert.equal(reconcileReview(review,'intro\ntop\nother\nbottom\n'),false);
  assert.equal(JSON.stringify([review.text,review.regions]),before);
});
test('accepted review remains resolved after subsequent edits',()=>{
  const review=new Review('old\n','new\n');review.accept(0);
  assert.equal(reconcileReview(review,'completely different\n'),true);
  assert.deepEqual(review.getHunks(),[]);
});
test('repeated original text elsewhere does not resolve an overlapping replacement',()=>{
  const review=new Review('old\nseparator\nold\n','new\nseparator\nold\n');
  assert.equal(reconcileReview(review,'other\nseparator\nold\n'),false);
});
test('partial exact restoration preserves other pending blocks and full restoration clears both',()=>{
  const before='old one\nanchor\nanchor two\nold two\n';
  const after='new one\nanchor\nanchor two\nnew two\n';
  const review=new Review(before,after);
  assert.equal(reconcileReview(review,'old one\nanchor\nanchor two\nnew two\n'),true);
  assert.equal(review.getHunks().length,1);
  assert.equal(reconcileReview(review,before),true);
  assert.equal(review.getHunks().length,0);
});
test('replacement at the site of a reverted insertion is not automatically cleared',()=>{
  const review=new Review('top\nbottom\n','top\ninserted\nbottom\n');
  assert.equal(reconcileReview(review,'top\ndifferent\nbottom\n'),false);
});
test('latest review preserves pending originals through overlapping later edits without claiming unrelated changes',()=>{
  const {reconcileLatestReview}=require('../src/combined');
  const review=new Review('header\nold\nanchor\nfooter\n','header\nnew\nanchor\nfooter\n');
  assert.equal(reconcileLatestReview(review,'personal header\nnew revised\nanchor\nfooter\n'),true);
  assert.deepEqual(review.getHunks().map(h=>({removed:h.removed,added:h.added})),[{removed:['old'],added:['new revised']}]);
  assert.equal(review.rejection(0),'personal header\nold\nanchor\nfooter\n');
});
test('latest review refuses ambiguous edits spanning pending and unrelated content',()=>{
  const {reconcileLatestReview}=require('../src/combined');
  const review=new Review('header\nold\nfooter\n','header\nnew\nfooter\n');
  const before=JSON.stringify([review.text,review.regions]);
  assert.equal(reconcileLatestReview(review,'entire replacement\nfooter\n'),false);
  assert.equal(JSON.stringify([review.text,review.regions]),before);
});
