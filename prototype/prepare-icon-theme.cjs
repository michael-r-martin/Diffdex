const fs = require('node:fs');
const path = require('node:path');

// Built-in extensions are cloned outside the checkout for workspace trust, but
// vscode-file only serves fonts from approved resource roots. Keep the copied
// Seti theme and resolve its font from the app's original bundled resources.
function prepareIconTheme(profile, app) {
  const themePath = path.join(profile, 'builtin-extensions/theme-seti/icons/vs-seti-icon-theme.json');
  const bundledIcons = path.join(app, 'Contents/Resources/app/extensions/theme-seti/icons');
  const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
  const bundled = JSON.parse(fs.readFileSync(path.join(bundledIcons, 'vs-seti-icon-theme.json'), 'utf8'));
  theme.fonts = bundled.fonts.map(font => ({
    ...font,
    src: font.src.map(source => {
      const file = path.resolve(bundledIcons, source.path);
      fs.accessSync(file, fs.constants.R_OK);
      return { ...source, path: path.relative(path.dirname(themePath), file).split(path.sep).join('/') };
    })
  }));
  const content = JSON.stringify(theme);
  if (fs.readFileSync(themePath, 'utf8') !== content) fs.writeFileSync(themePath, content);
}

if (require.main === module) prepareIconTheme(process.argv[2], process.argv[3]);
module.exports = { prepareIconTheme };
