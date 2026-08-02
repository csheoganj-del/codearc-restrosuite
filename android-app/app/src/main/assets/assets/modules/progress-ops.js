/* ============================================================
   RestroSuite — Operation progress overlay (import / export / bulk)
   Live counts: done / remaining / failed + percentage bar + current row.
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
      'background:rgba(20,18,16,.48);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:20px;}' +
      '#' + ROOT_ID + ' .rs-prog-card{width:min(440px,94vw);background:var(--panel-solid,var(--panel,#fff));color:var(--text,#16151c);' +
      'border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.32);padding:22px 22px 16px;border:1px solid var(--stroke-2,rgba(0,0,0,.08));}' +
      '#' + ROOT_ID + ' .rs-prog-title{font-weight:800;font-size:15.5px;margin:0 0 4px;display:flex;align-items:center;gap:10px;}' +
      '#' + ROOT_ID + ' .rs-prog-title i{color:#FF4F00;}' +
      '#' + ROOT_ID + ' .rs-prog-title.is-ok i{color:#0F9F6E;}' +
      '#' + ROOT_ID + ' .rs-prog-title.is-err i{color:#c0392b;}' +
      '#' + ROOT_ID + ' .rs-prog-sub{font-size:12.5px;color:var(--text-soft,#6b6570);margin:0 0 12px;line-height:1.45;min-height:1.35em;}' +
      '#' + ROOT_ID + ' .rs-prog-track{height:11px;border-radius:99px;background:var(--stroke-2,rgba(0,0,0,.08));overflow:hidden;}' +
      '#' + ROOT_ID + ' .rs-prog-fill{height:100%;width:0%;background:linear-gradient(90deg,#FF4F00,#ff7a3d);border-radius:inherit;' +
      'transition:width .15s ease-out;}' +
      '#' + ROOT_ID + ' .rs-prog-title.is-ok ~ .rs-prog-track .rs-prog-fill{background:linear-gradient(90deg,#0F9F6E,#34d399);}' +
      '#' + ROOT_ID + ' .rs-prog-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;}' +
      '#' + ROOT_ID + ' .rs-prog-stat{text-align:center;padding:8px 6px;border-radius:12px;background:var(--glass,rgba(0,0,0,.03));border:1px solid var(--stroke-2,rgba(0,0,0,.06));}' +
      '#' + ROOT_ID + ' .rs-prog-stat b{display:block;font-size:16px;font-weight:800;letter-spacing:-.02em;color:var(--text);line-height:1.15;}' +
      '#' + ROOT_ID + ' .rs-prog-stat span{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mute,#8a8490);}' +
      '#' + ROOT_ID + ' .rs-prog-stat.is-rem b{color:#FF4F00;}' +
      '#' + ROOT_ID + ' .rs-prog-stat.is-fail b{color:#c0392b;}' +
      '#' + ROOT_ID + ' .rs-prog-stat.is-done b{color:#0F9F6E;}' +
      '#' + ROOT_ID + ' .rs-prog-meta{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;font-size:12.5px;font-weight:700;}' +
      '#' + ROOT_ID + ' .rs-prog-meta span{color:var(--text-mute,#8a8490);font-weight:600;}' +
      '#' + ROOT_ID + ' .rs-prog-current{margin-top:10px;font-size:12px;color:var(--text-soft);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:1.3em;}' +
      '#' + ROOT_ID + ' .rs-prog-current b{color:var(--text);font-weight:700;}' +
      '#' + ROOT_ID + ' .rs-prog-indet .rs-prog-fill{width:38% !important;animation:rsProgSlide 1.1s ease-in-out infinite alternate;}' +
      '#' + ROOT_ID + ' .rs-prog-foot{margin-top:12px;font-size:11.5px;color:var(--text-mute);text-align:center;}' +
      '@keyframes rsProgSlide{from{transform:translateX(-20%)}to{transform:translateX(180%)}}' +
      '@media (prefers-reduced-motion:reduce){#' + ROOT_ID + ' .rs-prog-indet .rs-prog-fill{animation:none;width:50%!important}}';
    document.head.appendChild(s);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /**
   * open({ title, sub, total, unit }) →
   *   { update({ done, total, failed, label, current, sub, title }), setIndeterminate(), succeed(), fail(), close() }
   */
  function open(opts) {
    opts = opts || {};
    ensureStyle();
    const prev = document.getElementById(ROOT_ID);
    if (prev) {prev.remove();}

    let total = Math.max(0, Number(opts.total) || 0);
    let done = 0;
    let failed = 0;
    let current = '';
    let state = 'running'; // running | ok | err
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', opts.title || 'Working');
    root.innerHTML =
      '<div class="rs-prog-card' + (total > 0 ? '' : ' rs-prog-indet') + '">' +
      '<div class="rs-prog-title" data-title-row><i class="fa-solid fa-spinner fa-spin" data-ic></i><span data-t></span></div>' +
      '<p class="rs-prog-sub" data-s></p>' +
      '<div class="rs-prog-track"><div class="rs-prog-fill" data-f></div></div>' +
      '<div class="rs-prog-stats">' +
      '<div class="rs-prog-stat is-done"><b data-done>0</b><span>Done</span></div>' +
      '<div class="rs-prog-stat is-rem"><b data-rem>—</b><span>Remaining</span></div>' +
      '<div class="rs-prog-stat is-fail"><b data-fail>0</b><span>Failed</span></div>' +
      '</div>' +
      '<div class="rs-prog-meta"><strong data-c></strong><span data-p></span></div>' +
      '<div class="rs-prog-current" data-cur></div>' +
      '<div class="rs-prog-foot" data-foot>Live progress — do not close this window</div>' +
      '</div>';
    document.body.appendChild(root);

    const elTitleRow = root.querySelector('[data-title-row]');
    const elIc = root.querySelector('[data-ic]');
    const elT = root.querySelector('[data-t]');
    const elS = root.querySelector('[data-s]');
    const elF = root.querySelector('[data-f]');
    const elC = root.querySelector('[data-c]');
    const elP = root.querySelector('[data-p]');
    const elDone = root.querySelector('[data-done]');
    const elRem = root.querySelector('[data-rem]');
    const elFail = root.querySelector('[data-fail]');
    const elCur = root.querySelector('[data-cur]');
    const elFoot = root.querySelector('[data-foot]');
    const card = root.querySelector('.rs-prog-card');

    function paint() {
      elT.textContent = opts.title || 'Processing…';
      elS.textContent = opts.sub || opts.label || 'Please wait — do not close this window.';
      elDone.textContent = String(done);
      elFail.textContent = String(failed);
      if (total > 0) {
        card.classList.remove('rs-prog-indet');
        const rem = Math.max(0, total - done);
        elRem.textContent = String(rem);
        const pct = clamp(Math.round((done / total) * 100), 0, 100);
        elF.style.width = pct + '%';
        elC.textContent =
          done +
          ' of ' +
          total +
          (opts.unit ? ' ' + opts.unit : ' items') +
          (rem ? ' · ' + rem + ' left' : ' · finished');
        elP.textContent = pct + '%';
      } else {
        card.classList.add('rs-prog-indet');
        elF.style.width = '';
        elRem.textContent = '…';
        elC.textContent = opts.label || 'Working…';
        elP.textContent = '';
      }
      if (current) {
        elCur.innerHTML = 'Now: <b>' + String(current).replace(/</g, '&lt;') + '</b>';
      } else {
        elCur.textContent = '';
      }
      if (state === 'ok') {
        elTitleRow.classList.add('is-ok');
        elTitleRow.classList.remove('is-err');
        elIc.className = 'fa-solid fa-circle-check';
        elFoot.textContent = 'Complete';
      } else if (state === 'err') {
        elTitleRow.classList.add('is-err');
        elTitleRow.classList.remove('is-ok');
        elIc.className = 'fa-solid fa-circle-exclamation';
        elFoot.textContent = 'Finished with errors';
      } else {
        elTitleRow.classList.remove('is-ok', 'is-err');
        elIc.className = 'fa-solid fa-spinner fa-spin';
        elFoot.textContent = 'Live progress — do not close this window';
      }
    }
    paint();

    const api = {
      update: function (u) {
        u = u || {};
        if (u.title != null) {opts.title = u.title;}
        if (u.sub != null) {opts.sub = u.sub;}
        if (u.label != null) {opts.label = u.label;}
        if (u.unit != null) {opts.unit = u.unit;}
        if (u.total != null) {total = Math.max(0, Number(u.total) || 0);}
        if (u.done != null) {done = Math.max(0, Number(u.done) || 0);}
        else if (u.inc) {done = Math.min(total || Infinity, done + (Number(u.inc) || 1));}
        if (u.failed != null) {failed = Math.max(0, Number(u.failed) || 0);}
        else if (u.failInc) {failed += Number(u.failInc) || 1;}
        if (u.current != null) {current = String(u.current || '');}
        paint();
      },
      setIndeterminate: function (label) {
        total = 0;
        if (label) {opts.label = label; opts.sub = label;}
        paint();
      },
      succeed: function (msg) {
        state = 'ok';
        if (msg) {opts.sub = msg;}
        if (total > 0) {done = total;}
        paint();
      },
      fail: function (msg) {
        state = 'err';
        if (msg) {opts.sub = msg;}
        paint();
      },
      close: function (delayMs) {
        const ms = delayMs == null ? 0 : Number(delayMs) || 0;
        if (ms > 0) {
          setTimeout(function () {
            try {
              root.remove();
            } catch (_) {}
          }, ms);
        } else {
          try {
            root.remove();
          } catch (_) {}
        }
      },
    };
    return api;
  }

  /** Run async work over an array with live progress. */
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
    let failed = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const label =
          (opts.itemLabel && opts.itemLabel(item, i)) ||
          item.name ||
          item.no ||
          item.id ||
          'Row ' + (i + 1);
        prog.update({
          done: i,
          failed: failed,
          current: label,
          sub: 'Saving ' + (i + 1) + ' of ' + list.length + ' · ' + (list.length - i) + ' remaining',
        });
        try {
          results.push(await worker(item, i, list, prog));
        } catch (e) {
          failed++;
          results.push({ error: e });
          if (opts.stopOnError) {throw e;}
        }
        prog.update({
          done: i + 1,
          failed: failed,
          current: label,
          sub:
            i + 1 < list.length
              ? 'Saved ' +
                (i + 1) +
                ' · ' +
                (list.length - i - 1) +
                ' remaining' +
                (failed ? ' · ' + failed + ' failed' : '')
              : failed
                ? 'Finished · ' + failed + ' failed'
                : 'All items saved',
        });
        // Yield so the browser paints between rows
        if (i % 2 === 1) {
          await new Promise(function (r) {
            setTimeout(r, 0);
          });
        }
      }
      if (failed) {
        prog.fail(
          (opts.failMsg || 'Completed with errors') +
            ' · ' +
            (list.length - failed) +
            ' ok · ' +
            failed +
            ' failed'
        );
      } else {
        prog.succeed(opts.successMsg || 'All ' + list.length + ' ' + (opts.unit || 'items') + ' done');
      }
      if (opts.keepOpen) {return { results: results, progress: prog, failed: failed };}
      prog.close(opts.closeDelay != null ? opts.closeDelay : failed ? 2200 : 900);
      return results;
    } catch (e) {
      prog.fail((e && e.message) || 'Failed');
      if (!opts.keepOpen) {prog.close(opts.closeDelay != null ? opts.closeDelay : 2800);}
      throw e;
    }
  }

  global.RSProgress = { open: open, mapWithProgress: mapWithProgress };
})(typeof window !== 'undefined' ? window : globalThis);
