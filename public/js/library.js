'use strict';

/* ============================================================
   PuzzleStudio — Vista de biblioteca
   ============================================================ */

const Library = {
  puzzles: [],
  searchTerm: '',

  init() {
    document.getElementById('btn-new-puzzle').addEventListener('click', () => {
      PuzzleModal.openCreate();
    });

    document.getElementById('btn-empty-new').addEventListener('click', () => {
      PuzzleModal.openCreate();
    });

    const search = document.getElementById('library-search');

    search.addEventListener('input', () => {
      this.searchTerm = search.value.trim().toLowerCase();
      this.render();
    });
  },

  async refresh() {
    try {
      this.puzzles = await App.api('/api/puzzles');
    } catch (error) {
      App.toast(error.message, 'error');
      this.puzzles = [];
    }

    this.render();
  },

  render() {
    const grid = document.getElementById('library-grid');
    const empty = document.getElementById('library-empty');
    const count = document.getElementById('library-count');

    const filtered = this.puzzles.filter((puzzle) =>
      puzzle.title.toLowerCase().includes(this.searchTerm),
    );

    count.textContent =
      this.puzzles.length === 0
        ? 'Aún no hay rompecabezas'
        : `${this.puzzles.length} rompecabeza${this.puzzles.length === 1 ? '' : 's'}`;

    grid.innerHTML = '';

    if (filtered.length === 0) {
      empty.classList.toggle('hidden', this.puzzles.length > 0 && this.searchTerm === '');
      grid.classList.toggle('hidden', filtered.length === 0);

      if (this.puzzles.length > 0 && this.searchTerm !== '') {
        count.textContent = 'Sin resultados para tu búsqueda';
      }

      return;
    }

    empty.classList.add('hidden');
    grid.classList.remove('hidden');

    filtered.forEach((puzzle, index) => {
      const card = this.buildCard(puzzle);
      card.style.animationDelay = `${Math.min(index * 40, 400)}ms`;
      grid.appendChild(card);
    });
  },

  buildCard(puzzle) {
    const card = document.createElement('article');
    card.className = 'puzzle-card';

    const placed = puzzle.placedPieces.length;
    const total = puzzle.totalPieces;
    const percent = total > 0 ? Math.round((placed / total) * 100) : 0;

    const timeText =
      puzzle.elapsedSeconds > 0 ? ` · ${App.formatTime(puzzle.elapsedSeconds)}` : '';

    card.innerHTML = `
      <div class="puzzle-card-thumb">
        <img src="/images/${encodeURIComponent(puzzle.imagePath)}" alt="${this.escapeHtml(puzzle.title)}" loading="lazy">
      </div>
      <div class="puzzle-card-body">
        <div class="puzzle-card-title">${this.escapeHtml(puzzle.title)}</div>
        <div class="puzzle-card-meta">
          <span>${total} piezas · ${percent}%${timeText}</span>
          ${puzzle.completed ? '<span class="badge-completed">✓ Completado</span>' : ''}
        </div>
        <div class="puzzle-card-progress">
          <div class="puzzle-card-progress-fill" style="width:${percent}%"></div>
        </div>
      </div>
      <button class="puzzle-card-delete" title="Eliminar">🗑</button>
    `;

    card.addEventListener('click', (event) => {
      if (event.target.closest('.puzzle-card-delete')) {
        return;
      }

      PuzzleView.open(puzzle.id);
    });

    card.querySelector('.puzzle-card-delete').addEventListener('click', async () => {
      const confirmed = await App.confirm(
        `¿Eliminar "${puzzle.title}"? Esta acción no se puede deshacer.`,
      );

      if (!confirmed) {
        return;
      }

      try {
        await App.api(`/api/puzzles/${puzzle.id}`, { method: 'DELETE' });
        App.toast('Rompecabezas eliminado', 'success');
        this.refresh();
      } catch (error) {
        App.toast(error.message, 'error');
      }
    });

    return card;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
