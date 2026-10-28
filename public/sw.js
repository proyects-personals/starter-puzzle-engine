'use strict';

/* ============================================================
   PuzzleStudio — Backend estático para Netlify
   Service Worker que implementa la misma API REST que server.js
   usando IndexedDB (imágenes + metadatos). Todo corre en el
   navegador: sin servidor, sin base de datos remota.
   ============================================================ */

const CACHE_VERSION = 'puzzlestudio-v1';
const DB_NAME = 'puzzlestudio';
const DB_VERSION = 1;

const ABSOLUTE_MAX_PIECES = 1000;
const DEFAULT_MAX_PIECES = 500;

/* ---------- IndexedDB ---------- */

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('puzzles')) {
        const store = db.createObjectStore('puzzles', { keyPath: 'id', autoIncrement: true });
        store.createIndex('updatedAt', 'updatedAt');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }

      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(db, storeName, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function dbGetAllPuzzles() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('puzzles', 'readonly');
    const request = transaction.objectStore('puzzles').getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetPuzzle(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const request = db.transaction('puzzles', 'readonly').objectStore('puzzles').get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function dbPutPuzzle(puzzle) {
  const db = await openDatabase();

  return withStore(db, 'puzzles', 'readwrite', (store) => store.put(puzzle));
}

async function dbDeletePuzzle(id) {
  const db = await openDatabase();

  return withStore(db, 'puzzles', 'readwrite', (store) => store.delete(id));
}

async function dbGetSetting(key, fallback) {
  const db = await openDatabase();

  return new Promise((resolve) => {
    const request = db.transaction('settings', 'readonly').objectStore('settings').get(key);

    request.onsuccess = () => resolve(request.result === undefined ? fallback : request.result);
    request.onerror = () => resolve(fallback);
  });
}

async function dbSetSetting(key, value) {
  const db = await openDatabase();

  return withStore(db, 'settings', 'readwrite', (store) => store.put(value, key));
}

async function dbGetImage(fileName) {
  const db = await openDatabase();

  return new Promise((resolve) => {
    const request = db.transaction('images', 'readonly').objectStore('images').get(fileName);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

async function dbSetImage(fileName, buffer) {
  const db = await openDatabase();

  return withStore(db, 'images', 'readwrite', (store) => store.put(buffer, fileName));
}

async function dbDeleteImage(fileName) {
  const db = await openDatabase();

  return withStore(db, 'images', 'readwrite', (store) => store.delete(fileName));
}

/* ---------- Utilidades ---------- */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function saveDataUrlAsImage(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/s.exec(dataUrl);

  if (!match) {
    return null;
  }

  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { fileName, bytes };
}

function validatePuzzleInput(body, maxPieces) {
  const errors = [];
  const title = typeof body?.title === 'string' ? body.title.trim() : '';

  if (!title) {
    errors.push('El título es obligatorio.');
  }

  const totalPieces = Number(body?.totalPieces);

  if (!Number.isInteger(totalPieces) || totalPieces < 2 || totalPieces > maxPieces) {
    errors.push(`El número de piezas debe estar entre 2 y ${maxPieces}.`);
  }

  const referenceWidth = Number(body?.referenceWidth ?? 300);

  if (!Number.isFinite(referenceWidth) || referenceWidth < 120 || referenceWidth > 600) {
    errors.push('El ancho de referencia debe estar entre 120 y 600.');
  }

  const boardRatio = Number(body?.boardRatio ?? 0.72);

  if (!Number.isFinite(boardRatio) || boardRatio < 0.4 || boardRatio > 0.9) {
    errors.push('La proporción del tablero debe estar entre 0.40 y 0.90.');
  }

  return {
    errors,
    title,
    totalPieces,
    referenceWidth: Math.round(referenceWidth),
    boardRatio,
  };
}

function serializePuzzle(puzzle) {
  return {
    id: puzzle.id,
    title: puzzle.title,
    imagePath: puzzle.imagePath,
    totalPieces: puzzle.totalPieces,
    referenceWidth: puzzle.referenceWidth,
    boardRatio: puzzle.boardRatio,
    placedPieces: puzzle.placedPieces || [],
    piecePositions: puzzle.piecePositions || {},
    completed: Boolean(puzzle.completed),
    elapsedSeconds: puzzle.elapsedSeconds || 0,
    createdAt: puzzle.createdAt,
    updatedAt: puzzle.updatedAt,
  };
}

/* ---------- API ---------- */

async function handleApi(request, pathname) {
  const method = request.method;

  if (method === 'GET' && pathname === '/api/config') {
    const maxPieces = await dbGetSetting('max_pieces', DEFAULT_MAX_PIECES);
    return jsonResponse({ maxPieces: Number(maxPieces), absoluteMaxPieces: ABSOLUTE_MAX_PIECES });
  }

  if (method === 'GET' && pathname === '/api/puzzles') {
    const puzzles = await dbGetAllPuzzles();
    puzzles.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return jsonResponse(puzzles.map(serializePuzzle));
  }

  if (method === 'POST' && pathname === '/api/puzzles') {
    const body = await readJson(request);

    if (!body || typeof body.imageData !== 'string' || !body.imageData.startsWith('data:image/')) {
      return jsonResponse({ error: 'Debes seleccionar una imagen válida.' }, 400);
    }

    const maxPieces = Number(await dbGetSetting('max_pieces', DEFAULT_MAX_PIECES));
    const { errors, title, totalPieces, referenceWidth, boardRatio } = validatePuzzleInput(body, maxPieces);

    if (errors.length > 0) {
      return jsonResponse({ error: errors.join(' ') }, 400);
    }

    const image = saveDataUrlAsImage(body.imageData);

    if (!image) {
      return jsonResponse({ error: 'Formato de imagen no soportado.' }, 400);
    }

    await dbSetImage(image.fileName, image.bytes);

    const now = new Date().toISOString();
    const puzzle = {
      title,
      imagePath: image.fileName,
      totalPieces,
      referenceWidth,
      boardRatio,
      placedPieces: [],
      piecePositions: {},
      completed: false,
      elapsedSeconds: 0,
      createdAt: now,
      updatedAt: now,
    };

    const id = await dbPutPuzzle(puzzle);

    return jsonResponse({ id }, 201);
  }

  const configMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/config$/);

  if (method === 'POST' && configMatch) {
    const id = Number(configMatch[1]);
    const puzzle = await dbGetPuzzle(id);

    if (!puzzle) {
      return jsonResponse({ error: 'Rompecabezas no encontrado.' }, 404);
    }

    const body = await readJson(request);

    if (!body || typeof body.imageData !== 'string' || !body.imageData.startsWith('data:image/')) {
      return jsonResponse({ error: 'Debes seleccionar una imagen válida.' }, 400);
    }

    const maxPieces = Number(await dbGetSetting('max_pieces', DEFAULT_MAX_PIECES));
    const { errors, title, totalPieces, referenceWidth, boardRatio } = validatePuzzleInput(body, maxPieces);

    if (errors.length > 0) {
      return jsonResponse({ error: errors.join(' ') }, 400);
    }

    const image = saveDataUrlAsImage(body.imageData);

    if (!image) {
      return jsonResponse({ error: 'Formato de imagen no soportado.' }, 400);
    }

    await dbSetImage(image.fileName, image.bytes);
    await dbDeleteImage(puzzle.imagePath);

    Object.assign(puzzle, {
      title,
      imagePath: image.fileName,
      totalPieces,
      referenceWidth,
      boardRatio,
      placedPieces: [],
      piecePositions: {},
      completed: false,
      updatedAt: new Date().toISOString(),
    });

    await dbPutPuzzle(puzzle);

    return jsonResponse({ ok: true });
  }

  const progressMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/progress$/);

  if (method === 'POST' && progressMatch) {
    const id = Number(progressMatch[1]);
    const puzzle = await dbGetPuzzle(id);

    if (!puzzle) {
      return jsonResponse({ error: 'Rompecabezas no encontrado.' }, 404);
    }

    const body = await readJson(request);

    if (!body || !Array.isArray(body.placedPieces) || typeof body.piecePositions !== 'object') {
      return jsonResponse({ error: 'Datos de progreso inválidos.' }, 400);
    }

    const placedPieces = [...new Set(body.placedPieces.map(Number).filter(Number.isInteger))];
    const piecePositions = {};

    for (const [key, value] of Object.entries(body.piecePositions)) {
      const index = Number(key);

      if (Number.isInteger(index) && Array.isArray(value) && value.length === 2) {
        piecePositions[index] = [Number(value[0]), Number(value[1])];
      }
    }

    puzzle.placedPieces = placedPieces;
    puzzle.piecePositions = piecePositions;
    puzzle.completed = placedPieces.length === puzzle.totalPieces;
    puzzle.updatedAt = new Date().toISOString();

    await dbPutPuzzle(puzzle);

    return jsonResponse({ ok: true });
  }

  const elapsedMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/elapsed$/);

  if (method === 'POST' && elapsedMatch) {
    const id = Number(elapsedMatch[1]);
    const puzzle = await dbGetPuzzle(id);

    if (!puzzle) {
      return jsonResponse({ error: 'Rompecabezas no encontrado.' }, 404);
    }

    const body = await readJson(request);
    const seconds = Number(body?.seconds);

    if (!Number.isFinite(seconds)) {
      return jsonResponse({ error: 'Segundos inválidos.' }, 400);
    }

    if (seconds > 0) {
      puzzle.elapsedSeconds = (puzzle.elapsedSeconds || 0) + Math.floor(seconds);
      puzzle.updatedAt = new Date().toISOString();
      await dbPutPuzzle(puzzle);
    }

    return jsonResponse({ ok: true });
  }

  const renameMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/rename$/);

  if (method === 'POST' && renameMatch) {
    const id = Number(renameMatch[1]);
    const puzzle = await dbGetPuzzle(id);

    if (!puzzle) {
      return jsonResponse({ error: 'Rompecabezas no encontrado.' }, 404);
    }

    const body = await readJson(request);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';

    if (!title) {
      return jsonResponse({ error: 'El título no puede estar vacío.' }, 400);
    }

    puzzle.title = title;
    puzzle.updatedAt = new Date().toISOString();
    await dbPutPuzzle(puzzle);

    return jsonResponse({ ok: true });
  }

  if (method === 'POST' && pathname === '/api/settings/max-pieces') {
    const body = await readJson(request);
    const value = Number(body?.maxPieces);

    if (!Number.isInteger(value) || value < 2 || value > ABSOLUTE_MAX_PIECES) {
      return jsonResponse({ error: `El límite debe estar entre 2 y ${ABSOLUTE_MAX_PIECES}.` }, 400);
    }

    await dbSetSetting('max_pieces', value);

    return jsonResponse({ ok: true, maxPieces: value });
  }

  const deleteMatch = pathname.match(/^\/api\/puzzles\/(\d+)$/);

  if (method === 'DELETE' && deleteMatch) {
    const id = Number(deleteMatch[1]);
    const puzzle = await dbGetPuzzle(id);

    if (!puzzle) {
      return jsonResponse({ error: 'Rompecabezas no encontrado.' }, 404);
    }

    await dbDeletePuzzle(id);
    await dbDeleteImage(puzzle.imagePath);

    return jsonResponse({ ok: true });
  }

  const puzzleMatch = pathname.match(/^\/api\/puzzles\/(\d+)$/);

  if (method === 'GET' && puzzleMatch) {
    const puzzle = await dbGetPuzzle(Number(puzzleMatch[1]));

    if (!puzzle) {
      return jsonResponse({ error: 'Rompecabezas no encontrado.' }, 404);
    }

    return jsonResponse(serializePuzzle(puzzle));
  }

  return jsonResponse({ error: 'Endpoint no encontrado' }, 404);
}

/* ---------- Service Worker ---------- */

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll([
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/library.js',
    '/js/settings.js',
    '/js/puzzle.js',
    '/js/puzzle-modal.js',
    '/js/puzzle-engine.js',
    '/js/cookies.js',
  ])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  /* API virtual sobre IndexedDB */
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApi(event.request, url.pathname));
    return;
  }

  /* Imágenes guardadas en IndexedDB */
  const imageMatch = url.pathname.match(/^\/images\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)$/);

  if (imageMatch && event.request.method === 'GET') {
    event.respondWith((async () => {
      const bytes = await dbGetImage(imageMatch[1]);

      if (!bytes) {
        return new Response('Imagen no encontrada', { status: 404 });
      }

      const extension = imageMatch[1].split('.').pop().toLowerCase();
      const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': types[extension] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    })());
    return;
  }

  /* Estáticos: red primero, cache de respaldo (permite actualizar la app) */
  if (event.request.method === 'GET') {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);

      try {
        const response = await fetch(event.request);

        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(event.request, response.clone());
        }

        return response;
      } catch {
        return cached || new Response('Sin conexión', { status: 503 });
      }
    })());
  }
});
