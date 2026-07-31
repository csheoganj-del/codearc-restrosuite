/* ============================================================
   RestroSuite — RSSkel: shared skeleton loading language
   Goal: never leave a blank/hung surface while data loads.
   Rules:
     • Use skeleton when no cached data yet (pre-hydrate) or long fetch
     • Prefer stale-while-revalidate when local data exists
     • Micro actions (<~300ms) use button busy, not full skeleton
     • Respect prefers-reduced-motion
   ============================================================ */
(function (global) {
  'use strict';

  let hydrated = false;

  function markHydrated() {
    hydrated = true;
    try {
      document.documentElement.dataset.rsHydrated = '1';
    } catch (_) {}
  }

  try {
    if (document.documentElement.dataset.rsHydrated === '1') {hydrated = true;}
  } catch (_) {}

  document.addEventListener('rs:hydrated', markHydrated);

  function isHydrated() {
    if (hydrated) {return true;}
    try {
      if (document.documentElement.dataset.rsHydrated === '1') {
        hydrated = true;
        return true;
      }
    } catch (_) {}
    return false;
  }

  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }

  function bar(wClass) {
    return '<span class="rs-skel-bar ' + (wClass || 'w60') + '"></span>';
  }

  /** Bills table body (tr rows) */
  function billsTable(opts) {
    opts = opts || {};
    const rows = Math.max(3, Math.min(12, Number(opts.rows) || 7));
    const cols = 9;
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<tr class="rs-skel-row" aria-hidden="true">';
      for (let c = 0; c < cols; c++) {
        const w =
          c === 0 ? 'w40' : c === 1 ? 'w50' : c === 2 ? 'w70' : c === 3 ? 'w55' : c === 8 ? 'w35' : 'w45';
        html += '<td><div class="rs-skel-cell">' + bar(w) + '</div></td>';
      }
      html += '</tr>';
    }
    return html;
  }

  /** KDS ticket cards */
  function kdsCards(opts) {
    opts = opts || {};
    const n = Math.max(2, Math.min(8, Number(opts.count) || 3));
    let html = '';
    for (let i = 0; i < n; i++) {
      html +=
        '<div class="kds-card rs-skel-card" aria-hidden="true">' +
        '<div class="kds-h"><div><div class="rs-skel-bar w40"></div>' +
        '<div class="rs-skel-bar w55 short" style="margin-top:8px"></div></div>' +
        '<div class="rs-skel-bar w25 short"></div></div>' +
        '<div class="kds-items" style="padding:10px 0;display:flex;flex-direction:column;gap:8px">' +
        '<div class="rs-skel-bar w80"></div>' +
        '<div class="rs-skel-bar w65"></div>' +
        '<div class="rs-skel-bar w50"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<div class="rs-skel-bar w45" style="height:32px;border-radius:8px"></div>' +
        '<div class="rs-skel-bar w45" style="height:32px;border-radius:8px"></div>' +
        '</div></div>';
    }
    return html;
  }

  /** Generic card grid (QR / floor / hub) */
  function cards(opts) {
    opts = opts || {};
    const n = Math.max(2, Math.min(12, Number(opts.count) || 4));
    let html = '<div class="rs-skel-card-grid">';
    for (let i = 0; i < n; i++) {
      html +=
        '<div class="rs-skel-card-block" aria-hidden="true">' +
        bar('w50') +
        bar('w80') +
        bar('w65') +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  /** QR order cards */
  function qrCards(opts) {
    opts = opts || {};
    const n = Math.max(2, Math.min(8, Number(opts.count) || 4));
    let html = '';
    for (let i = 0; i < n; i++) {
      html +=
        '<div class="qr-card rs-skel-card" aria-hidden="true" style="padding:14px;border:1px solid var(--stroke-2);border-radius:14px;background:var(--panel)">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:10px">' +
        bar('w40') +
        bar('w25') +
        '</div>' +
        bar('w70') +
        '<div style="margin-top:8px">' +
        bar('w55') +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<div class="rs-skel-bar w45" style="height:34px;border-radius:10px"></div>' +
        '<div class="rs-skel-bar w45" style="height:34px;border-radius:10px"></div>' +
        '</div></div>';
    }
    return html;
  }

  /** Floor / table tiles */
  function floorTiles(opts) {
    opts = opts || {};
    const n = Math.max(4, Math.min(16, Number(opts.count) || 8));
    let html = '<div class="rs-skel-floor-grid">';
    for (let i = 0; i < n; i++) {
      html +=
        '<div class="rs-skel-floor-tile" aria-hidden="true">' +
        bar('w40') +
        bar('w55 short') +
        bar('w35 short') +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  /** Inventory / menu table body */
  function dataTable(opts) {
    opts = opts || {};
    const rows = Math.max(3, Math.min(14, Number(opts.rows) || 8));
    const cols = Math.max(3, Math.min(10, Number(opts.cols) || 6));
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<tr class="rs-skel-row" aria-hidden="true">';
      for (let c = 0; c < cols; c++) {
        const w = c === 0 ? 'w55' : c === cols - 1 ? 'w30' : 'w45';
        html += '<td><div class="rs-skel-cell">' + bar(w) + '</div></td>';
      }
      html += '</tr>';
    }
    return html;
  }

  /** Reports dashboard shell */
  function reportsDash(opts) {
    opts = opts || {};
    const stats = Math.max(3, Math.min(6, Number(opts.stats) || 4));
    let html = '<div class="rs-skel-reports">';
    html += '<div class="rs-skel-stat-row">';
    for (let i = 0; i < stats; i++) {
      html +=
        '<div class="rs-skel-stat-card" aria-hidden="true">' +
        bar('w40') +
        '<div class="rs-skel-bar w55" style="height:22px;margin-top:10px;border-radius:8px"></div>' +
        '</div>';
    }
    html += '</div>';
    html +=
      '<div class="rs-skel-report-panels">' +
      '<div class="rs-skel-panel" aria-hidden="true">' +
      bar('w40') +
      '<div class="rs-skel-bar w100" style="height:120px;margin-top:14px;border-radius:10px;width:100%"></div>' +
      '</div>' +
      '<div class="rs-skel-panel" aria-hidden="true">' +
      bar('w40') +
      '<div class="rs-skel-bar w100" style="height:120px;margin-top:14px;border-radius:10px;width:100%"></div>' +
      '</div></div></div>';
    return html;
  }

  function paint(el, html) {
    if (!el) {return false;}
    el.innerHTML = html;
    el.classList.add('rs-skel-host');
    el.setAttribute('aria-busy', 'true');
    return true;
  }

  function clear(el) {
    if (!el) {return;}
    el.classList.remove('rs-skel-host');
    el.removeAttribute('aria-busy');
  }

  /** Paint real HTML and drop skeleton host flags (always call after loading). */
  function paintReady(el, html) {
    if (!el) {return false;}
    clear(el);
    el.innerHTML = html;
    return true;
  }

  /**
   * Should we show skeleton instead of empty?
   * true when app has not finished first hydrate AND no local rows yet.
   */
  function shouldShow(hasLocalData) {
    if (hasLocalData) {return false;}
    return !isHydrated();
  }

  global.RSSkel = {
    isHydrated: isHydrated,
    shouldShow: shouldShow,
    reducedMotion: reducedMotion,
    billsTable: billsTable,
    kdsCards: kdsCards,
    qrCards: qrCards,
    floorTiles: floorTiles,
    dataTable: dataTable,
    reportsDash: reportsDash,
    cards: cards,
    bar: bar,
    paint: paint,
    clear: clear,
    paintReady: paintReady,
    markHydrated: markHydrated,
  };
})(typeof window !== 'undefined' ? window : globalThis);
