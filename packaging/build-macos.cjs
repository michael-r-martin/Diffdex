// Personal local package, assembled from the pinned installed editor.
// Uses an explicit allowlist: no demo, captures, profiles, login state or Git data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { patchWorkbench, expected, sha } = require('../prototype/workbench-patch.cjs');
const { resolveEditor } = require('./editor-source.cjs');
const { marker: fileContextMarker } = require('../scripts/codex-file-context.cjs');
const root = path.resolve(__dirname, '..');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

function extensionManifest(original) {
  const result = structuredClone(original);
  result.displayName = 'Diffdex Reviews';
  result.description = 'Review AI code changes across chats inside Diffdex.';
  delete result.scripts;
  for (const command of result.contributes.commands) command.title = command.title.replace('Codex Diffs:', 'Diffdex:');
  result.contributes.configuration.title = 'Diffdex';
  result.contributes.configuration.properties['codexDiff.storePath'].description = 'Optional capture storage override. Empty uses Diffdex’s permanent application storage.';
  result.contributes.viewsContainers.activitybar[0].title = 'Diffdex';
  result.contributes.configurationDefaults = {
    'update.mode': 'none', 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false,
    'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'welcomePage',
    'workbench.iconTheme': 'vs-seti', 'editor.minimap.enabled': false,
    'editor.fontFamily': '"SF Mono", Menlo, monospace', 'terminal.integrated.fontFamily': '"SF Mono", Menlo, monospace'
  };
  return result;
}

function brandProduct(product, bundle) {
  product.nameShort = product.nameLong = 'Diffdex';
  product.applicationName = 'diffdex';
  product.dataFolderName = '.diffdex';
  product.sharedDataFolderName = '.diffdex-shared';
  product.urlProtocol = 'diffdex';
  product.darwinBundleIdentifier = 'com.unseriouslabs.diffdex';
  product.darwinSharedKeychainServiceName = 'com.unseriouslabs.diffdex.shared-secrets';
  product.darwinExecutable = 'Diffdex';
  delete product.updateUrl;
  delete product.downloadUrl;
  product.builtInExtensionsEnabledWithAutoUpdates = [];
  // Keep integrity checks enabled with checksums for our actual packaged files.
  for (const file of Object.keys(product.checksums || {})) {
    product.checksums[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(bundle, 'out', file))).digest('base64').replace(/=+$/, '');
  }
  return product;
}

function plist(file) {
  return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
}
function writePlist(file, value) {
  fs.writeFileSync(file, JSON.stringify(value));
  run('/usr/bin/plutil', ['-convert', 'xml1', file]);
}
function makeIcon(destination, temporary) {
  const prepared = path.join(root, 'branding/Diffdex.icns');
  if (fs.existsSync(prepared)) { fs.copyFileSync(prepared, destination); return; }
  const iconset = path.join(temporary, 'Diffdex.iconset');
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      run('/usr/bin/sips', ['-z', String(size * scale), String(size * scale), path.join(root, 'branding/diffdex.png'), '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)]);
    }
  }
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', destination]);
}

function build(output = path.join(root, 'dist', `build-${Date.now()}`)) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('This pinned packager requires Apple Silicon macOS.');
  output = path.resolve(output);
  if (fs.existsSync(output)) throw Error(`Output already exists; choose a fresh directory: ${output}`);
  const source = resolveEditor();
  const relativeWorkbench = 'out/vs/workbench/workbench.desktop.main.js';
  const original = fs.readFileSync(path.join(source, 'Contents/Resources/app', relativeWorkbench), 'utf8');
  const patched = patchWorkbench(original); // Validate before copying anything.
  const privateExtensions = ['openai.chatgpt-26.1007.21434-darwin-arm64', 'openai.codex-audio-26.1007.21434'];
  for (const directory of privateExtensions) {
    const from = path.join(root, '.prototype-runtime/extensions', directory);
    if (!fs.existsSync(path.join(from, 'package.json'))) throw Error('Auto-follow dependencies missing. Run npm run setup:codex with your exact supported extension folders.');
    if (json(path.join(from, 'package.json')).version !== '26.1007.21434') throw Error(`Unsupported Codex extension: ${directory}`);
    if (directory.startsWith('openai.chatgpt-') && !fs.readFileSync(path.join(from, 'out/extension.js'), 'utf8').includes('codex-diff-active-chat')) throw Error('Run npm run setup:codex to prepare the private selection bridge.');
    if (directory.startsWith('openai.chatgpt-') && !fs.readFileSync(path.join(from, 'out/extension.js'), 'utf8').includes(fileContextMarker)) throw Error('Run npm run setup:codex to prepare the file context adapter.');
  }
  fs.mkdirSync(output, { recursive: true });
  const app = path.join(output, 'Diffdex.app');
  run('/bin/cp', ['-cR', source, app]);
  const resources = path.join(app, 'Contents/Resources');
  const appRoot = path.join(resources, 'app');
  fs.writeFileSync(path.join(appRoot, relativeWorkbench), patched);
  const extension = path.join(appRoot, 'extensions/diffdex-reviews');
  fs.mkdirSync(extension);
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(extension, 'LICENSE'));
  for (const directory of ['src', 'media', 'hooks']) fs.cpSync(path.join(root, directory), path.join(extension, directory), { recursive: true });
  fs.mkdirSync(path.join(extension, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/install-hooks.cjs'), path.join(extension, 'scripts/install-hooks.cjs'));
  const reviewManifest = extensionManifest(json(path.join(root, 'package.json')));
  writeJSON(path.join(extension, 'package.json'), reviewManifest);
  writeJSON(path.join(extension, 'diffdex.json'), { version: reviewManifest.version, cleanInstall: true });
  const bundledExtensions = [];
  // Preserve the original local auto-follow build with isolated extension copies.
  for (const directory of privateExtensions) {
    const from = path.join(root, '.prototype-runtime/extensions', directory);
    const manifest = json(path.join(from, 'package.json'));
    if (manifest.version !== '26.1007.21434') throw Error(`Unsupported Codex extension: ${directory}`);
    if (manifest.name === 'chatgpt' && !fs.readFileSync(path.join(from, 'out/extension.js'), 'utf8').includes('codex-diff-active-chat')) throw Error('Install the pinned Codex selection bridge before packaging.');
    // Extension code/assets only. No profile, tokens, extension registry or storage.
    run('/bin/cp', ['-cR', from, path.join(appRoot, 'extensions', directory)]);
    bundledExtensions.push({ id: `${manifest.publisher}.${manifest.name}`, version: manifest.version });
  }
  writeJSON(path.join(appRoot, 'product.json'), brandProduct(json(path.join(appRoot, 'product.json')), appRoot));
  const appPackage = json(path.join(appRoot, 'package.json'));
  appPackage.name = 'Diffdex';
  writeJSON(path.join(appRoot, 'package.json'), appPackage);
  const infoPath = path.join(app, 'Contents/Info.plist');
  const info = plist(infoPath);
  Object.assign(info, { CFBundleName: 'Diffdex', CFBundleDisplayName: 'Diffdex', CFBundleIdentifier: 'com.unseriouslabs.diffdex', CFBundleExecutable: 'Diffdex', CFBundleIconFile: 'Diffdex.icns', CFBundleIconName: 'Diffdex' });
  info.CFBundleURLTypes = [{ CFBundleTypeRole: 'Viewer', CFBundleURLName: 'Diffdex', CFBundleURLSchemes: ['diffdex'] }];
  for (const entry of info.CFBundleDocumentTypes || []) if (entry.CFBundleTypeName) entry.CFBundleTypeName = entry.CFBundleTypeName.replaceAll('Visual Studio Code', 'Diffdex');
  for (const key of Object.keys(info)) if (key.endsWith('UsageDescription')) info[key] = info[key].replaceAll('Visual Studio Code', 'Diffdex');
  writePlist(infoPath, info);
  fs.renameSync(path.join(app, 'Contents/MacOS/Code'), path.join(app, 'Contents/MacOS/Diffdex'));
  const frameworks = path.join(app, 'Contents/Frameworks');
  for (const name of fs.readdirSync(frameworks).filter(name => /^Code Helper.*\.app$/.test(name))) {
    const helper = path.join(frameworks, name);
    const helperInfoPath = path.join(helper, 'Contents/Info.plist');
    const helperInfo = plist(helperInfoPath);
    const oldExecutable = helperInfo.CFBundleExecutable || name.slice(0, -4);
    helperInfo.CFBundleExecutable = oldExecutable.replace('Code Helper', 'Diffdex Helper');
    helperInfo.CFBundleName = helperInfo.CFBundleExecutable;
    helperInfo.CFBundleDisplayName = helperInfo.CFBundleExecutable;
    helperInfo.CFBundleIdentifier = helperInfo.CFBundleIdentifier.replace('com.microsoft.VSCode', 'com.unseriouslabs.diffdex');
    writePlist(helperInfoPath, helperInfo);
    fs.renameSync(path.join(helper, 'Contents/MacOS', oldExecutable), path.join(helper, 'Contents/MacOS', helperInfo.CFBundleExecutable));
    fs.renameSync(helper, path.join(frameworks, name.replace('Code Helper', 'Diffdex Helper')));
  }
  // Keep both filenames: the editor's own shell-command installer expects bin/code.
  const cliPath = path.join(appRoot, 'bin/code');
  const cli = fs.readFileSync(cliPath, 'utf8').replaceAll('/MacOS/Code', '/MacOS/Diffdex');
  fs.writeFileSync(cliPath, cli);
  fs.writeFileSync(path.join(appRoot, 'bin/diffdex'), cli, { mode: 0o755 });
  makeIcon(path.join(resources, 'Diffdex.icns'), output);
  const buildInfo = { name: 'Diffdex', version: reviewManifest.version, editorVersion: appPackage.version, bundleIdentifier: info.CFBundleIdentifier, sourceWorkbenchSha256: expected, workbenchSha256: sha(patched), bundledExtensions, includesDemo: false, includesUserData: false, signing: 'ad-hoc-local' };
  writeJSON(path.join(resources, 'diffdex-build.json'), buildInfo);
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements', app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, path.join(output, 'Diffdex-mac-arm64.zip')]);
  writeJSON(path.join(output, 'build-info.json'), buildInfo);
  console.log(`Built ${app}`);
  return app;
}

if (require.main === module) build(process.argv[2]);
module.exports = { build, extensionManifest, brandProduct };
