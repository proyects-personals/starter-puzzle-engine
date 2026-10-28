'use strict';

/* ============================================================
   PuzzleStudio — Vista de configuración general
   ============================================================ */

const Settings = {
  init() {
    document.getElementById('btn-save-max').addEventListener('click', () => {
      this.saveMaxPieces();
    });

    this.loadMaxPieces();
    this.savePrefs = this.savePrefs.bind(this);

    /* Guardar preferencias en localStorage solo con consentimiento */
    window.addEventListener('beforeunload', () => this.savePrefs());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.savePrefs();
      }
    });
  },

  /* Preferencias locales (requieren consentimiento de cookies técnicas) */
  savePrefs() {
    if (!Consent.hasPreferencesConsent()) {
      return;
    }

    try {
      localStorage.setItem(Consent.PREFS_KEY, JSON.stringify({
        ghost: PuzzleView.ghostEnabled,
        reference: document.getElementById('btn-reference')?.classList.contains('active'),
      }));
    } catch { /* localStorage no disponible */ }
  },

  loadPrefs() {
    if (!Consent.hasPreferencesConsent()) {
      return;
    }

    try {
      const prefs = JSON.parse(localStorage.getItem(Consent.PREFS_KEY) || '{}');

      if (prefs.ghost && !PuzzleView.ghostEnabled) {
        PuzzleView.toggleGhost();
      }

      if (prefs.reference) {
        document.getElementById('btn-reference')?.classList.add('active');
      }
    } catch { /* preferencias corruptas: ignorar */ }
  },

  async loadMaxPieces() {
    const input = document.getElementById('settings-max-pieces');
    input.value = App.config.maxPieces;
    input.max = App.config.absoluteMaxPieces;
  },

  async saveMaxPieces() {
    const input = document.getElementById('settings-max-pieces');
    const feedback = document.getElementById('settings-feedback');
    const value = Number(input.value);

    const showFeedback = (message, type) => {
      feedback.textContent = message;
      feedback.className = `feedback ${type}`;
      setTimeout(() => feedback.classList.add('hidden'), 3000);
    };

    if (!Number.isInteger(value) || value < 2 || value > App.config.absoluteMaxPieces) {
      showFeedback(`El límite debe estar entre 2 y ${App.config.absoluteMaxPieces}.`, 'err');
      return;
    }

    try {
      await App.api('/api/settings/max-pieces', {
        method: 'POST',
        body: JSON.stringify({ maxPieces: value }),
      });

      App.config.maxPieces = value;
      showFeedback('Límite guardado correctamente.', 'ok');
      App.toast('Límite de piezas actualizado', 'success');
    } catch (error) {
      showFeedback(error.message, 'err');
    }
  },
};
