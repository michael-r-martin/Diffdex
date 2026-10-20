const { hunks } = require('./diff');
// Merge independently changed lines against the last captured disk version.
// Ambiguous overlaps are conflicts, never an excuse to discard the editor buffer.
function mergeText(base, local, incoming) {
  if (local===incoming || incoming===base) return {text:local};
  if (local===base) return {text:incoming};
  function edits(text) {
    const changes=hunks(base,text,false);
    if (!changes) return null;
    let delta=0;
    return changes.map(h=>{
      const start=h.start-delta;
      delta+=h.added.length-h.removed.length;
      return {start,end:start+h.removed.length,lines:h.added};
    });
  }
  const a=edits(local),b=edits(incoming);
  if (!a || !b) return {conflict:true};
  const all=[...a];
  for (const incomingEdit of b) {
    let duplicate=false;
    for (const localEdit of a) {
      if (JSON.stringify(incomingEdit)===JSON.stringify(localEdit)) { duplicate=true; continue; }
      const x=incomingEdit,y=localEdit;
      const overlaps=x.start===x.end ? x.start>=y.start&&x.start<=y.end
        : y.start===y.end ? y.start>=x.start&&y.start<=x.end
        : x.start<y.end&&y.start<x.end;
      if (overlaps) return {conflict:true};
    }
    if (!duplicate) all.push(incomingEdit);
  }
  const lines=base===''?[]:base.replace(/\r\n/g,'\n').split('\n');
  for (const edit of all.sort((x,y)=>y.start-x.start)) lines.splice(edit.start,edit.end-edit.start,...edit.lines);
  return {text:lines.join(local.includes('\r\n')?'\r\n':'\n')};
}
module.exports={mergeText};
