const fs = require('node:fs');
const path = require('node:path');
function listSessions(store, roots) {
  const sessions = [];
  if (!fs.existsSync(store)) return sessions;
  for (const repo of fs.readdirSync(store, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const repoDir = path.join(store, repo.name);
    for (const entry of fs.readdirSync(repoDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      try {
        const directory = path.join(repoDir, entry.name);
        const meta = JSON.parse(fs.readFileSync(path.join(directory, 'session.json'), 'utf8'));
        if (roots.length && !roots.includes(meta.cwd)) continue;
        const folder = path.join(directory, 'files');
        const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'))) : [];
        sessions.push({ ...meta, key: `${repo.name}/${entry.name}`, files: files.filter(f => f.before.text !== f.after.text || f.before.exists !== f.after.exists) });
      } catch { /* Atomic records may appear between directory enumeration and read. */ }
    }
  }
  return sessions.sort((a,b) => b.updatedAt - a.updatedAt);
}
module.exports = { listSessions };
