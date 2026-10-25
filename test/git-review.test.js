const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGitReview } = require('../src/git-review');
const { Review } = require('../src/review');

function setup(t) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-git-review-')));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', cwd, '-c', 'user.name=Diffdex Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet');
  const file = path.join(cwd, 'space ü.js');
  fs.writeFileSync(file, 'before\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'initial');
  const capture = (after = 'proposal\n', updatedAt = 1) => ({ path: file, before: { exists: true, text: 'before\n' }, after: { exists: true, text: after }, updatedAt });
  const sessions = (files = [capture()]) => [{ key: 'repo/chat', cwd, files }];
  return { cwd, file, git, capture, sessions };
}

test('commit clears captured reviews without a push and checkpoints survive reopening', async t => {
  const x = setup(t), state = createGitReview();
  fs.writeFileSync(x.file, 'proposal\n');
  assert.equal((await state.reconcile(x.sessions())).sessions[0].files.length, 1);
  x.git('add', '.');
  assert.equal((await state.reconcile(x.sessions())).sessions[0].files.length, 1, 'Staged changes still need review');
  x.git('commit', '--quiet', '-m', 'commit proposal');
  const clean = await state.reconcile(x.sessions());
  assert.equal(clean.sessions[0].files.length, 0);
  assert.equal(clean.cleared.length, 1);
  assert.equal(clean.changed, true);
  const reopened = createGitReview(JSON.parse(JSON.stringify(state.checkpoints())));
  fs.writeFileSync(x.file, 'personal uncommitted edit\n');
  assert.equal((await reopened.reconcile(x.sessions())).sessions[0].files.length, 0, 'Old captures stay settled when unrelated edits arrive');
  fs.writeFileSync(x.file, 'next proposal\n');
  const next = await reopened.reconcile(x.sessions([x.capture('next proposal\n', 2)]));
  assert.equal(next.sessions[0].files[0].before.text, 'proposal\n');
  assert.equal(next.sessions[0].files[0].gitBaseline, true);
  const review = new Review(next.sessions[0].files[0].before.text, next.sessions[0].files[0].after.text);
  assert.deepEqual(review.getHunks()[0].removed, ['proposal']);
});

test('committed files clear even when another captured file remains modified', async t => {
  const x = setup(t), state = createGitReview(), other = path.join(x.cwd, 'other.txt');
  fs.writeFileSync(other, 'untracked proposal\n');
  fs.writeFileSync(x.file, 'proposal\n');
  x.git('add', '--', x.file); x.git('commit', '--quiet', '-m', 'partial files');
  const result = await state.reconcile(x.sessions([x.capture(), { path: other, before: { exists: false, text: '' }, after: { exists: true, text: 'untracked proposal\n' }, updatedAt: 1 }]));
  assert.deepEqual(result.sessions[0].files.map(file => file.path), [other]);
});

test('unsaved buffers and ignored files do not disappear when Git looks clean', async t => {
  const x = setup(t), state = createGitReview();
  fs.writeFileSync(x.file, 'proposal\n');
  x.git('add', '.'); x.git('commit', '--quiet', '-m', 'proposal');
  const doc = { uri: { fsPath: x.file }, isDirty: true, getText: () => 'unsaved new code\n' };
  assert.equal((await state.reconcile(x.sessions(), [doc])).sessions[0].files.length, 1);
  const ignored = path.join(x.cwd, 'ignored.txt');
  fs.writeFileSync(path.join(x.cwd, '.gitignore'), 'ignored.txt\n');
  fs.writeFileSync(ignored, 'captured ignored text\n');
  const result = await state.reconcile(x.sessions([{ ...x.capture(), path: ignored }]));
  assert.equal(result.sessions[0].files.length, 1);
});

test('committed creations and deletions clear, while uncommitted deletions remain', async t => {
  const x = setup(t), state = createGitReview();
  const deletion = { ...x.capture(), after: { exists: false, text: '' } };
  fs.unlinkSync(x.file);
  assert.equal((await state.reconcile(x.sessions([deletion]))).sessions[0].files.length, 1);
  x.git('add', '-u'); x.git('commit', '--quiet', '-m', 'delete');
  assert.equal((await state.reconcile(x.sessions([deletion]))).sessions[0].files.length, 0);
  fs.writeFileSync(x.file, 'created\n');
  const creation = { ...x.capture('created\n', 2), before: { exists: false, text: '' } };
  assert.equal((await state.reconcile(x.sessions([creation]))).sessions[0].files.length, 1);
  x.git('add', '.'); x.git('commit', '--quiet', '-m', 'recreate');
  assert.equal((await state.reconcile(x.sessions([creation]))).sessions[0].files.length, 0);
});

test('Git failures preserve captures and worktrees use their own HEAD', async t => {
  const x = setup(t), state = createGitReview();
  const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'diffdex-not-git-'));
  t.after(() => fs.rmSync(notRepo, { recursive: true, force: true }));
  assert.equal((await state.reconcile([{ ...x.sessions()[0], cwd: notRepo }])).sessions[0].files.length, 1);
  const worktree = path.join(x.cwd, 'linked');
  x.git('worktree', 'add', '--quiet', '-b', 'linked', worktree);
  const file = path.join(worktree, path.basename(x.file));
  fs.writeFileSync(file, 'worktree proposal\n');
  const session = [{ key: 'worktree/chat', cwd: worktree, files: [{ ...x.capture('worktree proposal\n'), path: file }] }];
  assert.equal((await state.reconcile(session)).sessions[0].files.length, 1);
  x.git('-C', worktree, 'add', '.'); x.git('-C', worktree, 'commit', '--quiet', '-m', 'worktree proposal');
  assert.equal((await state.reconcile(session)).sessions[0].files.length, 0);
  assert.equal(fs.readFileSync(x.file, 'utf8'), 'before\n');
});

test('switching branches updates the committed baseline before another capture', async t => {
  const x = setup(t), state = createGitReview();
  fs.writeFileSync(x.file, 'proposal\n');
  x.git('add', '.'); x.git('commit', '--quiet', '-m', 'proposal');
  await state.reconcile(x.sessions());
  x.git('checkout', '--quiet', '-b', 'other-branch');
  fs.writeFileSync(x.file, 'other branch baseline\n');
  x.git('add', '.'); x.git('commit', '--quiet', '-m', 'other baseline');
  fs.writeFileSync(x.file, 'next proposal\n');
  const next = await state.reconcile(x.sessions([x.capture('next proposal\n', 2)]));
  assert.equal(next.sessions[0].files[0].before.text, 'other branch baseline\n');
});

test('rejecting back to HEAD preserves review undo/redo until a real commit', async t => {
  const x = setup(t), state = createGitReview();
  const review = new Review('before\n', 'proposal\n');
  const before = { text: review.text, regions: review.regions.map(region => ({ ...region })) };
  review.regions = [];
  review.update([{ rangeOffset: 0, rangeLength: 8, text: 'before' }], 'before\n');
  review.recordRejection(before);
  const getReview = () => review;
  for (let i = 0; i < 2; i++) {
    const rejected = await state.reconcile(x.sessions(), [], getReview);
    assert.equal(rejected.sessions[0].files.length, 0, 'Rejected files leave the pending list without losing Undo');
    assert.equal(rejected.cleared.length, 0, 'Clean rejection must not delete the undo metadata');
    assert.equal(state.checkpoints().length, 0);
    assert.equal(review.update([{ rangeOffset: 0, rangeLength: 6, text: 'proposal' }], 'proposal\n', true), true);
    fs.writeFileSync(x.file, review.text);
    assert.equal(review.getHunks().length, 1);
    assert.equal((await state.reconcile(x.sessions(), [], getReview)).sessions[0].files.length, 1);
    assert.equal(review.update([{ rangeOffset: 0, rangeLength: 8, text: 'before' }], 'before\n', true), true);
    fs.writeFileSync(x.file, review.text);
    assert.equal(review.getHunks().length, 0);
  }
  const persisted = JSON.parse(JSON.stringify({ text: review.text, regions: review.regions, rejections: review.rejections, supported: review.supported }));
  const reopened = Object.assign(new Review('', ''), persisted);
  assert.equal((await createGitReview().reconcile(x.sessions(), [], () => reopened)).cleared.length, 0);
  review.update([{ rangeOffset: 0, rangeLength: 6, text: 'proposal' }], 'proposal\n', true);
  fs.writeFileSync(x.file, review.text);
  x.git('add', '.'); x.git('commit', '--quiet', '-m', 'actually commit proposal');
  assert.equal((await state.reconcile(x.sessions(), [], getReview)).sessions[0].files.length, 0);
});

test('restored proposals recover checkpoints incorrectly settled by the old rejection cleanup', async t => {
  const x = setup(t), old = createGitReview();
  // The old version cleared a rejection that restored the original HEAD text.
  await old.reconcile(x.sessions());
  assert.equal(old.checkpoints().length, 1);
  const fixed = createGitReview(old.checkpoints());
  const doc = { uri: { fsPath: x.file }, isDirty: true, getText: () => 'proposal\n' };
  const recovered = await fixed.reconcile(x.sessions(), [doc]);
  assert.equal(recovered.sessions[0].files.length, 1);
  assert.equal(recovered.changed, true);
  assert.equal(fixed.checkpoints().length, 0);
  assert.equal(fs.readFileSync(x.file, 'utf8'), 'before\n', 'Recovery never writes an unsaved buffer to disk');
});
