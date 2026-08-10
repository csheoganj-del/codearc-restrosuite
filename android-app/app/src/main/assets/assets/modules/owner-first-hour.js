/**
 * Owner first-hour / daily open checklist — plain language only.
 * No engineer tips, no URLs, no stack traces.
 */
(function (global) {
  'use strict';

  const KEY = 'rs_owner_first_hour_v1';
  const DAILY_KEY = 'rs_owner_daily_open_';

  function toast(msg, icon) {
    try {
      if (global.RS && typeof RS.toast === 'function') {return RS.toast(msg, icon || 'fa-circle-check');}
    } catch (_) {}
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveState(st) {
    try {
      localStorage.setItem(KEY, JSON.stringify(st || {}));
    } catch (_) {}
  }

  function isDesktop() {
    return !!(global.RS_DESKTOP || global.rsDesktop || global.RS_NATIVE_APP);
  }

  function checkLogin() {
    try {
      const s = global.RS_API && RS_API.session && RS_API.session();
      if (s && (s.tenant_id || s.tenantId || s.slug)) {return { ok: true, detail: 'Signed in' };}
      const tid = sessionStorage.getItem('tenant_id') || sessionStorage.getItem('tenant_slug');
      if (tid) {return { ok: true, detail: 'Signed in' };}
    } catch (_) {}
    return { ok: false, detail: 'Sign in to continue' };
  }

  async function checkPrinter() {
    // Web: system dialog is fine. Desktop: prefer chip selected.
    if (!isDesktop()) {return { ok: true, detail: 'Browser print when needed' };}
    try {
      const desk = global.RS_DESKTOP || global.rsDesktop;
      if (desk && typeof desk.getPreferredPrinter === 'function') {
        const pref = await desk.getPreferredPrinter();
        if (pref && pref.name) {
          return { ok: true, detail: 'Printer: ' + pref.name };
        }
      }
      return { ok: false, detail: 'Choose printer (top bar chip)' };
    } catch (_) {
      return { ok: false, detail: 'Choose printer (top bar chip)' };
    }
  }

  function checkWhatsApp() {
    try {
      const btn = document.getElementById('tb-wa-status-btn');
      if (btn && btn.classList.contains('wa-linked')) {
        return { ok: true, detail: 'WhatsApp linked · OK' };
      }
      if (btn && btn.classList.contains('wa-starting')) {
        return { ok: false, detail: 'WhatsApp connecting…' };
      }
      // Settings gateway container if open
      const pill = document.querySelector('#outlet-gateway-status-container .pill-green, .set-gateway-status .pill-green');
      if (pill) {return { ok: true, detail: 'WhatsApp linked · OK' };}
    } catch (_) {}
    return { ok: false, detail: 'WhatsApp not linked (optional for today)' };
  }

  function checkOnline() {
    const on = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    return on
      ? { ok: true, detail: 'Internet connected' }
      : { ok: false, detail: 'Offline — local billing still works' };
  }

  async function buildChecks() {
    const login = checkLogin();
    const printer = await checkPrinter();
    const wa = checkWhatsApp();
    const net = checkOnline();
    return [
      { id: 'login', title: 'Staff signed in', ...login },
      { id: 'printer', title: 'Receipt printer ready', ...printer, required: isDesktop() },
      { id: 'wa', title: 'WhatsApp for bills', ...wa, required: false },
      { id: 'net', title: 'Internet', ...net, required: false },
      {
        id: 'pos',
        title: 'Ready to take orders',
        ok: !!document.getElementById('pos-tab') || !!document.getElementById('pos-grid'),
        detail: 'Point of Sale is available',
        required: true,
      },
    ];
  }

  function checklistHtml(checks) {
    const rows = checks
      .map(function (c) {
        const icon = c.ok ? 'fa-circle-check' : c.required === false ? 'fa-circle-minus' : 'fa-circle-xmark';
        const color = c.ok ? '#16a34a' : c.required === false ? '#ca8a04' : '#dc2626';
        return (
          '<div class="rs-fh-row" data-id="' +
          c.id +
          '">' +
          '<i class="fa-solid ' +
          icon +
          '" style="color:' +
          color +
          '"></i>' +
          '<div><div class="rs-fh-title">' +
          c.title +
          '</div>' +
          '<div class="rs-fh-detail">' +
          (c.detail || '') +
          '</div></div></div>'
        );
      })
      .join('');
    const allReqOk = checks.every(function (c) {
      return c.ok || c.required === false;
    });
    return (
      '<div class="rs-first-hour">' +
      '<p class="rs-fh-lead">Quick open check — takes under a minute. Nothing technical.</p>' +
      '<div class="rs-fh-list">' +
      rows +
      '</div>' +
      (allReqOk
        ? '<p class="rs-fh-ok"><i class="fa-solid fa-store"></i> You\'re ready to sell.</p>'
        : '<p class="rs-fh-warn">Fix the red items, then open the checklist again.</p>') +
      '</div>'
    );
  }

  async function openChecklist(opts) {
    const checks = await buildChecks();
    const body = checklistHtml(checks);
    const allReqOk = checks.every(function (c) {
      return c.ok || c.required === false;
    });

    if (global.RSModal && typeof RSModal.open === 'function') {
      RSModal.open({
        title: 'Open for business',
        icon: 'fa-clipboard-check',
        size: 'sm',
        body: body,
        foot:
          '<button type="button" class="btn btn-ghost" data-fh-later>Later</button>' +
          (allReqOk
            ? '<button type="button" class="btn btn-primary" data-fh-go>Start selling</button>'
            : '<button type="button" class="btn btn-primary" data-fh-refresh>Check again</button>'),
        onMount: function (modal, close) {
          const later = modal.querySelector('[data-fh-later]');
          if (later) {later.onclick = close;}
          const go = modal.querySelector('[data-fh-go]');
          if (go) {
            go.onclick = function () {
              const st = loadState();
              st.completedDays = st.completedDays || {};
              st.completedDays[todayKey()] = Date.now();
              st.firstHourDone = true;
              saveState(st);
              try {
                localStorage.setItem(DAILY_KEY, todayKey());
              } catch (_) {}
              toast('Have a great service', 'fa-mug-hot');
              close();
              try {
                if (global.RS && typeof RS.activateTab === 'function') {RS.activateTab('pos-tab');}
              } catch (_) {}
            };
          }
          const refresh = modal.querySelector('[data-fh-refresh]');
          if (refresh) {
            refresh.onclick = function () {
              close();
              setTimeout(function () {
                openChecklist({ force: true });
              }, 200);
            };
          }
        },
      });
      return;
    }
    // Minimal fallback
    toast(allReqOk ? 'Ready to sell' : 'Complete open checklist in Help', 'fa-clipboard-check');
  }

  function shouldAutoPrompt() {
    try {
      const st = loadState();
      if (st.firstHourDone && localStorage.getItem(DAILY_KEY) === todayKey()) {return false;}
      // Once per calendar day after first login on this device
      if (localStorage.getItem(DAILY_KEY) === todayKey()) {return false;}
    } catch (_) {}
    return true;
  }

  function injectHelpEntry() {
    // Prefer sidebar Help area: add a quiet secondary entry near Help if missing
    try {
      if (document.getElementById('open-owner-first-hour')) {return;}
      const help = document.getElementById('open-product-guide-btn');
      if (!help || !help.parentNode) {return;}
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'open-owner-first-hour';
      btn.className = 'sb-foot-btn';
      btn.title = 'Open for business checklist';
      btn.innerHTML = '<i class="fa-solid fa-clipboard-check"></i><span>Open checklist</span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openChecklist({ force: true });
      });
      help.parentNode.insertBefore(btn, help.nextSibling);
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById('rs-first-hour-css')) {return;}
    const s = document.createElement('style');
    s.id = 'rs-first-hour-css';
    s.textContent =
      '.rs-first-hour{padding:4px 0 2px}' +
      '.rs-fh-lead{margin:0 0 12px;font-size:13px;color:var(--text-soft);line-height:1.45;font-weight:600}' +
      '.rs-fh-list{display:flex;flex-direction:column;gap:10px}' +
      '.rs-fh-row{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid var(--stroke-2);background:var(--panel)}' +
      '.rs-fh-row i{margin-top:2px;font-size:16px}' +
      '.rs-fh-title{font-weight:800;font-size:13.5px;color:var(--text)}' +
      '.rs-fh-detail{font-size:12px;color:var(--text-soft);margin-top:2px;font-weight:600}' +
      '.rs-fh-ok{margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#ecfdf5;color:#065f46;font-weight:700;font-size:13px}' +
      '.rs-fh-warn{margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#fff7ed;color:#9a3412;font-weight:700;font-size:13px}';
    document.head.appendChild(s);
  }

  function boot() {
    injectStyles();
    injectHelpEntry();
    // Auto once per day after shell ready — never spam
    if (!shouldAutoPrompt()) {return;}
    setTimeout(function () {
      if (!shouldAutoPrompt()) {return;}
      // Don't fight other first-run modals
      try {
        if (document.querySelector('.rs-overlay.show, #onboarding-overlay.is-visible')) {return;}
      } catch (_) {}
      openChecklist({});
      try {
        localStorage.setItem(DAILY_KEY, todayKey());
      } catch (_) {}
    }, 4500);
  }

  document.addEventListener('rs:ready', function () {
    setTimeout(boot, 800);
  });
  document.addEventListener('rs:hydrated', function () {
    setTimeout(injectHelpEntry, 400);
  });
  if (document.readyState !== 'loading') {setTimeout(boot, 1200);}
  else {document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1200); });}

  global.RSOwnerFirstHour = {
    open: openChecklist,
    buildChecks: buildChecks,
  };
})(typeof window !== 'undefined' ? window : globalThis);
