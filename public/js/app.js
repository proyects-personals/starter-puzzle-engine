'use strict';

/* ============================================================
   PuzzleStudio — Núcleo de la aplicación
   ============================================================ */

const App = {
  config: { maxPieces: 500, absoluteMaxPieces: 1000 },
  currentView: 'library',

  async init() {
    await this.loadConfig();
    this.bindNavigation();
    this.bindShortcuts();
    Library.init();
    Settings.init();
    PuzzleView.init();
    PuzzleModal.init();
    Consent.init();
    Settings.loadPrefs();
    Library.refresh();
  },

  async loadConfig() {
    try {
      const response = await fetch('/api/config');
      this.config = await response.json();
    } catch {
      this.config = { maxPieces: 500, absoluteMaxPieces: 1000 };
    }
  },

  bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.showView(button.dataset.view);
      });
    });
  },

  bindShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        if (this.currentView === 'puzzle') PuzzleView.showHint();
      } else if (event.key === 'F2') {
        event.preventDefault();
        if (this.currentView === 'puzzle') PuzzleView.toggleGhost();
      } else if (event.key === 'Escape') {
        if (this.currentView === 'puzzle') PuzzleView.backToLibrary();
      }
    });
  },

  showView(name) {
    this.currentView = name;

    document.querySelectorAll('.view').forEach((view) => {
      view.classList.toggle('active', view.id === `view-${name}`);
    });

    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === name);
    });

    if (name === 'library') {
      Library.refresh();
    }
  },

  /* ---------- Utilidades ---------- */

  async api(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Error de comunicación con el servidor');
    }

    return data;
  },

  toast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 320);
    }, duration);
  },

  formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));

    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  confirm(message) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-overlay');
      const messageEl = document.getElementById('confirm-message');
      const okButton = document.getElementById('confirm-ok');
      const cancelButton = document.getElementById('confirm-cancel');

      messageEl.textContent = message;
      overlay.classList.remove('hidden');

      const close = (result) => {
        overlay.classList.add('hidden');
        okButton.onclick = null;
        cancelButton.onclick = null;
        resolve(result);
      };

      okButton.onclick = () => close(true);
      cancelButton.onclick = () => close(false);
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
