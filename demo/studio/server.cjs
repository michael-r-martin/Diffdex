const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/theme.js': ['theme.js', 'text/javascript; charset=utf-8'],
  '/assets/weekend-workbench.jpg': ['assets/weekend-workbench.jpg', 'image/jpeg'],
};
const port = Number(process.env.PORT || 4173);
const server = http.createServer((request, response) => {
  const route = files[new URL(request.url, 'http://localhost').pathname];
  if (!route || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(path.join(__dirname, 'dist', route[0])));
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Weekend Studio: http://127.0.0.1:${port}`));
