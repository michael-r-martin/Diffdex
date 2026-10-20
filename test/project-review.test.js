const {test}=require('node:test');const assert=require('node:assert/strict');
const {projectReview}=require('../src/project-review');
test('projects captured block across insertions and overlapping replacements without changing source review',()=>{
 const d={after:'header\nold proposal\nfooter\n',detached:true,hunks:[{start:1,added:['old proposal'],removed:['original'],block:4}]};
 const saved=JSON.stringify(d);const p=projectReview(d,'intro\nheader\nnewer work\nfooter\n');
 assert.equal(p.after,'intro\nheader\nnewer work\nfooter\n');assert.equal(p.hunks[0].start,2);
 assert.deepEqual(p.hunks[0].added,['newer work']);assert.deepEqual(p.hunks[0].removed,['original']);
 assert.equal(p.hunks[0].block,4);assert.equal(JSON.stringify(d),saved);
});
test('unchanged captured reviews keep their exact display and identity',()=>{
 const d={after:'text',hunks:[]};assert.equal(projectReview(d,'text'),d);
});
test('boundary insertions remain outside the projected review',()=>{
 const d={after:'top\nproposal\nbottom\n',hunks:[{start:1,added:['proposal'],removed:['original'],block:0}]};
 const p=projectReview(d,'top\npersonal above\nproposal\npersonal below\nbottom\n');
 assert.equal(p.hunks[0].start,2);assert.deepEqual(p.hunks[0].added,['proposal']);
});
