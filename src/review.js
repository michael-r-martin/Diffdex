const { hunks } = require('./diff');

// Track the editable span of each captured block. Unrelated typing never joins
// the review merely because it differs from the chat's original snapshot.
class Review {
  constructor(before, after) {
    this.text = after;
    const changes = hunks(before, after);
    this.supported = changes !== null;
    const starts = [0];
    for (let i=0;i<after.length;i++) if (after[i]==='\n') starts.push(i+1);
    this.regions = (changes || []).map(h => {
      const start = starts[h.start] ?? after.length;
      const last = h.start + h.added.length - 1;
      const end = h.added.length ? (starts[last] ?? after.length) + h.added.at(-1).length : start;
      return {start,end,original:h.removed.join('\n'),eofDeletion:h.added.length===0&&h.start>=starts.length};
    });
    this.history = new Map();
    this.rejections = [];
    this.remember();
  }
  remember() {
    this.history.set(this.text, this.regions.map(r=>({...r})));
    if (this.history.size > 64) this.history.delete(this.history.keys().next().value);
  }
  update(changes, next, undoRedo = false) {
    if (!changes.length && next===this.text) return;
    if (undoRedo) {
      for (const record of [...this.rejections].reverse()) {
        const target=next===record.before.text&&this.text===record.after.text ? record.before
          : next===record.after.text&&this.text===record.before.text ? record.after : null;
        if (target) {
          this.regions=target.regions.map(r=>({...r}));
          this.text=next;this.remember();return;
        }
      }
    }
    if (undoRedo && this.history.has(next)) {
      this.regions = this.history.get(next).map(r=>({...r}));
      this.text = next;
      return;
    }
    for (const edit of [...changes].sort((a,b)=>b.rangeOffset-a.rangeOffset)) {
      const start=edit.rangeOffset, end=start+edit.rangeLength, delta=edit.text.length-edit.rangeLength;
      for (const r of this.regions) {
        const insertion = edit.rangeLength===0;
        const newLineBefore = insertion && start===r.start && edit.text.includes('\n');
        const newLineAfter = insertion && start===r.end && /^\r?\n/.test(edit.text);
        if (newLineBefore || (end<=r.start && !(insertion && start===r.start && r.start!==r.end))) {
          // A line inserted at the top belongs outside the captured block.
          r.start+=delta; r.end+=delta;
        } else if (newLineAfter || start>r.end || (start===r.end && !insertion)) {
          // Enter at the final column starts independent code.
        } else {
          r.start=Math.min(r.start,start);
          r.end=end>=r.end ? start+edit.text.length : r.end+delta;
        }
      }
    }
    this.text=next;
    this.remember();
  }
  getHunks() {
    if (!this.supported) return null;
    return this.regions.flatMap((r,index) => {
      const line=this.text.slice(0,r.start).split('\n').length-1+(r.eofDeletion?1:0);
      const current=this.text.slice(r.start,r.end);
      if (r.original===current) return [];
      return [{start:line,removed:r.original===''?[]:r.original.split('\n'),added:current===''?[]:current.split('\n'),block:index}];
    });
  }
  accept(block) {
    if (!this.getHunks()?.some(h=>h.block===block)) return false;
    this.regions.splice(block,1);
    this.history.clear(); this.remember();
    return true;
  }
  recordRejection(before) {
    this.rejections.push({before,after:{text:this.text,regions:this.regions.map(r=>({...r}))}});
    if(this.rejections.length>64) this.rejections.shift();
  }
  rejection(block) {
    const h=this.getHunks()?.find(h=>h.block===block);
    if (!h) return null;
    const eol=this.text.includes('\r\n')?'\r\n':'\n';
    const lines=this.text===''?[]:this.text.split(eol);
    lines.splice(h.start,h.added.length,...h.removed);
    return lines.join(eol);
  }
}
module.exports = { Review };
