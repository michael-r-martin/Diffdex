const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
function mergedConfig(existing, command) {
  const config = structuredClone(existing);
  config.hooks ||= {};
  for (const event of ['PreToolUse', 'PostToolUse']) {
    const groups = config.hooks[event] ||= [];
    const handler = { type: 'command', command, timeout: 10, statusMessage: 'Capturing Codex diff' };
    // Remove only our handler, preserving unrelated hooks and their matchers.
    for (const group of groups) group.hooks = (group.hooks || []).filter(h => h.command !== command);
    config.hooks[event] = groups.filter(group => group.hooks.length);
    config.hooks[event].push({ matcher: '.*', hooks: [handler] });
  }
  return config;
}
function install(project, outputOnly = false) {
  const destination = path.join(path.resolve(project), '.codex/hooks.json');
  const command = `${quote(process.execPath)} ${quote(path.join(root, 'hooks/capture.cjs'))} ${quote(path.join(root, '.prototype-runtime/captures'))}`;
  const exists = fs.existsSync(destination);
  const config = mergedConfig(exists ? JSON.parse(fs.readFileSync(destination, 'utf8')) : {}, command);
  const text = JSON.stringify(config, null, 2) + '\n';
  if (outputOnly) { process.stdout.write(text); return; }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (exists) fs.copyFileSync(destination, `${destination}.${Date.now()}.bak`);
  const temp = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text, { mode: 0o600 }); fs.renameSync(temp, destination);
  console.log(`Installed ${destination}. Review and trust these two hooks in Codex before use.`);
}
if (require.main === module) install(process.argv[2] || root, process.argv.includes('--print'));
module.exports = { mergedConfig };
