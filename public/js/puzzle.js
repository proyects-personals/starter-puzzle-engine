'use strict';

/* ============================================================
   PuzzleStudio — Vista interactiva del rompecabezas
   ============================================================ */

const PuzzleView = {
  puzzle: null,
  image: null,
  columns: 1,
  rows: 1,
  tileWidth: 1,
  tileHeight: 1,
  board: { x: 0, y: 0, width: 1, height: 1 },
  positions: {},
  placed: new Set(),
  dragging: null,
  dragOffset: { x: 0, y: 0 },
  ghostEnabled: false,
  completed: false,
  sessionSeconds: 0,
  timerInterval: null,
  hintAnimation: null,
  resizeObserver: null,

  init() {
    this.canvas = document.getElementById('board-canvas');
    this.context = this.canvas.getContext('2d');

    document.getElementById('btn-back').addEventListener('click', () => this.backToLibrary());
    document.getElementById('btn-hint').addEventListener('click', () => this.showHint());
    document.getElementById('btn-ghost').addEventListener('click', () => this.toggleGhost());
    document.getElementById('btn-rename').addEventListener('click', () => this.renamePuzzle());
    document.getElementById('btn-export').addEventListener('click', () => this.exportImage());
    document.getElementById('btn-config').addEventListener('click', () => {
      PuzzleModal.openEdit(this.puzzle.id);
    });
    document.getElementById('btn-shuffle').addEventListener('click', () => this.resetPuzzle());

    /* En móvil, alternar el panel de referencia (ahorra espacio de juego) */
    document.getElementById('btn-reference').addEventListener('click', () => {
      const panel = document.getElementById('reference-panel');
      const button = document.getElementById('btn-reference');
      const visible = panel.classList.toggle('open');
      button.classList.toggle('active', visible);
      button.textContent = visible ? '🖼 Referencia ✓' : '🖼 Referencia';
      this.render();
    });

    this.canvas.addEventListener('pointerdown', (event) => this.onDragStart(event));
    this.canvas.addEventListener('pointermove', (event) => this.onDragMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onDragEnd(event));
    this.canvas.addEventListener('pointercancel', () => {
      this.dragging = null;
      this.canvas.classList.remove('dragging');
    });

    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.canvas.parentElement);

    /* Evitar zoom por doble toque / pinch mientras se juega en móvil */
    document.getElementById('board-canvas').style.touchAction = 'none';
  },

  async open(puzzleId) {
    try {
      this.puzzle = await App.api(`/api/puzzles/${puzzleId}`);
    } catch (error) {
      App.toast(error.message, 'error');
      return;
    }

    if (!this.puzzle) {
      App.toast('Rompecabezas no encontrado', 'error');
      return;
    }

    const image = new Image();

    image.onload = () => {
      this.image = image;
      this.prepareSession();
      App.showView('puzzle');
    };

    image.onerror = () => {
      App.toast('No se pudo cargar la imagen del rompecabezas', 'error');
    };

    image.src = `/images/${encodeURIComponent(this.puzzle.imagePath)}`;
  },

  prepareSession() {
    const total = this.puzzle.totalPieces;
    const [columns, rows] = PuzzleEngine.gridDimensions(total, this.image.width, this.image.height);

    this.columns = columns;
    this.rows = rows;
    this.placed = new Set(this.puzzle.placedPieces);
    this.positions = {};

    for (const [key, value] of Object.entries(this.puzzle.piecePositions)) {
      this.positions[Number(key)] = value;
    }

    this.completed = this.placed.size === total;
    this.sessionSeconds = 0;
    this.currentPositions = {};

    document.getElementById('puzzle-title').textContent = this.puzzle.title;
    document.getElementById('reference-image').src = `/images/${encodeURIComponent(this.puzzle.imagePath)}`;
    document.getElementById('reference-size').textContent = `${this.image.width} × ${this.image.height} px`;

    this.updateGhostButton();
    this.startTimer();
    this.render();
    this.updateProgress();
  },

  reload() {
    if (this.puzzle) {
      this.open(this.puzzle.id);
    }
  },

  /* ---------- Renderizado ---------- */

  render() {
    if (!this.image || App.currentView !== 'puzzle') {
      return;
    }

    /* Preservar la posición de la pieza arrastrada: render() recalcula las
       posiciones y sin esto la pieza en curso "salta" a su lugar anterior. */
    const draggingIndex = this.dragging;
    const draggingPos = draggingIndex !== null && this.currentPositions?.[draggingIndex]
      ? [...this.currentPositions[draggingIndex]]
      : null;

    const wrap = this.canvas.parentElement;
    const areaWidth = wrap.clientWidth;
    const areaHeight = wrap.clientHeight;

    if (areaWidth < 60 || areaHeight < 60) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = areaWidth * dpr;
    this.canvas.height = areaHeight * dpr;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ratio = this.boardRatio();
    const maxWidth = areaWidth * ratio;
    const maxHeight = areaHeight * ratio;
    const imageRatio = this.image.width / this.image.height;
    const areaRatio = maxWidth / maxHeight;

    if (imageRatio > areaRatio) {
      this.board.width = Math.floor(maxWidth);
      this.board.height = Math.floor(this.board.width / imageRatio);
    } else {
      this.board.height = Math.floor(maxHeight);
      this.board.width = Math.floor(this.board.height * imageRatio);
    }

    this.board.width = Math.max(this.board.width, this.columns);
    this.board.height = Math.max(this.board.height, this.rows);
    this.board.x = Math.floor((areaWidth - this.board.width) / 2);
    this.board.y = Math.floor((areaHeight - this.board.height) / 2);

    this.tileWidth = Math.max(1, Math.floor(this.board.width / this.columns));
    this.tileHeight = Math.max(1, Math.floor(this.board.height / this.rows));

    const ctx = this.context;

    ctx.clearRect(0, 0, areaWidth, areaHeight);

    if (this.ghostEnabled) {
      ctx.globalAlpha = 0.25;
      ctx.drawImage(
        this.image,
        this.board.x,
        this.board.y,
        this.board.width,
        this.board.height,
      );
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      this.board.x,
      this.board.y,
      this.board.width,
      this.board.height,
    );

    for (let index = 0; index < this.puzzle.totalPieces; index += 1) {
      const column = index % this.columns;
      const row = Math.floor(index / this.columns);
      const x = this.board.x + column * this.tileWidth;
      const y = this.board.y + row * this.tileHeight;

      ctx.fillStyle = '#1b2640';
      ctx.fillRect(x, y, this.tileWidth, this.tileHeight);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, this.tileWidth - 1, this.tileHeight - 1);
    }

    const pieces = [];

    for (let index = 0; index < this.puzzle.totalPieces; index += 1) {
      if (this.placed.has(index)) {
        const column = index % this.columns;
        const row = Math.floor(index / this.columns);
        pieces.push({
          index,
          x: this.board.x + column * this.tileWidth,
          y: this.board.y + row * this.tileHeight,
          placed: true,
        });
      } else {
        const [x, y] = this.piecePosition(index, areaWidth, areaHeight);
        this.currentPositions[index] = [x, y];
        pieces.push({ index, x, y, placed: false });
      }
    }

    pieces
      .sort((a, b) => Number(a.placed) - Number(b.placed))
      .forEach((piece) => this.drawPiece(piece));

    /* Redibujar la pieza arrastrada al final para que quede por encima de las demás */
    if (draggingIndex !== null && draggingPos) {
      this.currentPositions[draggingIndex] = draggingPos;
      this.drawPiece({ index: draggingIndex, x: draggingPos[0], y: draggingPos[1], placed: false });
    }
  },

  drawPiece(piece) {
    const ctx = this.context;
    const sourceColumn = piece.index % this.columns;
    const sourceRow = Math.floor(piece.index / this.columns);
    const sourceX = (sourceColumn * this.image.width) / this.columns;
    const sourceY = (sourceRow * this.image.height) / this.rows;
    const sourceWidth = this.image.width / this.columns;
    const sourceHeight = this.image.height / this.rows;

    ctx.drawImage(
      this.image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      piece.x,
      piece.y,
      this.tileWidth,
      this.tileHeight,
    );

    if (piece.placed) {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(piece.x + 0.75, piece.y + 0.75, this.tileWidth - 1.5, this.tileHeight - 1.5);
    } else {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(piece.x + 0.5, piece.y + 0.5, this.tileWidth - 1, this.tileHeight - 1);
    }
  },

  boardRatio() {
    const raw = Number(this.puzzle?.boardRatio ?? 0.72);
    return Math.max(0.4, Math.min(Number.isFinite(raw) ? raw : 0.72, 0.9));
  },

  piecePosition(index, areaWidth, areaHeight) {
    const saved = this.positions[index];

    if (saved) {
      const x = Math.round(saved[0] * areaWidth);
      const y = Math.round(saved[1] * areaHeight);
      const insideBoard =
        x >= this.board.x - this.tileWidth / 2 &&
        x < this.board.x + this.board.width - this.tileWidth / 2 &&
        y >= this.board.y - this.tileHeight / 2 &&
        y < this.board.y + this.board.height - this.tileHeight / 2;

      if (!insideBoard) {
        return this.clampPiece(x, y, areaWidth, areaHeight);
      }

      delete this.positions[index];
    }

    const [x, y] = PuzzleEngine.scatterPosition(areaWidth, areaHeight, this.board, {
      width: this.tileWidth,
      height: this.tileHeight,
    });

    return [x, y];
  },

  clampPiece(x, y, areaWidth, areaHeight) {
    return [
      PuzzleEngine.clamp(x, 0, Math.max(areaWidth - this.tileWidth, 0)),
      PuzzleEngine.clamp(y, 0, Math.max(areaHeight - this.tileHeight, 0)),
    ];
  },

  /* ---------- Interacción ---------- */

  pieceAt(x, y) {
    for (let index = this.puzzle.totalPieces - 1; index >= 0; index -= 1) {
      if (this.placed.has(index)) {
        continue;
      }

      const position = this.currentPositions?.[index];

      if (!position) {
        continue;
      }

      if (
        x >= position[0] &&
        x < position[0] + this.tileWidth &&
        y >= position[1] &&
        y < position[1] + this.tileHeight
      ) {
        return index;
      }
    }

    return null;
  },

  onDragStart(event) {
    if (!this.puzzle || this.completed) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const index = this.pieceAt(x, y);

    if (index === null) {
      return;
    }

    this.dragging = index;
    this.dragOffset = {
      x: x - this.currentPositions[index][0],
      y: y - this.currentPositions[index][1],
    };
    this.canvas.classList.add('dragging');

    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* Algunos navegadores lanzan si el pointer ya no está activo; el drag sigue */
    }
  },

  onDragMove(event) {
    if (this.dragging === null) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - this.dragOffset.x;
    const y = event.clientY - rect.top - this.dragOffset.y;
    const [clampedX, clampedY] = this.clampPiece(
      x,
      y,
      this.canvas.parentElement.clientWidth,
      this.canvas.parentElement.clientHeight,
    );

    this.currentPositions[this.dragging] = [clampedX, clampedY];
    this.render();
  },

  onDragEnd(event) {
    if (this.dragging === null) {
      return;
    }

    const index = this.dragging;
    this.dragging = null;
    this.canvas.classList.remove('dragging');

    const [currentX, currentY] = this.currentPositions[index];
    const column = index % this.columns;
    const row = Math.floor(index / this.columns);
    const targetX = this.board.x + column * this.tileWidth;
    const targetY = this.board.y + row * this.tileHeight;
    const threshold = Math.max(18, Math.min(this.tileWidth, this.tileHeight) * 0.3);

    if (Math.abs(currentX - targetX) <= threshold && Math.abs(currentY - targetY) <= threshold) {
      this.currentPositions[index] = [targetX, targetY];
      this.placed.add(index);
      delete this.positions[index];
      this.updateProgress();
      this.saveProgress();

      if (this.placed.size === this.puzzle.totalPieces) {
        this.completePuzzle();
      }
    } else {
      const areaWidth = this.canvas.parentElement.clientWidth;
      const areaHeight = this.canvas.parentElement.clientHeight;
      this.positions[index] = [currentX / areaWidth, currentY / areaHeight];
    }

    this.saveProgress();
    this.render();
  },

  /* ---------- Progreso y persistencia ---------- */

  updateProgress() {
    const total = this.puzzle.totalPieces;
    const placed = this.placed.size;
    const percent = total > 0 ? Math.round((placed / total) * 100) : 0;

    document.getElementById('stat-progress').textContent = `${placed} / ${total}`;
    document.getElementById('progress-bar').style.width = `${percent}%`;
    document.getElementById('progress-text').textContent =
      `${placed} de ${total} piezas · ${percent}%`;
  },

  async saveProgress() {
    if (!this.puzzle) {
      return;
    }

    const areaWidth = Math.max(this.canvas.parentElement.clientWidth, 1);
    const areaHeight = Math.max(this.canvas.parentElement.clientHeight, 1);
    const serialized = {};

    for (const [index, position] of Object.entries(this.positions)) {
      serialized[index] = position;
    }

    for (let index = 0; index < this.puzzle.totalPieces; index += 1) {
      if (this.placed.has(index) || this.currentPositions?.[index] === undefined) {
        continue;
      }

      const [x, y] = this.currentPositions[index];
      serialized[index] = [x / areaWidth, y / areaHeight];
    }

    try {
      await App.api(`/api/puzzles/${this.puzzle.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          placedPieces: [...this.placed],
          piecePositions: serialized,
        }),
      });
    } catch {
      /* El progreso se reintenta en la siguiente acción */
    }
  },

  completePuzzle() {
    this.completed = true;
    this.stopTimer();

    const elapsed = this.sessionSeconds;

    App.api(`/api/puzzles/${this.puzzle.id}/elapsed`, {
      method: 'POST',
      body: JSON.stringify({ seconds: elapsed }),
    }).catch(() => {});

    App.toast(`¡Completado en ${App.formatTime(elapsed)}! 🎉`, 'success', 6000);
  },

  /* ---------- Cronómetro ---------- */

  startTimer() {
    this.stopTimer();
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      this.sessionSeconds += 1;
      this.updateTimerDisplay();
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  updateTimerDisplay() {
    document.getElementById('stat-timer').textContent = `⏱ ${App.formatTime(this.sessionSeconds)}`;
  },

  /* ---------- Acciones ---------- */

  toggleGhost() {
    this.ghostEnabled = !this.ghostEnabled;
    this.updateGhostButton();
    this.render();
  },

  updateGhostButton() {
    document.getElementById('btn-ghost').textContent =
      `👁 Fantasma: ${this.ghostEnabled ? 'on' : 'off'}`;
  },

  showHint() {
    if (!this.puzzle || this.completed) {
      return;
    }

    const pending = [];

    for (let index = 0; index < this.puzzle.totalPieces; index += 1) {
      if (!this.placed.has(index)) {
        pending.push(index);
      }
    }

    if (pending.length === 0) {
      return;
    }

    const index = pending.reduce((lowest, current) =>
      this.currentPositions[current]?.[0] < this.currentPositions[lowest]?.[0] ? current : lowest,
    );

    const column = index % this.columns;
    const row = Math.floor(index / this.columns);
    const targetX = this.board.x + column * this.tileWidth;
    const targetY = this.board.y + row * this.tileHeight;

    if (this.hintAnimation) {
      cancelAnimationFrame(this.hintAnimation);
    }

    let frame = 0;
    const animate = () => {
      this.render();

      const offset = Math.sin(frame / 4) * 4;
      this.context.strokeStyle = '#facc15';
      this.context.lineWidth = 4;
      this.context.strokeRect(
        targetX + offset,
        targetY + offset,
        this.tileWidth,
        this.tileHeight,
      );

      frame += 1;

      if (frame < 36) {
        this.hintAnimation = requestAnimationFrame(animate);
      } else {
        this.hintAnimation = null;
        this.render();
      }
    };

    animate();
  },

  async renamePuzzle() {
    const title = prompt('Nuevo título:', this.puzzle.title);

    if (title === null || !title.trim()) {
      return;
    }

    try {
      await App.api(`/api/puzzles/${this.puzzle.id}/rename`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() }),
      });

      this.puzzle.title = title.trim();
      document.getElementById('puzzle-title').textContent = this.puzzle.title;
      App.toast('Título actualizado', 'success');
    } catch (error) {
      App.toast(error.message, 'error');
    }
  },

  exportImage() {
    if (!this.image) {
      return;
    }

    const link = document.createElement('a');
    link.download = `${this.puzzle.title}.png`;
    link.href = `/images/${encodeURIComponent(this.puzzle.imagePath)}`;
    link.click();

    App.toast('Imagen descargada', 'success');
  },

  async resetPuzzle() {
    const confirmed = await App.confirm(
      '¿Reiniciar el rompecabezas? Se perderá el progreso actual.',
    );

    if (!confirmed) {
      return;
    }

    this.placed.clear();
    this.positions = {};
    this.completed = false;
    this.currentPositions = {};
    this.sessionSeconds = 0;
    this.startTimer();
    this.render();
    this.updateProgress();
    this.saveProgress();
    App.toast('Piezas mezcladas', 'info');
  },

  backToLibrary() {
    this.stopTimer();
    this.saveProgress();

    if (this.hintAnimation) {
      cancelAnimationFrame(this.hintAnimation);
      this.hintAnimation = null;
    }

    App.showView('library');
  },
};
