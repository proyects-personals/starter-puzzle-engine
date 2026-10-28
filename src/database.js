'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'puzzles.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_MAX_PIECES = 500;
const ABSOLUTE_MAX_PIECES = 1000;

class PuzzleRepository {
  constructor(databasePath = DATABASE_PATH) {
    this.connection = new DatabaseSync(databasePath);
    this.initialize();
  }

  initialize() {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS puzzles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        image_path TEXT NOT NULL,
        total_pieces INTEGER NOT NULL,
        reference_width INTEGER NOT NULL,
        board_ratio REAL NOT NULL,
        placed_pieces TEXT NOT NULL DEFAULT '[]',
        piece_positions TEXT NOT NULL DEFAULT '{}',
        completed INTEGER NOT NULL DEFAULT 0,
        elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.connection
      .prepare(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('max_pieces', ?)",
      )
      .run(String(DEFAULT_MAX_PIECES));
  }

  getMaxPieces() {
    const row = this.connection
      .prepare("SELECT value FROM settings WHERE key = 'max_pieces'")
      .get();

    return row ? Number(row.value) : DEFAULT_MAX_PIECES;
  }

  setMaxPieces(value) {
    this.connection
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('max_pieces', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(String(value));
  }

  create({ title, imagePath, totalPieces, referenceWidth, boardRatio }) {
    const now = new Date().toISOString();

    const result = this.connection
      .prepare(
        `INSERT INTO puzzles (
           title, image_path, total_pieces, reference_width, board_ratio,
           placed_pieces, piece_positions, completed, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, '[]', '{}', 0, ?, ?)`,
      )
      .run(title, imagePath, totalPieces, referenceWidth, boardRatio, now, now);

    return Number(result.lastInsertRowid);
  }

  get(puzzleId) {
    const row = this.connection
      .prepare('SELECT * FROM puzzles WHERE id = ?')
      .get(puzzleId);

    return row ? this.serialize(row) : null;
  }

  listAll() {
    const rows = this.connection
      .prepare('SELECT * FROM puzzles ORDER BY updated_at DESC, id DESC')
      .all();

    return rows.map((row) => this.serialize(row));
  }

  serialize(row) {
    return {
      id: Number(row.id),
      title: row.title,
      imagePath: row.image_path,
      totalPieces: Number(row.total_pieces),
      referenceWidth: Number(row.reference_width),
      boardRatio: Number(row.board_ratio),
      placedPieces: JSON.parse(row.placed_pieces || '[]'),
      piecePositions: JSON.parse(row.piece_positions || '{}'),
      completed: Number(row.completed) === 1,
      elapsedSeconds: Number(row.elapsed_seconds || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveProgress(puzzleId, placedPieces, piecePositions, totalPieces) {
    const now = new Date().toISOString();
    const completed = placedPieces.length === totalPieces ? 1 : 0;

    this.connection
      .prepare(
        `UPDATE puzzles
         SET placed_pieces = ?,
             piece_positions = ?,
             completed = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        JSON.stringify(placedPieces),
        JSON.stringify(piecePositions),
        completed,
        now,
        puzzleId,
      );
  }

  updateConfiguration(puzzleId, { title, imagePath, totalPieces, referenceWidth, boardRatio, resetProgress = true }) {
    const now = new Date().toISOString();

    /* Cambiar la imagen invalida el progreso (otra cuadrícula);
       cambiar solo título/proporciones lo conserva. */
    const progressReset = resetProgress
      ? "placed_pieces = '[]', piece_positions = '{}', completed = 0,"
      : '';

    this.connection
      .prepare(
        `UPDATE puzzles
         SET title = ?,
             image_path = ?,
             total_pieces = ?,
             reference_width = ?,
             board_ratio = ?,
             ${progressReset}
             updated_at = ?
         WHERE id = ?`,
      )
      .run(title, imagePath, totalPieces, referenceWidth, boardRatio, now, puzzleId);
  }

  addElapsed(puzzleId, seconds) {
    if (seconds <= 0) {
      return;
    }

    this.connection
      .prepare(
        `UPDATE puzzles
         SET elapsed_seconds = elapsed_seconds + ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(Math.floor(seconds), new Date().toISOString(), puzzleId);
  }

  rename(puzzleId, title) {
    this.connection
      .prepare('UPDATE puzzles SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), puzzleId);
  }

  delete(puzzleId) {
    this.connection.prepare('DELETE FROM puzzles WHERE id = ?').run(puzzleId);
  }

  close() {
    this.connection.close();
  }
}

module.exports = { PuzzleRepository, ABSOLUTE_MAX_PIECES, DEFAULT_MAX_PIECES };
