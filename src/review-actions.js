const {mergeText}=require('./merge');
// Compute an inverse change against the live buffer, never write a stored file
// snapshot over it. A conflict is a failed action, not a third review state.
function planRejection(review,block,current) {
  const target=review.rejection(block);
  if(target===null)return {missing:true};
  return mergeText(review.text,current,target);
}
// Use the last review's effective baseline, not the chat's first snapshot.
// Accepted regions are absent from getHunks(), so later captures cannot resurrect them.
function advanceReview(previous,after) {
  const {Review}=require('./review');
  const pending=previous.getHunks();
  if(pending===null)return null;
  const eol=previous.text.includes('\r\n')?'\r\n':'\n';
  const lines=previous.text===''?[]:previous.text.split(eol);
  for(const h of [...pending].sort((a,b)=>b.start-a.start))lines.splice(h.start,h.added.length,...h.removed);
  return new Review(lines.join(eol),after);
}
module.exports={planRejection,advanceReview};
