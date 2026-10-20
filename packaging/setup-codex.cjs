// Prepares the user's extension code in an isolated prototype directory.
// Missing pins are installed by the original VS Code CLI from its publisher.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { resolveEditor } = require('./editor-source.cjs');
const root = path.resolve(__dirname, '..');
const directories = ['openai.chatgpt-26.1007.21434-darwin-arm64', 'openai.codex-audio-26.1007.21434'];

function prepare(sourceDirectory, { download = false } = {}) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('This build supports Apple Silicon macOS only.');
  const target = path.join(root, '.prototype-runtime/extensions');
  const supplied = sourceDirectory !== undefined;
  if (download && supplied) throw Error('Choose either --download or an extension source directory.');
  sourceDirectory = sourceDirectory || path.join(os.homedir(), '.vscode/extensions');
  fs.mkdirSync(target, { recursive: true });
  const missing = directories.filter(name => !fs.existsSync(path.join(target, name, 'package.json')) &&
    (download || !fs.existsSync(path.join(path.resolve(sourceDirectory), name, 'package.json'))));
  if (missing.length && !supplied) {
    const editor = resolveEditor();
    console.log('Installing pinned extensions with the original VS Code CLI into the isolated runtime. Publisher terms apply.');
    for (const name of missing) {
      const id = name.startsWith('openai.chatgpt-') ? 'openai.chatgpt' : 'openai.codex-audio';
      execFileSync(path.join(editor, 'Contents/Resources/app/bin/code'), [
        '--user-data-dir', path.join(root, '.prototype-runtime/setup-profile'),
        '--extensions-dir', target, '--install-extension', `${id}@26.1007.21434`, '--force'
      ], { stdio: 'inherit' });
    }
  }
  const plan = directories.map(name => {
    const destination = path.join(target, name);
    const source = fs.existsSync(destination) ? destination : path.join(path.resolve(sourceDirectory), name);
    if (!fs.existsSync(path.join(source, 'package.json'))) {
      throw Error(`Missing ${name}.\nAuto-follow requires the exact supported extension copies. Retry npm run setup:codex without a custom path to install them, or pass their parent directory: npm run setup:codex -- /path/to/extensions\nDo not substitute latest; the adapter must be ported and tested for a different version.`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    if (manifest.publisher !== 'openai' || manifest.version !== '26.1007.21434') throw Error(`Unsupported extension: ${source}`);
    return { source, destination };
  });
  for (const { source, destination } of plan) {
    if (source !== destination) execFileSync('/bin/cp', ['-cR', source, destination], { stdio: 'inherit' });
  }
  execFileSync(process.execPath, [path.join(root, 'scripts/install-codex-selection-bridge.cjs')], { stdio: 'inherit' });
  console.log('Private auto-follow adapter prepared in .prototype-runtime. Original extension installations were not modified.');
}
if (require.main === module) {
  try {
    prepare(process.argv[2] === '--download' ? undefined : process.argv[2], { download: process.argv[2] === '--download' });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepare };
