/**
 * Visitor accessibility: contrast themes + text scaling (persisted in localStorage).
 * Works alongside Firestore CMS theme when "Site default (CMS)" is selected.
 */
(function () {
  const KEY_COLOR = 'mam_a11y_color';
  const KEY_FONT = 'mam_a11y_font';

  const COLOR_CLASS_IDS = ['hc-dark', 'hc-light', 'soft'];
  const FONT_IDS = ['100', '112', '125', '137'];

  function safeGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  function safeSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch {
      /* ignore */
    }
  }

  function applyColor(mode) {
    const html = document.documentElement;
    COLOR_CLASS_IDS.forEach((id) => html.classList.remove(`a11y-color-${id}`));
    const m = mode && ['default', ...COLOR_CLASS_IDS].includes(mode) ? mode : 'default';
    if (m !== 'default') {
      html.classList.add(`a11y-color-${m}`);
      if (window.MamCms && typeof window.MamCms.clearCmsThemeInlineVars === 'function') {
        window.MamCms.clearCmsThemeInlineVars();
      }
    } else if (window.MamCms && typeof window.MamCms.reapplyFirestoreTheme === 'function') {
      window.MamCms.reapplyFirestoreTheme();
    }
  }

  function applyFont(scaleId) {
    const html = document.documentElement;
    FONT_IDS.forEach((id) => html.classList.remove(`a11y-font-${id}`));
    const s = scaleId && FONT_IDS.includes(scaleId) ? scaleId : '100';
    html.classList.add(`a11y-font-${s}`);
  }

  function syncForm(panel) {
    const c = safeGet(KEY_COLOR, 'default');
    const f = safeGet(KEY_FONT, '100');
    panel.querySelectorAll('input[name="mam-a11y-color"]').forEach((inp) => {
      inp.checked = inp.value === c;
    });
    panel.querySelectorAll('input[name="mam-a11y-font"]').forEach((inp) => {
      inp.checked = inp.value === f;
    });
  }

  function openPanel(root, trigger) {
    root.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const first = root.querySelector('input[type="radio"]:checked') || root.querySelector('input');
    first?.focus();
  }

  function closePanel(root, trigger) {
    root.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }

  function buildUi() {
    if (document.getElementById('mam-a11y-widget')) return;

    const wrap = document.createElement('div');
    wrap.id = 'mam-a11y-widget';
    wrap.innerHTML = `
      <button type="button" class="a11y-trigger" id="mam-a11y-trigger" aria-expanded="false" aria-controls="mam-a11y-panel">
        Accessibility
      </button>
      <div id="mam-a11y-panel" class="a11y-panel" role="dialog" aria-modal="true" aria-labelledby="mam-a11y-title" hidden>
        <div class="a11y-panel-inner">
          <h2 id="mam-a11y-title" class="a11y-panel-title">Accessibility</h2>
          <p class="a11y-panel-desc">Adjust colors and text size. Choices are saved on this device.</p>

          <fieldset class="a11y-fieldset">
            <legend>Display colors</legend>
            <label class="a11y-option"><input type="radio" name="mam-a11y-color" value="default" /> Site default (CMS / original)</label>
            <label class="a11y-option"><input type="radio" name="mam-a11y-color" value="hc-dark" /> High contrast dark</label>
            <label class="a11y-option"><input type="radio" name="mam-a11y-color" value="hc-light" /> High contrast light</label>
            <label class="a11y-option"><input type="radio" name="mam-a11y-color" value="soft" /> Softer warm (less glare)</label>
          </fieldset>

          <fieldset class="a11y-fieldset">
            <legend>Text size</legend>
            <label class="a11y-option"><input type="radio" name="mam-a11y-font" value="100" /> Standard</label>
            <label class="a11y-option"><input type="radio" name="mam-a11y-font" value="112" /> Medium larger (~112%)</label>
            <label class="a11y-option"><input type="radio" name="mam-a11y-font" value="125" /> Large (~125%)</label>
            <label class="a11y-option"><input type="radio" name="mam-a11y-font" value="137" /> Extra large (~137%)</label>
          </fieldset>

          <div class="a11y-actions">
            <button type="button" class="btn ghost" id="mam-a11y-reset">Reset all</button>
            <button type="button" class="btn primary" id="mam-a11y-close">Done</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    const panel = wrap.querySelector('#mam-a11y-panel');
    const trigger = wrap.querySelector('#mam-a11y-trigger');

    syncForm(panel);

    wrap.querySelectorAll('input[name="mam-a11y-color"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        if (inp.checked) {
          safeSet(KEY_COLOR, inp.value);
          applyColor(inp.value);
        }
      });
    });

    wrap.querySelectorAll('input[name="mam-a11y-font"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        if (inp.checked) {
          safeSet(KEY_FONT, inp.value);
          applyFont(inp.value);
        }
      });
    });

    trigger.addEventListener('click', () => {
      if (panel.hidden) openPanel(panel, trigger);
      else closePanel(panel, trigger);
    });

    wrap.querySelector('#mam-a11y-close').addEventListener('click', () => closePanel(panel, trigger));

    wrap.querySelector('#mam-a11y-reset').addEventListener('click', () => {
      safeSet(KEY_COLOR, 'default');
      safeSet(KEY_FONT, '100');
      applyColor('default');
      applyFont('100');
      syncForm(panel);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) {
        closePanel(panel, trigger);
      }
    });

    document.addEventListener('click', (e) => {
      if (!panel.hidden && !wrap.contains(e.target)) {
        closePanel(panel, trigger);
      }
    });
  }

  function init() {
    applyColor(safeGet(KEY_COLOR, 'default'));
    applyFont(safeGet(KEY_FONT, '100'));
    buildUi();

    document.addEventListener('mam-cms-ready', () => {
      const mode = safeGet(KEY_COLOR, 'default');
      if (mode === 'default' && window.MamCms && typeof window.MamCms.reapplyFirestoreTheme === 'function') {
        window.MamCms.reapplyFirestoreTheme();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MamA11y = {
    applyColor,
    applyFont,
    safeGetColor: () => safeGet(KEY_COLOR, 'default'),
    safeGetFont: () => safeGet(KEY_FONT, '100'),
  };
})();
