// Codex command hook: consumes stdin, never changes source files or blocks tools.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const LIMIT = 1024 * 1024;
const EXCLUDED = new Set(['.git', '.codex', '.prototype-runtime', 'node_modules']);
const defaultStore = path.resolve(__dirname, '../.prototype-runtime/captures');
function atomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function contained(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function safePath(root, name) {
  const file = path.resolve(root, name);
  if (!contained(root, file)) throw Error('Patch path is outside the checkout');
  const relative = path.relative(root, file);
  if (relative.split(path.sep).some(p => EXCLUDED.has(p))) throw Error('Excluded capture path');
  // Check every existing ancestor, including symlinks and missing new-file parents.
  let ancestor = file;
  while (true) {
    try { fs.lstatSync(ancestor); break; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  const resolved = fs.realpathSync(ancestor);
  if (resolved !== root && !contained(root, resolved)) throw Error('Symlink escapes checkout');
  return file;
}
function snapshot(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > LIMIT) throw Error('Only text files up to 1 MiB are supported');
    const bytes = fs.readFileSync(file);
    if (bytes.length > LIMIT || bytes.includes(0)) throw Error('Unsupported file');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { exists: true, text };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, text: '' };
    throw error;
  }
}
function pathsFromPatch(command) {
  if (typeof command !== 'string' || !command.trimStart().startsWith('*** Begin Patch')) throw Error('Unknown patch format');
  return [...new Set(command.split(/\r?\n/).flatMap(line => {
    const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
    return match ? [match[1]] : [];
  }))];
}
// Bound the scan; abort the whole snapshot rather than interpret a partial scan as deletions.
function workspaceSnapshot(root, store) {
  const files = Object.create(null);
  let count = 0, bytes = 0;
  const started = Date.now();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (++count > 20000 || Date.now() - started > 6000) throw Error('Workspace capture scan limit exceeded');
      if (EXCLUDED.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (file === path.resolve(store) || contained(path.resolve(store), file)) continue;
      if (entry.isSymbolicLink()) { files[file] = null; continue; }
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile()) { files[file] = null; continue; }
      try {
        const value = snapshot(file);
        bytes += Buffer.byteLength(value.text);
        if (bytes > 64 * LIMIT) throw Error('Workspace capture size limit exceeded');
        files[file] = value;
      } catch (error) {
        if (bytes > 64 * LIMIT) throw error;
        files[file] = null; // Unsupported is not the same as deleted.
      }
    }
  }
  walk(root);
  return files;
}
function saveOriginal(session, file, before) {
  const target = path.join(session, 'original', `${hash(file)}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  try { fs.writeFileSync(target, JSON.stringify({ path: file, ...before }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
function capture(event, store = defaultStore) {
  if (!['PreToolUse', 'PostToolUse'].includes(event.hook_event_name)) return;
  if (typeof event.session_id !== 'string' || !event.session_id || typeof event.tool_use_id !== 'string' || !event.tool_use_id) throw Error('Missing hook identifiers');
  const cwd = fs.realpathSync(event.cwd);
  const session = path.join(store, hash(cwd), hash(event.session_id));
  const pendingPath = path.join(session, 'pending', `${hash(event.tool_use_id)}.json`);
  if (event.hook_event_name === 'PreToolUse') {
    if (event.tool_name !== 'apply_patch') {
      atomic(pendingPath, { cwd, workspace: workspaceSnapshot(cwd, store) });
      return;
    }
    const files = [];
    for (const name of pathsFromPatch(event.tool_input?.command)) {
      try {
        const file = safePath(cwd, name);
        const before = snapshot(file);
        const id = hash(file);
        const originalPath = path.join(session, 'original', `${id}.json`);
        fs.mkdirSync(path.dirname(originalPath), { recursive: true, mode: 0o700 });
        try { fs.writeFileSync(originalPath, JSON.stringify({ path: file, ...before }), { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        files.push({ path: file, id });
      } catch (error) { console.error(`[Codex Diffs] Skipped ${name}: ${error.message}`); }
    }
    atomic(pendingPath, { files, cwd });
    return;
  }
  if (!fs.existsSync(pendingPath)) return; // Never invent a baseline after an edit.
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  if (pending.cwd !== cwd) throw Error('Hook working directory changed');
  if (pending.workspace) {
    const after = workspaceSnapshot(cwd, store);
    const absent = { exists: false, text: '' };
    pending.files = [];
    for (const file of new Set([...Object.keys(pending.workspace), ...Object.keys(after)])) {
      const before = Object.hasOwn(pending.workspace, file) ? pending.workspace[file] : absent;
      const result = Object.hasOwn(after, file) ? after[file] : absent;
      if (!before || !result || (before.exists === result.exists && before.text === result.text)) continue;
      // Save only changed files, so read-only tools do not pin stale chat baselines.
      safePath(cwd, file);
      saveOriginal(session, file, before);
      pending.files.push({ path: file, id: hash(file), after: result });
    }
  }
  for (const file of pending.files) {
    try {
      safePath(cwd, file.path);
      const original = JSON.parse(fs.readFileSync(path.join(session, 'original', `${file.id}.json`), 'utf8'));
      atomic(path.join(session, 'files', `${file.id}.json`), {
        path: file.path, before: { exists: original.exists, text: original.text }, after: file.after || snapshot(file.path), updatedAt: Date.now()
      });
    } catch (error) { console.error(`[Codex Diffs] Could not capture result: ${error.message}`); }
  }
  atomic(path.join(session, 'session.json'), { sessionId: event.session_id, cwd, updatedAt: Date.now() });
  fs.unlinkSync(pendingPath);
}
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; if (input.length > 8 * LIMIT) { console.error('[Codex Diffs] Hook payload too large'); process.exit(0); } });
  process.stdin.on('end', () => {
    try { capture(JSON.parse(input), process.argv[2] || defaultStore); }
    catch (error) { console.error(`[Codex Diffs] ${error.message}`); }
  });
}
module.exports = { capture, pathsFromPatch, safePath, snapshot, defaultStore };
