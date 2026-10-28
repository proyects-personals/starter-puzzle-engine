'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PuzzleRepository, ABSOLUTE_MAX_PIECES } = require('./src/database');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

fs.mkdirSync(IMAGES_DIR, { recursive: true });

const repository = new PuzzleRepository();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/css/styles.css': 'css/styles.css',
  '/js/app.js': 'js/app.js',
  '/js/library.js': 'js/library.js',
  '/js/puzzle.js': 'js/puzzle.js',
  '/js/puzzle-modal.js': 'js/puzzle-modal.js',
  '/js/puzzle-engine.js': 'js/puzzle-engine.js',
  '/js/settings.js': 'js/settings.js',
  '/js/cookies.js': 'js/cookies.js',
};

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function readBody(request, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;

      if (size > limit) {
        reject(new Error('Cuerpo demasiado grande'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function parseJsonBody(rawBody) {
  if (!rawBody || rawBody.length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
}

function serveStatic(response, urlPath) {
  const relativePath = STATIC_FILES[urlPath];

  if (!relativePath) {
    sendJson(response, 404, { error: 'Recurso no encontrado' });
    return;
  }

  const filePath = path.join(PUBLIC_DIR, relativePath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(response, 404, { error: 'Recurso no encontrado' });
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(data);
  });
}

function serveImage(response, fileName) {
  const safeName = path.basename(fileName);

  if (!/^[A-Za-z0-9_-]+\.(png|jpe?g|gif|webp|bmp)$/i.test(safeName)) {
    sendJson(response, 400, { error: 'Nombre de archivo inválido' });
    return;
  }

  const filePath = path.join(IMAGES_DIR, safeName);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Imagen no encontrada');
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    });
    response.end(data);
  });
}

function validatePuzzleInput(body, maxPieces) {
  const errors = [];

  const title = typeof body.title === 'string' ? body.title.trim() : '';

  if (!title) {
    errors.push('El título es obligatorio.');
  }

  const totalPieces = Number(body.totalPieces);

  if (!Number.isInteger(totalPieces) || totalPieces < 2 || totalPieces > maxPieces) {
    errors.push(`El número de piezas debe estar entre 2 y ${maxPieces}.`);
  }

  const referenceWidth = Number(body.referenceWidth ?? 300);

  if (!Number.isFinite(referenceWidth) || referenceWidth < 120 || referenceWidth > 600) {
    errors.push('El ancho de referencia debe estar entre 120 y 600.');
  }

  const boardRatio = Number(body.boardRatio ?? 0.72);

  if (!Number.isFinite(boardRatio) || boardRatio < 0.4 || boardRatio > 0.9) {
    errors.push('La proporción del tablero debe estar entre 0.40 y 0.90.');
  }

  return { errors, title, totalPieces, referenceWidth: Math.round(referenceWidth), boardRatio };
}

async function handleApi(request, response, url) {
  const { pathname } = url;
  const method = request.method;

  if (method === 'GET' && pathname === '/api/config') {
    return sendJson(response, 200, {
      maxPieces: repository.getMaxPieces(),
      absoluteMaxPieces: ABSOLUTE_MAX_PIECES,
    });
  }

  if (method === 'GET' && pathname === '/api/puzzles') {
    return sendJson(response, 200, repository.listAll());
  }

  const getMatch = pathname.match(/^\/api\/puzzles\/(\d+)$/);

  if (method === 'GET' && getMatch) {
    const puzzle = repository.get(Number(getMatch[1]));

    if (!puzzle) {
      return sendJson(response, 404, { error: 'Rompecabezas no encontrado.' });
    }

    return sendJson(response, 200, puzzle);
  }

  if (method === 'POST' && pathname === '/api/puzzles') {
    const body = parseJsonBody(await readBody(request));

    if (!body || typeof body.imageData !== 'string' || !body.imageData.startsWith('data:image/')) {
      return sendJson(response, 400, { error: 'Debes seleccionar una imagen válida.' });
    }

    const maxPieces = repository.getMaxPieces();
    const { errors, title, totalPieces, referenceWidth, boardRatio } = validatePuzzleInput(body, maxPieces);

    if (errors.length > 0) {
      return sendJson(response, 400, { error: errors.join(' ') });
    }

    const match = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/s.exec(body.imageData);

    if (!match) {
      return sendJson(response, 400, { error: 'Formato de imagen no soportado.' });
    }

    const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const imagePath = path.join(IMAGES_DIR, fileName);

    fs.writeFileSync(imagePath, Buffer.from(match[2], 'base64'));

    const puzzleId = repository.create({
      title,
      imagePath: fileName,
      totalPieces,
      referenceWidth: Math.round(referenceWidth),
      boardRatio,
    });

    return sendJson(response, 201, { id: puzzleId });
  }

  const configMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/config$/);

  if (method === 'POST' && configMatch) {
    const puzzleId = Number(configMatch[1]);
    const puzzle = repository.get(puzzleId);

    if (!puzzle) {
      return sendJson(response, 404, { error: 'Rompecabezas no encontrado.' });
    }

    const body = parseJsonBody(await readBody(request));

    if (!body || typeof body.imageData !== 'string' || !body.imageData.startsWith('data:image/')) {
      return sendJson(response, 400, { error: 'Debes seleccionar una imagen válida.' });
    }

    const maxPieces = repository.getMaxPieces();
    const { errors, title, totalPieces, referenceWidth, boardRatio } = validatePuzzleInput(body, maxPieces);

    if (errors.length) {
      return sendJson(response, 400, { error: errors.join(' ') });
    }

    const match = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/s.exec(body.imageData);

    if (!match) {
      return sendJson(response, 400, { error: 'Formato de imagen no soportado.' });
    }

    const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
    const fileName = `${crypto.randomUUID()}.${extension}`;

    fs.writeFileSync(path.join(IMAGES_DIR, fileName), Buffer.from(match[2], 'base64'));

    const oldPath = path.join(IMAGES_DIR, path.basename(puzzle.imagePath));

    repository.updateConfiguration(puzzleId, {
      title,
      imagePath: fileName,
      totalPieces,
      referenceWidth,
      boardRatio,
    });

    fs.rm(oldPath, { force: true }, () => {});

    return sendJson(response, 200, { ok: true });
  }

  const progressMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/progress$/);

  if (method === 'POST' && progressMatch) {
    const puzzleId = Number(progressMatch[1]);
    const puzzle = repository.get(puzzleId);

    if (!puzzle) {
      return sendJson(response, 404, { error: 'Rompecabezas no encontrado.' });
    }

    const body = parseJsonBody(await readBody(request));

    if (!body || !Array.isArray(body.placedPieces) || typeof body.piecePositions !== 'object') {
      return sendJson(response, 400, { error: 'Datos de progreso inválidos.' });
    }

    const placedPieces = [...new Set(body.placedPieces.map(Number).filter(Number.isInteger))];
    const piecePositions = {};

    for (const [key, value] of Object.entries(body.piecePositions)) {
      const index = Number(key);

      if (Number.isInteger(index) && Array.isArray(value) && value.length === 2) {
        piecePositions[index] = [Number(value[0]), Number(value[1])];
      }
    }

    repository.saveProgress(puzzleId, placedPieces, piecePositions, puzzle.totalPieces);

    return sendJson(response, 200, { ok: true });
  }

  const elapsedMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/elapsed$/);

  if (method === 'POST' && elapsedMatch) {
    const puzzleId = Number(elapsedMatch[1]);
    const body = parseJsonBody(await readBody(request));

    if (!body || !Number.isFinite(Number(body.seconds))) {
      return sendJson(response, 400, { error: 'Segundos inválidos.' });
    }

    repository.addElapsed(puzzleId, Math.max(0, Math.floor(Number(body.seconds))));

    return sendJson(response, 200, { ok: true });
  }

  const renameMatch = pathname.match(/^\/api\/puzzles\/(\d+)\/rename$/);

  if (method === 'POST' && renameMatch) {
    const puzzleId = Number(renameMatch[1]);
    const body = parseJsonBody(await readBody(request));
    const title = typeof body?.title === 'string' ? body.title.trim() : '';

    if (!title) {
      return sendJson(response, 400, { error: 'El título no puede estar vacío.' });
    }

    repository.rename(puzzleId, title);

    return sendJson(response, 200, { ok: true });
  }

  const settingsMatch = pathname.match(/^\/api\/settings\/max-pieces$/);

  if (method === 'POST' && settingsMatch) {
    const body = parseJsonBody(await readBody(request));
    const value = Number(body?.maxPieces);

    if (!Number.isInteger(value) || value < 2 || value > ABSOLUTE_MAX_PIECES) {
      return sendJson(response, 400, {
        error: `El límite debe estar entre 2 y ${ABSOLUTE_MAX_PIECES}.`,
      });
    }

    repository.setMaxPieces(value);

    return sendJson(response, 200, { ok: true, maxPieces: value });
  }

  const deleteMatch = pathname.match(/^\/api\/puzzles\/(\d+)$/);

  if (method === 'DELETE' && deleteMatch) {
    const puzzleId = Number(deleteMatch[1]);
    const puzzle = repository.get(puzzleId);

    if (!puzzle) {
      return sendJson(response, 404, { error: 'Rompecabezas no encontrado.' });
    }

    repository.delete(puzzleId);
    fs.rm(path.join(IMAGES_DIR, path.basename(puzzle.imagePath)), { force: true }, () => {});

    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 404, { error: 'Endpoint no encontrado' });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    const imageMatch = url.pathname.match(/^\/images\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)$/);

    if (imageMatch) {
      serveImage(response, imageMatch[1]);
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    console.error('Error en la petición:', error);

    if (!response.headersSent) {
      sendJson(response, 500, { error: 'Error interno del servidor' });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PuzzleStudio escuchando en http://${HOST}:${PORT}`);
});
