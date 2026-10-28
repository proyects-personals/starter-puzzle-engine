'use strict';

/* ============================================================
   PuzzleStudio — Build estático para Netlify
   Genera dist/ con:
   - Copia de public/
   - Registro automático del Service Worker (API virtual sobre
     IndexedDB que sustituye a server.js)
   - manifest.webmanifest (instalable como PWA en móvil)
   - _headers y _redirects para Netlify
   ============================================================ */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

/* ---------- Limpieza ---------- */

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

/* ---------- Copiar public/ ---------- */

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

copyDirectory(PUBLIC_DIR, DIST_DIR);

/* ---------- Registro del Service Worker ---------- */

const indexHtmlPath = path.join(DIST_DIR, 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

const swRegisterScript = `
  <!-- Build estático: la API vive en el Service Worker (IndexedDB) -->
  <script>
    (function () {
      if (!('serviceWorker' in navigator)) {
        return;
      }

      /* Encolar todos los fetch hasta que el Service Worker controle la página:
         así la app puede llamar a /api/* nada más arrancar. */
      var swReady = navigator.serviceWorker.register('/sw.js')
        .then(function () { return navigator.serviceWorker.ready; })
        .then(function (registration) {
          /* Si el SW aún no controla esta pestaña, forzar el claim y recargar una vez */
          if (!navigator.serviceWorker.controller && !sessionStorage.getItem('ps-sw-reloaded')) {
            sessionStorage.setItem('ps-sw-reloaded', '1');
            registration.addEventListener('controllerchange', function () {
              window.location.reload();
            });
          }
        });

      var originalFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        return swReady.then(function () {
          return originalFetch.apply(window, args);
        });
      };
    })();
  </script>
  <link rel="manifest" href="/manifest.webmanifest">
`;

if (indexHtml.includes('</body>')) {
  indexHtml = indexHtml.replace('</body>', `${swRegisterScript}</body>`);
} else {
  indexHtml += swRegisterScript;
}

fs.writeFileSync(indexHtmlPath, indexHtml);

/* ---------- PWA: manifest + icono ---------- */

const manifest = {
  name: 'PuzzleStudio',
  short_name: 'Puzzle',
  description: 'Crea y resuelve rompecabezas en la web',
  start_url: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#0b1020',
  theme_color: '#0b1020',
  icons: [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};

fs.writeFileSync(
  path.join(DIST_DIR, 'manifest.webmanifest'),
  JSON.stringify(manifest, null, 2),
);

fs.writeFileSync(
  path.join(DIST_DIR, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧩</text></svg>`,
);

/* ---------- Netlify: _headers ---------- */

const headers = `
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/sw.js
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache

/css/*
  Cache-Control: public, max-age=604800

/js/*
  Cache-Control: public, max-age=604800
`;

fs.writeFileSync(path.join(DIST_DIR, '_headers'), headers.trimStart());

/* ---------- Netlify: _redirects (SPA de una sola página) ---------- */

fs.writeFileSync(
  path.join(DIST_DIR, '_redirects'),
  '/*    /index.html   200\n',
);

/* ---------- Resumen ---------- */

function directorySize(directory) {
  let total = 0;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      total += directorySize(entryPath);
    } else {
      total += fs.statSync(entryPath).size;
    }
  }

  return total;
}

const sizeKb = (directorySize(DIST_DIR) / 1024).toFixed(1);

console.log('✅ Build estático generado en dist/');
console.log('   - Copia de public/ (app completa)');
console.log('   - Service Worker con API virtual (IndexedDB)');
console.log('   - manifest.webmanifest + icon.svg (PWA instalable)');
console.log('   - _headers / _redirects para Netlify');
console.log(`   Tamaño total: ${sizeKb} KB`);
console.log('');
console.log('Publicar en Netlify:');
console.log('  Opción A (Git):  conecta el repo → build "npm run build" → publish "dist"');
console.log('  Opción B (Drag): arrastra la carpeta dist/ a https://app.netlify.com/drop');
