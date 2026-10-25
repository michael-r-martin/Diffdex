const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const limit = 1024 * 1024;

async function git(cwd, args, maxBuffer = 8 * limit) {
  const result = await execute('git', ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-C', cwd, ...args], {
    timeout: 5000, maxBuffer, encoding: 'buffer'
  });
  return result.stdout;
}

function dirtyPaths(output, root) {
  const result = new Set(), entries = output.toString('utf8').split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    result.add(path.resolve(root, entry.slice(3)));
    if (/[RC]/.test(entry.slice(0, 2)) && entries[i + 1]) result.add(path.resolve(root, entries[++i]));
  }
  return result;
}

function captureStamp(file) {
  return createHash('sha256').update(JSON.stringify([file.updatedAt, file.before, file.after])).digest('hex');
}

const sameSnapshot = (left, right) => left.exists === right.exists && left.text === right.text;

function matchesSnapshot(file, snapshot, open) {
  try {
    if (!snapshot.exists) return !fs.existsSync(file);
    if (open) return open.getText() === snapshot.text;
    const stat = fs.lstatSync(file);
    return stat.isFile() && stat.size <= limit && fs.readFileSync(file, 'utf8') === snapshot.text;
  } catch { return false; }
}

function createGitReview(checkpoints = []) {
  const settled = new Map(checkpoints);
  const blobs = new Map();
  async function repository(cwd) {
    try {
      const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).toString('utf8').trimEnd();
      const head = (await git(root, ['rev-parse', '--verify', 'HEAD'])).toString('utf8').trim();
      const status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']);
      if ((await git(root, ['rev-parse', '--verify', 'HEAD'])).toString('utf8').trim() !== head) return null;
      return { root, head, dirty: dirtyPaths(status, root) };
    } catch { return null; } // Non-Git folders and unavailable Git keep their existing reviews.
  }
  async function committedFile(repo, file) {
    const relative = path.relative(repo.root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    const key = `${repo.root}\0${repo.head}\0${relative}`;
    if (blobs.has(key)) return blobs.get(key);
    try {
      const tree = (await git(repo.root, ['ls-tree', '-z', repo.head, '--', relative])).toString('utf8');
      let snapshot;
      if (!tree) snapshot = { exists: false, text: '' };
      else {
        const match = /^(100644|100755) blob ([a-f0-9]+)\t/.exec(tree);
        if (!match) return null;
        const bytes = await git(repo.root, ['cat-file', 'blob', match[2]], limit + 1);
        if (bytes.length > limit || bytes.includes(0)) return null;
        snapshot = { exists: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
      }
      blobs.set(key, snapshot);
      if (blobs.size > 128) blobs.delete(blobs.keys().next().value);
      return snapshot;
    } catch { return null; }
  }
  return {
    checkpoints: () => [...settled],
    async reconcile(sessions, documents = [], getReview = () => undefined) {
      const repositories = new Map(), cleared = [];
      let changed = false;
      const result = [];
      for (const session of sessions) {
        if (!session.files.length) { result.push(session); continue; }
        if (!repositories.has(session.cwd)) repositories.set(session.cwd, await repository(session.cwd));
        const repo = repositories.get(session.cwd);
        const files = [];
        for (const file of session.files) {
          const key = `${session.key}\0${file.path}`, stamp = captureStamp(file);
          const open = documents.find(doc => doc.uri.fsPath === file.path);
          let previous = settled.get(key);
          if (previous && repo && previous.head !== repo.head) {
            const baseline = await committedFile(repo, file.path);
            if (baseline) {
              if (baseline.exists !== previous.baseline.exists || baseline.text !== previous.baseline.text) cleared.push({ chat: session.key, path: file.path });
              previous = { ...previous, head: repo.head, baseline };
              settled.set(key, previous);
              changed = true;
            }
          }
          // Repair checkpoints written by the earlier cleanup when Reject saved
          // the original HEAD contents. Undo may already have restored the
          // proposal in a dirty buffer even though that version lost its review.
          if (previous?.stamp === stamp && repo && (repo.dirty.has(file.path) || open?.isDirty)
              && sameSnapshot(previous.baseline, file.before) && !sameSnapshot(previous.baseline, file.after)
              && matchesSnapshot(file.path, file.after, open)) {
            settled.delete(key);
            previous = undefined;
            changed = true;
          }
          if (previous?.stamp === stamp) { cleared.push({ chat: session.key, path: file.path }); continue; }
          if (repo && !repo.dirty.has(file.path) && !open?.isDirty) {
            const head = await committedFile(repo, file.path);
            if (head) {
              let matches = false;
              try {
                if (head.exists) matches = fs.lstatSync(file.path).isFile() && fs.readFileSync(file.path, 'utf8') === head.text && (!open || open.getText() === head.text);
                else matches = !fs.existsSync(file.path);
              } catch { /* A file may disappear during a tool call. Keep its review until the next poll. */ }
              if (matches) {
                const review = getReview(session.key, file.path);
                // Saving a rejection can make Git clean without a commit. Keep
                // its regions and rejection records so native Undo can revive it.
                const undoableRejection = head.exists && review?.text === head.text
                  && review.rejections?.some(record => record.after.text === head.text && record.before.text !== head.text);
                if (undoableRejection) continue; // Hide it, but retain the review for Undo.
                settled.set(key, { stamp, head: repo.head, baseline: head });
                changed = true;
                cleared.push({ chat: session.key, path: file.path });
                continue;
              }
            }
          }
          files.push(previous ? { ...file, before: previous.baseline, gitBaseline: true } : file);
        }
        result.push({ ...session, files });
      }
      return { sessions: result, cleared, changed };
    }
  };
}

module.exports = { createGitReview };
