'use strict';

/* ============================================================
   PuzzleStudio — Modal de crear / configurar rompecabezas
   ============================================================ */

const PuzzleModal = {
  mode: 'create',
  puzzleId: null,
  imageData: null,
  imageElement: null,

  init() {
    this.overlay = document.getElementById('modal-overlay');
    this.titleEl = document.getElementById('modal-title');
    this.saveButton = document.getElementById('modal-save');
    this.nameInput = document.getElementById('puzzle-name');
    this.piecesInput = document.getElementById('puzzle-pieces');
    this.referenceInput = document.getElementById('puzzle-reference');
    this.ratioInput = document.getElementById('puzzle-ratio');
    this.imageInput = document.getElementById('puzzle-image-input');
    this.imageNameEl = document.getElementById('puzzle-image-name');
    this.previewImg = document.getElementById('puzzle-preview');
    this.previewPlaceholder = document.getElementById('preview-placeholder');
    this.gridInfo = document.getElementById('preview-grid-info');

    document.getElementById('modal-close').addEventListener('click', () => this.close());
    document.getElementById('modal-cancel').addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.close();
      }
    });

    this.imageInput.addEventListener('change', () => this.handleImageSelected());

    this.piecesInput.addEventListener('input', () => {
      document.getElementById('pieces-value').textContent = this.piecesInput.value;
      this.updateGridInfo();
    });

    this.ratioInput.addEventListener('input', () => {
      document.getElementById('ratio-value').textContent = Number(this.ratioInput.value).toFixed(2);
    });

    this.referenceInput.addEventListener('input', () => {
      document.getElementById('reference-value').textContent = `${this.referenceInput.value} px`;
    });

    this.saveButton.addEventListener('click', () => this.save());
  },

  openCreate() {
    this.mode = 'create';
    this.puzzleId = null;
    this.imageData = null;
    this.imageElement = null;

    this.titleEl.textContent = 'Nuevo rompecabezas';
    this.saveButton.textContent = 'Crear rompecabezas';
    this.nameInput.value = '';
    this.piecesInput.value = Math.min(36, App.config.maxPieces);
    this.referenceInput.value = 300;
    this.ratioInput.value = 0.72;
    this.imageInput.value = '';
    this.imageNameEl.textContent = 'Sin imagen seleccionada';
    this.previewImg.classList.add('hidden');
    this.previewPlaceholder.classList.remove('hidden');
    this.gridInfo.textContent = '';

    document.getElementById('pieces-value').textContent = this.piecesInput.value;
    document.getElementById('reference-value').textContent = '300 px';
    document.getElementById('ratio-value').textContent = '0.72';

    this.piecesInput.max = App.config.maxPieces;
    this.overlay.classList.remove('hidden');
    this.nameInput.focus();
  },

  async openEdit(puzzleId) {
    const puzzle = await App.api(`/api/puzzles`).then((list) =>
      list.find((item) => item.id === puzzleId),
    );

    if (!puzzle) {
      App.toast('No se pudo cargar el rompecabezas', 'error');
      return;
    }

    this.mode = 'edit';
    this.puzzleId = puzzleId;
    this.imageData = null;
    this.imageElement = null;

    this.titleEl.textContent = 'Configurar rompecabezas';
    this.saveButton.textContent = 'Aplicar cambios';
    this.nameInput.value = puzzle.title;
    this.piecesInput.value = puzzle.totalPieces;
    this.referenceInput.value = puzzle.referenceWidth;
    this.ratioInput.value = puzzle.boardRatio;
    this.imageInput.value = '';
    this.imageNameEl.textContent = puzzle.imagePath;
    this.gridInfo.textContent = '';

    this.previewImg.src = `/images/${encodeURIComponent(puzzle.imagePath)}`;
    this.previewImg.classList.remove('hidden');
    this.previewPlaceholder.classList.add('hidden');

    document.getElementById('pieces-value').textContent = puzzle.totalPieces;
    document.getElementById('reference-value').textContent = `${puzzle.referenceWidth} px`;
    document.getElementById('ratio-value').textContent = Number(puzzle.boardRatio).toFixed(2);

    this.piecesInput.max = App.config.maxPieces;
    this.overlay.classList.remove('hidden');
  },

  handleImageSelected() {
    const file = this.imageInput.files[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      App.toast('El archivo no es una imagen', 'error');
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        this.imageData = reader.result;
        this.imageElement = image;
        this.imageNameEl.textContent = file.name;

        this.previewImg.src = reader.result;
        this.previewImg.classList.remove('hidden');
        this.previewPlaceholder.classList.add('hidden');

        if (!this.nameInput.value.trim()) {
          this.nameInput.value = file.name.replace(/\.[^.]+$/, '');
        }

        this.updateGridInfo();
      };

      image.onerror = () => {
        App.toast('No se pudo leer la imagen', 'error');
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  },

  updateGridInfo() {
    if (!this.imageElement) {
      this.gridInfo.textContent = '';
      return;
    }

    const total = Number(this.piecesInput.value);
    const [columns, rows] = PuzzleEngine.gridDimensions(total, this.imageElement.width, this.imageElement.height);

    this.gridInfo.textContent = `Cuadrícula: ${columns} × ${rows} piezas`;
  },

  async save() {
    const title = this.nameInput.value.trim();

    if (!title) {
      App.toast('Escribe un nombre para el rompecabezas', 'warning');
      this.nameInput.focus();
      return;
    }

    const payload = {
      title,
      totalPieces: Number(this.piecesInput.value),
      referenceWidth: Number(this.referenceInput.value),
      boardRatio: Number(this.ratioInput.value),
    };

    /* En creación la imagen es obligatoria; en edición, opcional
       (si no se elige una nueva se conserva la actual). */
    if (this.imageData) {
      payload.imageData = this.imageData;
    } else if (this.mode === 'create') {
      App.toast('Selecciona una imagen', 'warning');
      return;
    }

    try {
      this.saveButton.disabled = true;
      this.saveButton.textContent = 'Guardando…';

      if (this.mode === 'create') {
        const result = await App.api('/api/puzzles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        App.toast('Rompecabezas creado', 'success');
        this.close();
        Library.refresh();
        PuzzleView.open(result.id);
      } else {
        await App.api(`/api/puzzles/${this.puzzleId}/config`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        App.toast('Configuración actualizada', 'success');
        this.close();
        PuzzleView.reload();
      }
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      this.saveButton.disabled = false;
      this.saveButton.textContent = this.mode === 'create' ? 'Crear rompecabezas' : 'Aplicar cambios';
    }
  },

  close() {
    this.overlay.classList.add('hidden');
  },
};
