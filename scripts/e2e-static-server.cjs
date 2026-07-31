'use strict';
/**
 * Tiny static file server for Playwright E2E (no Express required).
 *   node scripts/e2e-static-server.cjs [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.argv[2] || process.env.E2E_PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') {urlPath = '/index.html';}
    // Clean URLs
    const clean = {
      '/login': '/login.html',
      '/dashboard': '/dashboard.html',
      '/order': '/order.html',
      '/qr-order': '/qr-order.html',
    };
    if (clean[urlPath]) {urlPath = clean[urlPath];}

    const filePath = path.normalize(path.join(root, urlPath.replace(/^\//, '')));
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(String(e.message || e));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('[e2e-static] http://127.0.0.1:' + port);
});
