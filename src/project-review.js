const {hunks}=require('./diff');
// Map captured line boundaries onto the current document. Display projection is
// separate from review state: inverse/reject still uses the captured base.
function projectReview(document,current) {
  if(document.after===current)return document;
  const edits=hunks(document.after,current,false);
  if(edits===null)return null;
  let delta=0;
  const ranges=edits.map(h=>{
    const start=h.start-delta;
    delta+=h.added.length-h.removed.length;
    return {start,end:start+h.removed.length,count:h.added.length};
  });
  function boundary(line,endBias=false){
    let shift=0;
    for(const e of ranges){
      if(line<e.start)break;
      if(e.start===e.end){if(line>e.start||!endBias)shift+=e.count;continue;}
      if(line>=e.end){shift+=e.count-(e.end-e.start);continue;}
      return e.start+shift+(endBias?e.count:0);
    }
    return line+shift;
  }
  const lines=current.split(/\r?\n/);
  return {...document,detached:false,after:current,hunks:document.hunks.map(h=>{
    const start=Math.max(0,Math.min(lines.length-1,boundary(h.start)));
    const end=Math.max(start,Math.min(lines.length,boundary(h.start+h.added.length,true)));
    return {...h,start,added:lines.slice(start,end)};
  })};
}
module.exports={projectReview};
