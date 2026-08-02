/**
 * RestroSuite — billing nudge (on-screen)
 * --------------------------------------------------------------------------
 * Shows once per calendar day when the workspace is in the last 3 days of
 * trial/paid period. Blocking paywall when expired (no grace).
 * Loaded on dashboard after session + license.
 */
(function (root) {
  'use strict';

  var STYLE_ID = 'rs-billing-nudge-style';
  var MODAL_ID = 'rs-billing-nudge-modal';
  var DAY_KEY = 'rs_billing_nudge_day';

  function sess() {
    try {
      return (root.RS_API && RS_API.session && RS_API.session()) || {};
    } catch (_) {
      return {};
    }
  }

  function planLabel(code) {
    var c = String(code || '').toLowerCase();
    if (c === 'express' || c === 'starter') return 'Express';
    if (c === 'serve' || c === 'growth') return 'Serve';
    if (c === 'command' || c === 'enterprise') return 'Command';
    return code || 'plan';
  }

  function daysLeft(iso) {
    if (!iso) return null;
    var end = new Date(iso).getTime();
    if (!Number.isFinite(end)) return null;
    return Math.ceil((end - Date.now()) / 86400000);
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (_) {
      return iso || '';
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + MODAL_ID + '{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(15,12,10,.55);padding:18px;backdrop-filter:blur(4px)}' +
      '#' + MODAL_ID + ' .rs-bn-card{width:min(440px,100%);background:var(--panel,#fff);color:var(--text,#1a1714);' +
      'border-radius:16px;padding:22px 22px 18px;box-shadow:0 20px 50px rgba(0,0,0,.28);border:1px solid rgba(0,0,0,.08)}' +
      '#' + MODAL_ID + ' .rs-bn-title{font-family:var(--font-display,Georgia,serif);font-weight:800;font-size:22px;margin:0 0 8px}' +
      '#' + MODAL_ID + ' .rs-bn-body{font-size:14px;line-height:1.55;color:var(--text-soft,#5c534c);margin:0 0 16px}' +
      '#' + MODAL_ID + ' .rs-bn-actions{display:flex;flex-wrap:wrap;gap:10px}' +
      '#' + MODAL_ID + ' .rs-bn-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;' +
      'padding:5px 10px;border-radius:999px;background:rgba(255,79,0,.1);color:#c2410c;margin-bottom:12px}' +
      '#' + MODAL_ID + ' .rs-bn-chip.danger{background:rgba(239,68,68,.12);color:#b91c1c}' +
      '#' + MODAL_ID + '[data-blocking="1"]{cursor:not-allowed}' +
      '#' + MODAL_ID + '[data-blocking="1"] .rs-bn-card{cursor:default}';
    document.head.appendChild(s);
  }

  function goToPlans() {
    try {
      location.hash = '#settings';
      setTimeout(function () {
        var tab = document.querySelector('[data-settings-panel="plan"], #rs-plan-container, [data-panel="plan"]');
        if (tab && tab.click) tab.click();
        var btn = document.querySelector('[data-set-nav="plan"], button[data-panel="plan"]');
        if (btn) btn.click();
        document.dispatchEvent(new CustomEvent('rs:open-plan-panel'));
      }, 200);
    } catch (_) {}
  }

  function closeModal(force) {
    var el = document.getElementById(MODAL_ID);
    if (!el) return;
    if (el.getAttribute('data-blocking') === '1' && !force) return;
    try { el.remove(); } catch (_) {}
  }

  function showModal(opts) {
    opts = opts || {};
    injectStyles();
    closeModal(true);
    var blocking = !!opts.blocking;
    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('data-blocking', blocking ? '1' : '0');
    var chipClass = blocking ? 'rs-bn-chip danger' : 'rs-bn-chip';
    wrap.innerHTML =
      '<div class="rs-bn-card">' +
      '<div class="' + chipClass + '"><i class="fa-solid fa-' + (blocking ? 'lock' : 'bell') + '"></i> ' +
      (blocking ? 'Plan expired' : opts.days + ' day' + (opts.days === 1 ? '' : 's') + ' left') +
      '</div>' +
      '<h2 class="rs-bn-title">' + (blocking ? 'Renew to reopen POS' : 'Payment reminder') + '</h2>' +
      '<p class="rs-bn-body">' + (opts.body || '') + '</p>' +
      '<div class="rs-bn-actions">' +
      '<button type="button" class="btn btn-primary" id="rs-bn-renew"><i class="fa-solid fa-credit-card"></i> ' +
      (blocking ? 'Renew plan now' : 'View plans & pay') + '</button>' +
      (blocking
        ? ''
        : '<button type="button" class="btn btn-ghost" id="rs-bn-later">Remind me later today</button>') +
      '</div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#rs-bn-renew').onclick = function () {
      if (!blocking) {
        try {
          localStorage.setItem(DAY_KEY, new Date().toISOString().slice(0, 10));
        } catch (_) {}
      }
      closeModal(true);
      goToPlans();
    };
    var later = wrap.querySelector('#rs-bn-later');
    if (later) {
      later.onclick = function () {
        try {
          localStorage.setItem(DAY_KEY, new Date().toISOString().slice(0, 10));
        } catch (_) {}
        closeModal(true);
      };
    }
    if (!blocking) {
      wrap.addEventListener('click', function (e) {
        if (e.target === wrap) {
          try {
            localStorage.setItem(DAY_KEY, new Date().toISOString().slice(0, 10));
          } catch (_) {}
          closeModal(true);
        }
      });
    }
  }

  function alreadyNudgedToday() {
    try {
      return localStorage.getItem(DAY_KEY) === new Date().toISOString().slice(0, 10);
    } catch (_) {
      return false;
    }
  }

  async function refreshFromServer() {
    try {
      if (!root.RS_API || typeof RS_API.getPlans !== 'function') return null;
      var data = await RS_API.getPlans();
      return data && data.current ? data.current : null;
    } catch (_) {
      return null;
    }
  }

  async function run() {
    var s = sess();
    if (!s || !s.session_token) return;
    if (s.role === 'superadmin') return;

    var current = {
      plan_code: s.plan_code || 'serve',
      subscription_status: s.subscription_status || 'active',
      subscription_current_period_end: s.subscription_current_period_end || null,
    };

    var remote = await refreshFromServer();
    if (remote) {
      current.plan_code = remote.plan_code || current.plan_code;
      current.subscription_status = remote.subscription_status || current.subscription_status;
      current.subscription_current_period_end =
        remote.subscription_current_period_end || current.subscription_current_period_end;
      try {
        sessionStorage.setItem('rs_plan_code', current.plan_code || '');
        sessionStorage.setItem('rs_subscription_status', current.subscription_status || '');
        sessionStorage.setItem(
          'rs_subscription_period_end',
          current.subscription_current_period_end || ''
        );
      } catch (_) {}
    }

    var status = String(current.subscription_status || '').toLowerCase();
    var end = current.subscription_current_period_end;
    var dLeft = daysLeft(end);
    var expired =
      status === 'expired' ||
      status === 'canceled' ||
      status === 'cancelled' ||
      (dLeft !== null && dLeft <= 0);

    if (expired) {
      showModal({
        blocking: true,
        days: 0,
        body:
          'Your <strong>' +
          planLabel(current.plan_code) +
          '</strong> period ended' +
          (end ? ' on <strong>' + fmtDate(end) + '</strong>' : '') +
          '. There is <strong>no grace period</strong>. Renew Express, Serve, or Command — your new period starts from the expiry date (not the payment day). Data is safe.',
      });
      return;
    }

    if (dLeft === null || dLeft > 3) return;
    if (alreadyNudgedToday()) return;

    var isTrial = status === 'trialing';
    showModal({
      blocking: false,
      days: dLeft,
      body:
        (isTrial ? 'Your <strong>free Serve trial</strong>' : 'Your <strong>' + planLabel(current.plan_code) + '</strong> plan') +
        ' ends in <strong>' +
        dLeft +
        ' day' +
        (dLeft === 1 ? '' : 's') +
        '</strong> (' +
        fmtDate(end) +
        '). We also send WhatsApp & email reminders. Renew early — time left is kept and the new period adds from the expiry day. Auto-renew via Razorpay when you subscribe.',
    });
  }

  function boot() {
    setTimeout(function () {
      run().catch(function (e) {
        console.warn('[billing-nudge]', e);
      });
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('rs:ready', function () {
    setTimeout(function () {
      run().catch(function () {});
    }, 400);
  });
  document.addEventListener('rs:hydrated', function () {
    setTimeout(function () {
      run().catch(function () {});
    }, 400);
  });

  root.RSBillingNudge = { run: run, showModal: showModal };
})(typeof window !== 'undefined' ? window : globalThis);
