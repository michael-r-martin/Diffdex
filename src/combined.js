const {hunks}=require('./diff');

// Re-anchor an older chat across unrelated edits, but never attribute another
// chat's overlapping replacement to it.
function rebaseReview(review,next,protectBoundaries=false,trackOverlaps=false) {
  if(review.text===next)return true;
  let changes=hunks(review.text,next,false);
  if(!changes)return false;
  if(trackOverlaps)changes=changes.flatMap(h=>h.removed.length===h.added.length?h.removed.map((line,i)=>({start:h.start+i,removed:[line],added:[h.added[i]]})): [h]);
  const old=review.text,lines=old.split('\n'),starts=[0];
  for(let i=0;i<old.length;i++)if(old[i]==='\n')starts.push(i+1);
  let delta=0;
  const edits=changes.map(h=>{
    const index=h.start-delta;delta+=h.added.length-h.removed.length;
    let start=starts[index]??old.length,end=starts[index+h.removed.length]??old.length;
    let text=h.added.join('\n');
    if(h.added.length&&index+h.removed.length<lines.length)text+='\n';
    if(trackOverlaps){
      while(end>start&&text.length&&old[end-1]===text.at(-1)){end--;text=text.slice(0,-1);}
      while(start<end&&text.length&&old[start]===text[0]){start++;text=text.slice(1);}
    }
    return {rangeOffset:start,rangeLength:end-start,text};
  });
  let reconstructed=old;
  for(const e of [...edits].reverse())reconstructed=reconstructed.slice(0,e.rangeOffset)+e.text+reconstructed.slice(e.rangeOffset+e.rangeLength);
  if(reconstructed!==next)return false;
  if(!trackOverlaps&&edits.some(e=>review.regions.some(r=>e.rangeLength ? e.rangeOffset<r.end&&e.rangeOffset+e.rangeLength>r.start || r.start===r.end&&e.rangeOffset<=r.start&&e.rangeOffset+e.rangeLength>r.start : (protectBoundaries?e.rangeOffset>=r.start&&e.rangeOffset<=r.end:e.rangeOffset>r.start&&e.rangeOffset<r.end))))return false;
  if(trackOverlaps&&edits.some(e=>review.regions.some(r=>e.rangeLength&&e.rangeOffset<r.end&&e.rangeOffset+e.rangeLength>r.start&&(e.rangeOffset<r.start||e.rangeOffset+e.rangeLength>r.end))))return false;
  review.update(edits,next);
  return true;
}

// Trial changes touch review metadata only. Protect restored spans so an arbitrary
// replacement cannot be mistaken for an exact restoration of the original text.
function reconcileReview(review, next) {
  if (rebaseReview(review,next)) return true;
  if (!review.supported) return false;
  const {Review}=require('./review');
  const clone=source=>{
    const trial=Object.assign(new Review('',''),source);
    trial.regions=source.regions.map(r=>({...r}));
    trial.history=new Map(source.history);
    trial.rejections=[...source.rejections];
    return trial;
  };
  // Test one restoration and the complete restoration. Never search for similar
  // strings elsewhere in the file: repeated code must not count as evidence.
  const blocks=review.getHunks().map(h=>h.block);
  const candidates=blocks.map(block=>[block]);
  if(blocks.length>1)candidates.push([...blocks].reverse());
  for(const candidate of candidates){
    const trial=clone(review);
    for(const block of candidate){
      const restored=trial.rejection(block);
      if(restored===null)continue;
      let start=0,end=trial.text.length,newEnd=restored.length;
      while(start<end&&start<newEnd&&trial.text[start]===restored[start])start++;
      while(end>start&&newEnd>start&&trial.text[end-1]===restored[newEnd-1]){end--;newEnd--;}
      trial.update([{rangeOffset:start,rangeLength:end-start,text:restored.slice(start,newEnd)}],restored);
    }
    if(!candidate.every(block=>trial.regions[block]&&trial.text.slice(trial.regions[block].start,trial.regions[block].end)===trial.regions[block].original))continue;
    if(!rebaseReview(trial,next,true))continue;
    if(!candidate.every(block=>trial.text.slice(trial.regions[block].start,trial.regions[block].end)===trial.regions[block].original))continue;
    // Retain the regions/history: undo can bring the pending review back.
    review.text=trial.text;review.regions=trial.regions;review.history=trial.history;
    return true;
  }
  return false;
}

// The latest capture owns the pending regions for this file. Preserve their
// original sides while mapping subsequent edits onto current text. Unrelated
// edits stay outside those regions; this never applies edits to the document.
function reconcileLatestReview(review,next) {
  return reconcileReview(review,next)||rebaseReview(review,next,false,true);
}

function combineDocuments(documents) {
  const files=new Map();
  for(const doc of [...documents].sort((a,b)=>(Number(b.selected)||0)-(Number(a.selected)||0)||b.updatedAt-a.updatedAt)){
    if(doc.warning||doc.detached||!doc.hunks.length)continue;
    let file=files.get(doc.uri);
    if(!file){file={...doc,hunks:[]};files.set(doc.uri,file);}
    if(file.after!==doc.after)continue;
    for(const h of doc.hunks){
      const end=h.start+Math.max(1,h.added.length);
      if(file.hunks.some(other=>h.start<other.start+Math.max(1,other.added.length)&&end>other.start))continue;
      file.hunks.push({...h,reviewKey:doc.reviewKey,reviewVersion:doc.reviewVersion,chat:doc.chat});
    }
    file.hunks.sort((a,b)=>a.start-b.start);
  }
  return [...files.values()].sort((a,b)=>a.uri.localeCompare(b.uri));
}
module.exports={rebaseReview,reconcileReview,reconcileLatestReview,combineDocuments};
