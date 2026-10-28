/* Servidor estático temporal para probar dist/ en local (localhost permite SW) */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

http.createServer((request, response) => {
  let urlPath = decodeURIComponent(request.url.split('?')[0]);

  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = path.join(DIST, urlPath);

  if (!filePath.startsWith(DIST)) {
    response.writeHead(403);
    response.end();
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('No encontrado');
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Service-Worker-Allowed': '/',
    });
    response.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Preview del build en http://127.0.0.1:${PORT}`);
});
