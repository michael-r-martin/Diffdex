const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

// Best-effort adapter for Codex's local metadata, not a public API contract.
// Keep session IDs as identity; titles may change or be duplicated.
function createTitleReader(indexPath=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'session_index.jsonl')) {
  let stamp, titles=new Map();
  return function readTitles(){
    try{
      const stat=fs.statSync(indexPath), next=`${stat.mtimeMs}:${stat.size}`;
      if(next===stamp)return titles;
      if(stat.size>16*1024*1024)return new Map();
      const result=new Map();
      for(const line of fs.readFileSync(indexPath,'utf8').split('\n')){
        try{
          const item=JSON.parse(line);
          if(typeof item.id==='string'&&typeof item.thread_name==='string'&&item.thread_name.trim())result.set(item.id,item.thread_name.trim());
        }catch{/* Ignore partial append records. */}
      }
      titles=result;stamp=next;return titles;
    }catch{stamp=undefined;titles=new Map();return titles;}
  };
}
module.exports={createTitleReader};
