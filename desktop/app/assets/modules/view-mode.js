/* ============================================================
   RestroSuite — shared List / Cards view mode
   Used by Customers, Employees, Suppliers, QR Orders, Online Orders…
   ============================================================ */
(function (global) {
  'use strict';

  const PREFIX = 'rs_view_mode_';

  function get(key, fallback) {
    const fb = fallback === 'cards' ? 'cards' : 'list';
    try {
      const v = localStorage.getItem(PREFIX + key);
      if (v === 'list' || v === 'cards') {return v;}
    } catch (e) {}
    return fb;
  }

  function set(key, mode) {
    const m = mode === 'cards' ? 'cards' : 'list';
    try {
      localStorage.setItem(PREFIX + key, m);
    } catch (e) {}
    return m;
  }

  /** Toggle control HTML — place in toolbars next to filters/sort. */
  function toggleHtml(key, current) {
    const mode = current === 'cards' ? 'cards' : 'list';
    return (
      '<div class="rs-view-toggle" role="group" aria-label="View mode" data-rs-view-key="' +
      String(key || '').replace(/"/g, '') +
      '">' +
      '<button type="button" class="rs-view-btn' +
      (mode === 'list' ? ' active' : '') +
      '" data-rs-view="list" title="Line / list view">' +
      '<i class="fa-solid fa-list"></i> List</button>' +
      '<button type="button" class="rs-view-btn' +
      (mode === 'cards' ? ' active' : '') +
      '" data-rs-view="cards" title="Card grid view">' +
      '<i class="fa-solid fa-grip"></i> Cards</button>' +
      '</div>'
    );
  }

  /**
   * Wire toggle buttons inside root. onChange(mode) is called when user switches.
   * Returns current mode.
   */
  function wire(root, key, onChange, fallback) {
    let mode = get(key, fallback);
    if (!root) {return mode;}
    const group = root.querySelector('[data-rs-view-key="' + key + '"]') || root.querySelector('.rs-view-toggle');
    if (!group) {return mode;}
    group.querySelectorAll('[data-rs-view]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-rs-view') === mode);
      btn.onclick = function () {
        const next = btn.getAttribute('data-rs-view') === 'cards' ? 'cards' : 'list';
        mode = set(key, next);
        group.querySelectorAll('[data-rs-view]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-rs-view') === mode);
        });
        if (typeof onChange === 'function') {onChange(mode);}
      };
    });
    return mode;
  }

  global.RSViewMode = {
    get: get,
    set: set,
    toggleHtml: toggleHtml,
    wire: wire,
  };
})(typeof window !== 'undefined' ? window : globalThis);
