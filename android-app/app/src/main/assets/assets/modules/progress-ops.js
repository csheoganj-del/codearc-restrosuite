/* ============================================================
   RestroSuite — Operation progress overlay (import / export / bulk)
   Shows real counts: "42 / 180 items" + percentage bar.
   ============================================================ */
(function (global) {
  'use strict';

  const STYLE_ID = 'rs-progress-ops-style';
  const ROOT_ID = 'rs-progress-ops-root';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {return;}
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + ROOT_ID + '{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(20,18,16,.45);backdrop-filter:blur(3px);padding:20px;}' +
      '#' + ROOT_ID + ' .rs-prog-card{width:min(420px,94vw);background:var(--panel,#fff);color:var(--text,#16151c);' +
      'border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.28);padding:22px 22px 18px;border:1px solid var(--stroke-2,rgba(0,0,0,.08));}' +
      '#' + ROOT_ID + ' .rs-prog-title{font-weight:800;font-size:15.5px;margin:0 0 4px;display:flex;align-items:center;gap:10px;}' +
      '#' + ROOT_ID + ' .rs-prog-title i{color:#FF4F00;}' +
      '#' + ROOT_ID + ' .rs-prog-sub{font-size:12.5px;color:var(--text-soft,#6b6570);margin:0 0 14px;line-height:1.45;}' +
      '#' + ROOT_ID + ' .rs-prog-track{height:10px;border-radius:99px;background:var(--stroke-2,rgba(0,0,0,.08));overflow:hidden;}' +
      '#' + ROOT_ID + ' .rs-prog-fill{height:100%;width:0%;background:linear-gradient(90deg,#FF4F00,#ff7a3d);border-radius:inherit;' +
      'transition:width .18s ease-out;}' +
      '#' + ROOT_ID + ' .rs-prog-meta{display:flex;justify-content:space-between;gap:12px;margin-top:10px;font-size:12.5px;font-weight:700;}' +
      '#' + ROOT_ID + ' .rs-prog-meta span{color:var(--text-mute,#8a8490);font-weight:600;}' +
      '#' + ROOT_ID + ' .rs-prog-indet .rs-prog-fill{width:38% !important;animation:rsProgSlide 1.1s ease-in-out infinite alternate;}' +
      '@keyframes rsProgSlide{from{transform:translateX(-20%)}to{transform:translateX(180%)}}' +
      '@media (prefers-reduced-motion:reduce){#' + ROOT_ID + ' .rs-prog-indet .rs-prog-fill{animation:none;width:50%!important}}';
    document.head.appendChild(s);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /**
   * open({ title, sub, total }) → { update({ done, total, label }), setIndeterminate(), close() }
   */
  function open(opts) {
    opts = opts || {};
    ensureStyle();
    const prev = document.getElementById(ROOT_ID);
    if (prev) {prev.remove();}

    let total = Math.max(0, Number(opts.total) || 0);
    let done = 0;
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', opts.title || 'Working');
    root.innerHTML =
      '<div class="rs-prog-card' + (total > 0 ? '' : ' rs-prog-indet') + '">' +
      '<div class="rs-prog-title"><i class="fa-solid fa-spinner fa-spin"></i><span data-t></span></div>' +
      '<p class="rs-prog-sub" data-s></p>' +
      '<div class="rs-prog-track"><div class="rs-prog-fill" data-f></div></div>' +
      '<div class="rs-prog-meta"><strong data-c></strong><span data-p></span></div>' +
      '</div>';
    document.body.appendChild(root);

    const elT = root.querySelector('[data-t]');
    const elS = root.querySelector('[data-s]');
    const elF = root.querySelector('[data-f]');
    const elC = root.querySelector('[data-c]');
    const elP = root.querySelector('[data-p]');
    const card = root.querySelector('.rs-prog-card');

    function paint() {
      elT.textContent = opts.title || 'Processing…';
      elS.textContent = opts.sub || opts.label || 'Please wait — do not close this window.';
      if (total > 0) {
        card.classList.remove('rs-prog-indet');
        const pct = clamp(Math.round((done / total) * 100), 0, 100);
        elF.style.width = pct + '%';
        elC.textContent = done + ' / ' + total + (opts.unit ? ' ' + opts.unit : ' items');
        elP.textContent = pct + '%';
      } else {
        card.classList.add('rs-prog-indet');
        elF.style.width = '';
        elC.textContent = opts.label || 'Working…';
        elP.textContent = '';
      }
    }
    paint();

    return {
      update: function (u) {
        u = u || {};
        if (u.title != null) {opts.title = u.title;}
        if (u.sub != null) {opts.sub = u.sub;}
        if (u.label != null) {opts.label = u.label;}
        if (u.unit != null) {opts.unit = u.unit;}
        if (u.total != null) {total = Math.max(0, Number(u.total) || 0);}
        if (u.done != null) {done = Math.max(0, Number(u.done) || 0);}
        else if (u.inc) {done = Math.min(total || Infinity, done + (Number(u.inc) || 1));}
        paint();
      },
      setIndeterminate: function (label) {
        total = 0;
        if (label) {opts.label = label;}
        paint();
      },
      close: function () {
        try {
          root.remove();
        } catch (_) {}
      },
    };
  }

  /** Run async work over an array with progress. */
  async function mapWithProgress(items, worker, opts) {
    opts = opts || {};
    const list = Array.isArray(items) ? items : [];
    const prog = open({
      title: opts.title || 'Processing…',
      sub: opts.sub || '',
      total: list.length,
      unit: opts.unit || 'items',
    });
    const results = [];
    try {
      for (let i = 0; i < list.length; i++) {
        results.push(await worker(list[i], i, list));
        prog.update({ done: i + 1 });
      }
      return results;
    } finally {
      if (opts.keepOpen) {return { results: results, progress: prog };}
      prog.close();
    }
  }

  global.RSProgress = { open: open, mapWithProgress: mapWithProgress };
})(typeof window !== 'undefined' ? window : globalThis);
