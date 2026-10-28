'use strict';

/* ============================================================
   PuzzleStudio — Banner de cookies y gestión de permisos
   Almacenamiento técnico (localStorage): preferencias del
   usuario y estado del consentimiento. Sin cookies de
   terceros, analítica ni publicidad.
   ============================================================ */

const Consent = {
  KEY: 'puzzlestudio-consent',
  PREFS_KEY: 'puzzlestudio-prefs',

  /* Estado por defecto: nada aceptado hasta decisión explícita */
  state: {
    accepted: false,
    preferences: false,
    date: null,
  },

  init() {
    this.load();

    this.banner = document.getElementById('cookie-banner');
    this.statusEl = document.getElementById('consent-status');
    this.toggle = document.getElementById('consent-preferences');

    document.getElementById('cookie-accept').addEventListener('click', () => {
      this.grant({ accepted: true, preferences: true });
    });

    document.getElementById('cookie-reject').addEventListener('click', () => {
      this.grant({ accepted: true, preferences: false });
      App.toast('Has rechazado las cookies de preferencias', 'info');
    });

    document.getElementById('cookie-config').addEventListener('click', () => {
      this.hideBanner();
      App.showView('settings');
    });

    document.getElementById('btn-save-consent').addEventListener('click', () => {
      this.grant({ accepted: true, preferences: this.toggle.checked });
      App.toast('Preferencias de cookies guardadas', 'success');
    });

    document.getElementById('btn-revoke-consent').addEventListener('click', () => {
      this.state = { accepted: false, preferences: false, date: null };
      this.persist();
      this.refreshSettings();
      this.showBanner();
      App.toast('Consentimiento revocado', 'info');
    });

    this.refreshSettings();

    /* Mostrar el banner si aún no hay decisión */
    if (!this.state.accepted) {
      this.showBanner();
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);

      if (raw) {
        this.state = { ...this.state, ...JSON.parse(raw) };
        return;
      }
    } catch {
      /* localStorage bloqueado: se pide consentimiento de nuevo */
    }

    /* Migración: si ya existían preferencias guardadas, ofrecerlas */
    if (localStorage.getItem(this.PREFS_KEY)) {
      this.state.preferences = true;
    }
  },

  persist() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.state));
    } catch {
      /* Sin acceso a localStorage: la app sigue funcionando */
    }
  },

  grant({ accepted, preferences }) {
    this.state = {
      accepted,
      preferences,
      date: new Date().toISOString(),
    };
    this.persist();
    this.hideBanner();
    this.refreshSettings();

    if (!preferences) {
      /* Borrar preferencias previas si el usuario las rechaza */
      try {
        localStorage.removeItem(this.PREFS_KEY);
      } catch { /* noop */ }
    }
  },

  showBanner() {
    this.banner?.classList.remove('hidden');
  },

  hideBanner() {
    this.banner?.classList.add('hidden');
  },

  refreshSettings() {
    if (!this.statusEl) {
      return;
    }

    const hasDecision = this.state.accepted;

    this.statusEl.textContent = hasDecision
      ? (this.state.preferences ? 'aceptadas (con preferencias)' : 'rechazadas')
      : 'sin decidir';

    if (this.toggle) {
      this.toggle.checked = Boolean(this.state.preferences);
    }
  },

  hasPreferencesConsent() {
    return this.state.accepted && this.state.preferences;
  },
};
