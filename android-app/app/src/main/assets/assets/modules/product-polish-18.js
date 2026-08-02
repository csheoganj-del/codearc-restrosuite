/**
 * RestroSuite product polish pack — 18 improvements in one module.
 * Loads after dashboard shell; enhances existing UI without replacing core POS.
 */
(function (global) {
  'use strict';

  const AUDIT_KEY = 'rs_owner_audit_v1';
  const COACH_KEY = 'rs_offline_coach_done_v1';
  const DENSITY_KEY = 'rs-ui-density';

  function toast(msg, icon) {
    try {
      if (global.__toast) {return global.__toast(msg, icon);}
      if (global.RS && RS.toast) {return RS.toast(msg, icon);}
    } catch (_) {}
  }

  function role() {
    try {
      const s = global.RS_API && RS_API.session && RS_API.session();
      return String((s && s.role) || sessionStorage.getItem('logged_in_role') || '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function isOwnerLike() {
    const r = role();
    return !r || r === 'owner' || r === 'admin' || r === 'manager' || r === 'superadmin';
  }

  function allowedTabs() {
    try {
      if (global.RS_ROLE && global.RS_ROLE.allowedTabs == null && isOwnerLike()) {return null;}
      if (global.RS_ROLE && Array.isArray(global.RS_ROLE.allowedTabs)) {return global.RS_ROLE.allowedTabs;}
      return JSON.parse(sessionStorage.getItem('allowed_tabs') || '[]');
    } catch (_) {
      return [];
    }
  }

  function hasTab(id) {
    const tabs = allowedTabs();
    if (tabs == null) {return true;}
    return Array.isArray(tabs) && tabs.indexOf(id) !== -1;
  }

  /* ---------- #13 Owner audit log (local + optional cloud activity) ---------- */
  function auditLog(action, detail) {
    try {
      const s = global.RS_API && RS_API.session && RS_API.session();
      const row = {
        t: Date.now(),
        action: String(action || ''),
        detail: String(detail || ''),
        by: (s && (s.username || s.display_name)) || sessionStorage.getItem('logged_in_user') || 'system',
        role: role() || '—',
      };
      let list = [];
      try { list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch (_) {}
      if (!Array.isArray(list)) {list = [];}
      list.unshift(row);
      localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 200)));
      try {
        document.dispatchEvent(new CustomEvent('rs:owner-audit', { detail: row }));
      } catch (_) {}
    } catch (_) {}
  }
  global.RS_ownerAudit = auditLog;

  function readAudit(days) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch (_) {}
    if (!Array.isArray(list)) {return [];}
    const cut = Date.now() - (Number(days) || 7) * 864e5;
    return list.filter(function (r) { return r && r.t >= cut; });
  }

  /* ---------- #2 Sync status pill + #15 version clarity ---------- */
  function ensureSyncPill() {
    const right = document.getElementById('tb-right');
    if (!right || document.getElementById('rs-sync-status-pill')) {return;}
    const pill = document.createElement('span');
    pill.id = 'rs-sync-status-pill';
    pill.setAttribute('role', 'status');
    pill.innerHTML = '<i class="fa-solid fa-cloud"></i><span class="rs-sync-txt">Online</span>';
    const ver = document.getElementById('app-version-pill');
    if (ver && ver.parentNode) {ver.parentNode.insertBefore(pill, ver);}
    else {right.appendChild(pill);}
  }

  function syncDepth() {
    try {
      if (typeof global.RS_DB_SYNC_DEPTH === 'function') {return Number(global.RS_DB_SYNC_DEPTH()) || 0;}
      if (global.RS_DB && typeof RS_DB.syncQueueDepth === 'function') {return Number(RS_DB.syncQueueDepth()) || 0;}
    } catch (_) {}
    return Number(global.__rsSyncQueueDepth || 0) || 0;
  }

  function needsAuthSync() {
    try {
      const q = JSON.parse(localStorage.getItem('rs:sync_queue_v1') || localStorage.getItem('rs_sync_queue') || '[]');
      if (!Array.isArray(q)) {return false;}
      return q.some(function (e) { return e && e.needsAuth; });
    } catch (_) {
      return false;
    }
  }

  function paintSyncPill() {
    ensureSyncPill();
    const pill = document.getElementById('rs-sync-status-pill');
    if (!pill) {return;}
    const txt = pill.querySelector('.rs-sync-txt');
    const icon = pill.querySelector('i');
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const n = syncDepth();
    const auth = needsAuthSync();
    pill.className = '';
    pill.onclick = null;
    if (auth && n > 0) {
      pill.classList.add('is-auth');
      if (icon) {icon.className = 'fa-solid fa-cloud-arrow-up';}
      if (txt) {txt.textContent = n + ' bill' + (n === 1 ? '' : 's') + ' waiting — sign in';}
      pill.title = 'Sync paused until you re-authenticate';
      pill.onclick = function () { location.href = 'login?stay=1'; };
    } else if (offline) {
      pill.classList.add('is-offline');
      if (icon) {icon.className = 'fa-solid fa-wifi';}
      if (txt) {txt.textContent = n > 0 ? ('Offline · ' + n + ' pending') : 'Offline · billing works';}
      pill.title = 'Bills save on this device and upload when online';
    } else if (n > 0) {
      pill.classList.add('is-syncing');
      if (icon) {icon.className = 'fa-solid fa-cloud-arrow-up fa-fade';}
      if (txt) {txt.textContent = 'Syncing ' + n + '…';}
      pill.title = 'Uploading local changes to cloud';
    } else {
      pill.classList.add('is-online');
      if (icon) {icon.className = 'fa-solid fa-cloud-check';}
      if (txt) {txt.textContent = 'Online · synced';}
      pill.title = 'Connected — cloud sync OK';
    }
    // Version pill is support-only (hidden for restaurant users in CSS/JS)
    const ver = document.getElementById('app-version-pill');
    if (ver && !isSupportUiAllowed()) {
      ver.style.display = 'none';
    }
  }

  /** Dev / support UI: superadmin, explicit demo tools, or localhost only */
  function isSupportUiAllowed() {
    try {
      if (role() === 'superadmin') return true;
      if (global.RS_API && RS_API.enableDemoTools) return true;
      const h = String(location.hostname || '');
      if (h === 'localhost' || h === '127.0.0.1') return true;
      if (sessionStorage.getItem('rs_debug_ui') === '1' &&
          new URLSearchParams(location.search).get('debug') === '1') {
        return true;
      }
    } catch (_) {}
    return false;
  }

  /* ---------- #4 Live access banner ---------- */
  function ensureAccessBanner() {
    if (document.getElementById('rs-access-live-banner')) {return;}
    const main = document.querySelector('.main .content') || document.querySelector('.main');
    if (!main) {return;}
    const b = document.createElement('div');
    b.id = 'rs-access-live-banner';
    b.innerHTML = '<i class="fa-solid fa-user-shield"></i><span class="rs-access-msg"></span><button type="button" data-dismiss>OK</button>';
    main.insertBefore(b, main.firstChild);
    b.querySelector('[data-dismiss]').onclick = function () {
      b.classList.remove('show');
    };
  }

  function showAccessBanner(msg) {
    ensureAccessBanner();
    const b = document.getElementById('rs-access-live-banner');
    if (!b) {return;}
    const m = b.querySelector('.rs-access-msg');
    if (m) {m.textContent = msg || 'Your access was updated';}
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.remove('show'); }, 12000);
  }

  let _origApplyLive;
  function hookLiveAccess() {
    if (typeof global.RS_applyLiveRoleUpdate !== 'function') {return;}
    if (global.RS_applyLiveRoleUpdate._polish18) {return;}
    _origApplyLive = global.RS_applyLiveRoleUpdate;
    global.RS_applyLiveRoleUpdate = function (newRole, tabs, opts) {
      const prev = (global.RS_ROLE && global.RS_ROLE.allowedTabs) || [];
      const changed = _origApplyLive.apply(this, arguments);
      if (changed) {
        const next = (global.RS_ROLE && global.RS_ROLE.allowedTabs) || [];
        const added = Array.isArray(next) ? next.filter(function (t) { return prev.indexOf(t) === -1; }) : [];
        const labels = { 'floor-tab': 'Floor', 'kds-tab': 'Kitchen', 'bills-tab': 'Bills', 'pos-tab': 'POS' };
        const nice = added.map(function (t) { return labels[t] || t.replace(/-tab$/, ''); }).join(', ');
        showAccessBanner(
          nice
            ? ('Access updated — unlocked: ' + nice)
            : ('Access updated for role ' + String(newRole || ''))
        );
        applyRoleNav();
        applyKdsFocus();
        auditLog('access.live_update', String(newRole || '') + ' tabs=' + (Array.isArray(next) ? next.join(',') : 'all'));
      }
      return changed;
    };
    global.RS_applyLiveRoleUpdate._polish18 = true;
  }

  /* ---------- #5 Role empty states ---------- */
  function injectRoleEmptyState(tabId) {
    const el = document.getElementById(tabId);
    if (!el || el.querySelector('.rs-role-empty')) {return;}
    if (hasTab(tabId)) {return;}
    const box = document.createElement('div');
    box.className = 'rs-role-empty';
    box.innerHTML =
      '<div><i class="fa-solid fa-lock"></i></div>' +
      '<h3>No access to this screen</h3>' +
      '<p>Ask your manager to unlock this module in <b>Employees → Logins → Edit access</b>.</p>';
    el.appendChild(box);
  }

  /* ---------- #6 Mobile bottom nav by role ---------- */
  function applyRoleNav() {
    const tabs = allowedTabs();
    const links = document.querySelectorAll('.mnav-link[data-tab]');
    if (!links.length) {return;}
    if (tabs == null) {
      document.body.classList.remove('rs-role-nav-trim');
      links.forEach(function (a) { a.classList.remove('is-role-hidden'); });
      return;
    }
    document.body.classList.add('rs-role-nav-trim');
    links.forEach(function (a) {
      const id = a.getAttribute('data-tab') || '';
      const ok = tabs.indexOf(id) !== -1;
      a.classList.toggle('is-role-hidden', !ok);
      if (!ok) {a.style.display = 'none';}
      else {a.style.display = '';}
    });
  }

  /* ---------- #7 KDS focus mode ---------- */
  function applyKdsFocus() {
    const r = role();
    const kitchenOnly = r === 'kitchen' || (Array.isArray(allowedTabs()) && allowedTabs().length === 1 && allowedTabs()[0] === 'kds-tab');
    document.documentElement.classList.toggle('rs-kds-focus', !!kitchenOnly);
    if (kitchenOnly) {
      try {
        if (global.RS && RS.activateTab) {RS.activateTab('kds-tab');}
        else if (typeof activateTab === 'function') {activateTab('kds-tab');}
      } catch (_) {}
    }
  }

  /* ---------- #8 Floor long-press actions hint ---------- */
  function wireFloorLongPress() {
    const root = document.getElementById('floor-tab') || document.getElementById('floor-plan') || document.body;
    if (!root || root._floorHoldWired) {return;}
    root._floorHoldWired = true;
    let timer = null;
    let hint = null;
    function hide() {
      if (timer) {clearTimeout(timer);}
      timer = null;
      if (hint && hint.parentNode) {hint.parentNode.removeChild(hint);}
      hint = null;
    }
    root.addEventListener('pointerdown', function (e) {
      const card = e.target && e.target.closest && e.target.closest('[data-table], .floor-table, .ft-card, .table-card, .rs-table-chip');
      if (!card) {return;}
      hide();
      timer = setTimeout(function () {
        hint = document.createElement('div');
        hint.className = 'rs-floor-hold-hint';
        hint.textContent = 'Tap: open · Hold menu: order / bill / clear (when allowed)';
        hint.style.left = (e.clientX || 0) + 'px';
        hint.style.top = (e.clientY || 0) + 'px';
        document.body.appendChild(hint);
        try {
          if (navigator.vibrate) {navigator.vibrate(12);}
        } catch (_) {}
      }, 480);
    }, true);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      root.addEventListener(ev, hide, true);
    });
  }

  /* ---------- #9 Density modes (this device only) ---------- */
  function currentDensity() {
    let m = 'comfortable';
    try { m = localStorage.getItem(DENSITY_KEY) || 'comfortable'; } catch (_) {}
    if (['compact', 'comfortable', 'large'].indexOf(m) === -1) m = 'comfortable';
    return m;
  }

  function applyDensity(mode) {
    let m = mode || currentDensity();
    if (['compact', 'comfortable', 'large'].indexOf(m) === -1) {m = 'comfortable';}
    document.documentElement.setAttribute('data-rs-density', m);
    try { localStorage.setItem(DENSITY_KEY, m); } catch (_) {}
    document.querySelectorAll('[data-density]').forEach(function (b) {
      if (!b || !b.classList) return;
      if (b.getAttribute('data-density')) {
        b.classList.toggle('active', b.getAttribute('data-density') === m);
        b.setAttribute('aria-pressed', b.getAttribute('data-density') === m ? 'true' : 'false');
      }
    });
    // Sync compact chip label
    document.querySelectorAll('[data-rs-density-label]').forEach(function (el) {
      el.textContent = m === 'compact' ? 'Compact' : (m === 'large' ? 'Large' : 'Comfortable');
    });
  }

  function densityPickerHtml(idPrefix) {
    const cur = currentDensity();
    const opts = [
      { id: 'compact', title: 'Compact', sub: 'Small counter / phone — more items on screen' },
      { id: 'comfortable', title: 'Comfortable', sub: 'Default size for day-to-day billing' },
      { id: 'large', title: 'Large', sub: 'Kitchen display — easier to read from far' },
    ];
    return (
      '<div class="rs-density-sheet" id="' + (idPrefix || 'rs-density-sheet') + '">' +
      '<p class="rs-density-sheet-lead">This device only. Does not change other staff or outlets.</p>' +
      '<div class="rs-density-options" role="group" aria-label="Display density">' +
      opts.map(function (o) {
        return (
          '<button type="button" class="rs-density-opt' + (cur === o.id ? ' active' : '') + '" data-density="' + o.id + '" aria-pressed="' + (cur === o.id ? 'true' : 'false') + '">' +
          '<span class="rs-density-opt-title">' + o.title + '</span>' +
          '<span class="rs-density-opt-sub">' + o.sub + '</span></button>'
        );
      }).join('') +
      '</div></div>'
    );
  }

  function wireDensityButtons(root, onPicked) {
    if (!root) return;
    root.querySelectorAll('[data-density]').forEach(function (b) {
      b.onclick = function () {
        const mode = b.getAttribute('data-density');
        applyDensity(mode);
        toast('This device: ' + mode + ' display', 'fa-text-height');
        auditLog('device.density', mode);
        if (typeof onPicked === 'function') onPicked(mode);
      };
    });
  }

  /** Modal: preferred entry for every role */
  function openDensityPrefs() {
    applyDensity();
    const body = densityPickerHtml('rs-density-modal');
    if (global.RSModal && typeof RSModal.open === 'function') {
      RSModal.open({
        title: 'This device · Display',
        icon: 'fa-text-height',
        size: 'sm',
        body: body,
        onMount: function (modal, close) {
          wireDensityButtons(modal, function () {
            // Keep modal open so they can compare; optional auto-close:
            // setTimeout(close, 280);
          });
        },
      });
      return;
    }
    // Fallback if RSModal missing
    const mode = window.prompt('Display density: compact | comfortable | large', currentDensity());
    if (mode) applyDensity(String(mode).toLowerCase().trim());
  }

  function stripSettingsDensity() {
    // Remove legacy block that was injected at the top of Settings
    document.querySelectorAll('#settings-tab #rs-density-row').forEach(function (row) {
      const wrap = row.closest('div[style], .rs-density-legacy, section');
      if (wrap && wrap.querySelector && wrap.querySelector('#rs-density-row')) {
        try { wrap.remove(); } catch (_) {
          try { row.parentElement && row.parentElement.remove(); } catch (__) {}
        }
      } else {
        try { row.parentElement && row.parentElement.remove(); } catch (_) {}
      }
    });
    // Also match our older inject markup (title "Display density" right under settings)
    document.querySelectorAll('#settings-tab').forEach(function (tab) {
      tab.querySelectorAll('div').forEach(function (div) {
        if (div.id === 'rs-density-row') return;
        const t = (div.textContent || '').trim();
        if (t.indexOf('Display density') === 0 && div.querySelector('#rs-density-row')) {
          try { div.remove(); } catch (_) {}
        }
      });
    });
  }

  function injectSidebarDensityEntry() {
    const foot = document.querySelector('.sb-foot');
    if (!foot || document.getElementById('open-device-display')) return;
    const help = document.getElementById('open-product-guide-btn');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sb-foot-btn';
    btn.id = 'open-device-display';
    btn.title = 'This device · Display size';
    btn.innerHTML = '<i class="fa-solid fa-text-height"></i><span>Display</span>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openDensityPrefs();
    });
    // Between Help and Sign out when possible
    const logout = foot.querySelector('.sb-foot-btn.logout');
    if (help && help.parentNode === foot) {
      if (logout) foot.insertBefore(btn, logout);
      else foot.insertBefore(btn, help.nextSibling);
    } else if (logout) {
      foot.insertBefore(btn, logout);
    } else {
      foot.appendChild(btn);
    }
  }

  function removeTopbarDensityChip() {
    // Top-bar chip sat next to search and looked like "Compact bbb" — remove it.
    // Prefer sidebar "Display" + mobile More → Display only.
    try {
      const chip = document.getElementById('rs-density-chip');
      if (chip) chip.remove();
    } catch (_) {}
  }

  function injectDensityControl() {
    stripSettingsDensity();
    removeTopbarDensityChip();
    injectSidebarDensityEntry();
    applyDensity();
  }

  /* ---------- #10 My shift summary for non-report roles ---------- */
  function injectMyShiftSummary() {
    if (isOwnerLike() || hasTab('reports-tab')) {return;}
    if (!hasTab('pos-tab')) {return;}
    const pos = document.getElementById('pos-tab');
    if (!pos || document.getElementById('rs-my-shift-card')) {return;}
    const card = document.createElement('div');
    card.id = 'rs-my-shift-card';
    card.style.cssText =
      'margin:10px 12px;padding:12px 14px;border-radius:12px;border:1px solid var(--stroke-2);background:var(--glass);font-size:12.5px';
    function paint() {
      const bills = (global.RS && RS.BILLS) || [];
      const me = sessionStorage.getItem('logged_in_user') || '';
      const today = new Date().toISOString().slice(0, 10);
      const mine = bills.filter(function (b) {
        const d = String(b.dateTime || b.time || b.created_at || '').slice(0, 10);
        const cash = String(b.cashier || b.servedBy || b.username || '');
        return d === today && (!me || cash.toLowerCase().indexOf(me.toLowerCase()) !== -1 || !cash);
      });
      const total = mine.reduce(function (a, b) { return a + (Number(b.amount || b.grand || b.total) || 0); }, 0);
      card.innerHTML =
        '<div style="font-weight:800;margin-bottom:4px"><i class="fa-solid fa-clock"></i> My shift today</div>' +
        '<div style="color:var(--text-soft)">' +
        mine.length +
        ' bill' +
        (mine.length === 1 ? '' : 's') +
        ' · ≈ ' +
        (global.RS && RS.rs ? RS.rs(total) : '₹' + Math.round(total)) +
        ' <span style="color:var(--text-mute)">(this device / your name)</span></div>';
    }
    pos.insertBefore(card, pos.firstChild);
    paint();
    document.addEventListener('rs:hydrated', paint);
    window.addEventListener('rs:db-sync', paint);
  }

  /* ---------- #11 WA queue chip ---------- */
  function ensureWaChip() {
    const right = document.getElementById('tb-right');
    if (!right || document.getElementById('rs-wa-queue-chip')) {return;}
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'rs-wa-queue-chip';
    chip.innerHTML = '<i class="fa-brands fa-whatsapp"></i><span class="n">0</span>';
    chip.title = 'WhatsApp send queue';
    chip.onclick = function () {
      let list = [];
      try {
        if (global.RSWaQueue && typeof RSWaQueue.list === 'function') {list = RSWaQueue.list();}
      } catch (_) {}
      const failed = list.filter(function (x) { return x && (x.status === 'failed' || (x.attempts || 0) > 3); });
      const msg =
        list.length === 0
          ? 'No WhatsApp messages waiting.'
          : list.length +
            ' in queue' +
            (failed.length ? ' · ' + failed.length + ' failed — will retry' : ' · auto-retry when gateway is ready');
      toast(msg, 'fa-brands fa-whatsapp');
      try {
        if (global.RSWaQueue && typeof RSWaQueue.process === 'function') {RSWaQueue.process();}
      } catch (_) {}
    };
    const ver = document.getElementById('app-version-pill');
    if (ver && ver.parentNode) {ver.parentNode.insertBefore(chip, ver);}
    else {right.appendChild(chip);}
  }

  function paintWaChip() {
    ensureWaChip();
    const chip = document.getElementById('rs-wa-queue-chip');
    if (!chip) {return;}
    let n = 0;
    let failed = 0;
    try {
      if (global.RSWaQueue) {
        n = typeof RSWaQueue.count === 'function' ? RSWaQueue.count() : 0;
        const list = typeof RSWaQueue.list === 'function' ? RSWaQueue.list() : [];
        failed = list.filter(function (x) { return x && (x.status === 'failed' || (x.attempts || 0) > 3); }).length;
      }
    } catch (_) {}
    chip.classList.toggle('has-items', n > 0);
    chip.classList.toggle('has-failed', failed > 0);
    const span = chip.querySelector('.n');
    if (span) {span.textContent = String(n);}
  }

  /* ---------- #12 86'd menu tiles ---------- */
  function markSoldOutTiles() {
    if (!hasTab('pos-tab') && role() !== 'admin') {return;}
    const inv = (global.RS && RS.INVENTORY) || [];
    const sold = {};
    inv.forEach(function (i) {
      const name = String(i.name || '').toLowerCase();
      const stock = Number(i.stock != null ? i.stock : i.qty);
      if (name && Number.isFinite(stock) && stock <= 0) {sold[name] = true;}
    });
    document.querySelectorAll('.menu-item-card, [data-menu-id], .pos-item').forEach(function (card) {
      const label = (card.querySelector('.mi-name, .item-name, h4, .name') || card).textContent || '';
      const key = label.trim().toLowerCase().split('\n')[0];
      let isOut = !!sold[key];
      if (!isOut && card.dataset.stock != null && Number(card.dataset.stock) <= 0) {isOut = true;}
      card.classList.toggle('rs-sold-out', isOut);
      if (isOut) {card.title = (card.title || '') + ' · 86 — out of stock';}
    });
  }

  /* ---------- #13 Audit panel in Employees ---------- */
  function injectAuditPanel() {
    if (!isOwnerLike()) {return;}
    const emp = document.getElementById('employees-tab');
    if (!emp || document.getElementById('rs-owner-audit-panel')) {return;}
    const panel = document.createElement('div');
    panel.id = 'rs-owner-audit-panel';
    panel.innerHTML =
      '<h4><i class="fa-solid fa-clipboard-list"></i> Activity (this device)</h4>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-d="1">Today</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-d="7">7 days</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-d="30">30 days</button></div>' +
      '<div class="rs-audit-body"></div>';
    emp.appendChild(panel);
    function paint(days) {
      const rows = readAudit(days);
      const body = panel.querySelector('.rs-audit-body');
      if (!rows.length) {
        body.innerHTML = '<div style="color:var(--text-mute);font-size:12.5px;padding:8px 0">No local activity yet. Staff access changes and key actions appear here.</div>';
        return;
      }
      body.innerHTML = rows
        .slice(0, 40)
        .map(function (r) {
          const when = new Date(r.t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          return (
            '<div class="rs-audit-row"><span class="rs-audit-time">' +
            when +
            '</span><span><b>' +
            esc(r.action) +
            '</b> · ' +
            esc(r.by) +
            (r.detail ? ' — ' + esc(r.detail) : '') +
            '</span></div>'
          );
        })
        .join('');
    }
    panel.querySelectorAll('[data-d]').forEach(function (b) {
      b.onclick = function () { paint(Number(b.getAttribute('data-d')) || 7); };
    });
    paint(7);
    document.addEventListener('rs:owner-audit', function () { paint(7); });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- #14 Super-admin shell badge (platform owner only) ---------- */
  function platformBadge() {
    // Never show on restaurant outlets — confuses customers
    if (role() !== 'superadmin') {
      const stale = document.getElementById('rs-platform-shell-badge');
      if (stale) try { stale.remove(); } catch (_) {}
      return;
    }
    const side = document.querySelector('.sidebar .brand, .sidebar .sb-brand, #sidebar');
    if (!side || document.getElementById('rs-platform-shell-badge')) {return;}
    const b = document.createElement('div');
    b.id = 'rs-platform-shell-badge';
    b.textContent = 'Platform console · not an outlet';
    const brand = document.querySelector('.sidebar .brand') || side.firstChild;
    if (brand && brand.parentNode) {brand.parentNode.insertBefore(b, brand.nextSibling);}
    else {side.insertBefore(b, side.firstChild);}
  }

  /* ---------- #16 Human offline errors (wrap toast if cloud language leaks) ---------- */
  function humanizeCloudError(msg) {
    const m = String(msg || '');
    if (/could not reach|fetch failed|Failed to fetch|Desktop could not reach|network|ECONN|offline/i.test(m)) {
      return 'No internet — using offline mode. Data saves on this device.';
    }
    if (/Session was revoked|no longer active/i.test(m)) {
      return 'This login was ended by a manager. Please sign in again.';
    }
    if (/Session expired/i.test(m)) {
      return 'Session expired for cloud sync. Stay offline or sign in again.';
    }
    return m;
  }
  global.RS_humanizeCloudError = humanizeCloudError;

  /* ---------- #18 Offline-ready coach after first login ---------- */
  function maybeOfflineCoach() {
    try {
      if (localStorage.getItem(COACH_KEY) === '1') {return;}
      if (role() === 'superadmin') {return;}
      if (!global.RSModal) {return;}
      // Only once after a successful online session with remember
      const persist = sessionStorage.getItem('rs_session_persistent');
      if (persist === '0') {return;}
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {return;}
      setTimeout(function () {
        try {
          if (localStorage.getItem(COACH_KEY) === '1') {return;}
          localStorage.setItem(COACH_KEY, '1');
          global.RSModal.open({
            title: 'Ready for offline POS',
            icon: 'fa-wifi',
            size: 'sm',
            body:
              '<p style="margin:0;font-size:13.5px;line-height:1.5;color:var(--text-soft)">This device can keep billing if Wi‑Fi drops.</p>' +
              '<ul class="rs-offline-coach-steps">' +
              '<li><span class="n">1</span><span>Leave <b>Keep me signed in</b> on when you log in.</span></li>' +
              '<li><span class="n">2</span><span>Do not use Sign out at end of day — just close the app.</span></li>' +
              '<li><span class="n">3</span><span>When offline, bills save locally and upload when you are back online.</span></li>' +
              '</ul>',
            foot: '<button type="button" class="btn btn-primary" data-ok>Got it</button>',
            onMount: function (modal, close) {
              modal.querySelector('[data-ok]').onclick = close;
            },
          });
        } catch (_) {}
      }, 2200);
    } catch (_) {}
  }

  /* ---------- #3 Settle confidence strip (enhance receipt modal) ---------- */
  function enhanceSettleModal(bill) {
    try {
      const body = document.querySelector('.rc-settle-body, .rc-settle-modal .mh-body, #rc-paper');
      const host = document.querySelector('.rc-settle-modal .mh-body') || document.querySelector('.rc-settle-overlay .dm-body');
      if (!host || host.querySelector('.rc-settle-trust')) {return;}
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const pending = syncDepth() > 0 || offline;
      const strip = document.createElement('div');
      strip.className = 'rc-settle-trust' + (pending ? ' is-pending' : '');
      strip.innerHTML =
        '<i class="fa-solid ' +
        (pending ? 'fa-cloud-arrow-up' : 'fa-circle-check') +
        '"></i><div><div>' +
        (pending
          ? 'Bill saved on this device' + (bill && bill.no ? ' · <b>' + esc(bill.no) + '</b>' : '') + ' — will sync when online.'
          : 'Bill secured' + (bill && bill.no ? ' · <b>' + esc(bill.no) + '</b>' : '') + ' · cloud OK') +
        '</div><div class="rc-retry-row">' +
        '<button type="button" data-act="print"><i class="fa-solid fa-print"></i> Print again</button>' +
        '<button type="button" data-act="wa"><i class="fa-brands fa-whatsapp"></i> WhatsApp again</button>' +
        '</div></div>';
      host.insertBefore(strip, host.firstChild);
      strip.querySelector('[data-act="print"]').onclick = function () {
        try {
          if (global.RSReceipt && RSReceipt.print) {RSReceipt.print(bill);}
          else if (global.RSOps && RSOps.printBillThermal) {RSOps.printBillThermal(bill);}
          else {toast('Print started', 'fa-print');}
        } catch (e) {
          toast('Print failed — try again', 'fa-circle-exclamation');
        }
      };
      strip.querySelector('[data-act="wa"]').onclick = function () {
        try {
          if (global.RSReceipt && RSReceipt.share) {RSReceipt.share(bill);}
          else {toast('Opening WhatsApp…', 'fa-brands fa-whatsapp');}
        } catch (e) {
          toast('WhatsApp failed — queued if possible', 'fa-circle-exclamation');
        }
      };
      auditLog('pos.settle', bill && bill.no ? String(bill.no) : 'bill');
    } catch (_) {}
  }

  function hookSettle() {
    if (!global.RSReceipt || typeof RSReceipt.show !== 'function' || RSReceipt.show._polish18) {return;}
    const orig = RSReceipt.show.bind(RSReceipt);
    RSReceipt.show = function (bill, opts) {
      const ret = orig(bill, opts);
      setTimeout(function () { enhanceSettleModal(bill); }, 80);
      setTimeout(function () { enhanceSettleModal(bill); }, 400);
      return ret;
    };
    RSReceipt.show._polish18 = true;
  }

  /* ---------- #1 Access presets (expose helpers for features-manage) ---------- */
  const ACCESS_PRESETS = {
    billing: { label: 'Billing only', tabs: ['pos-tab', 'floor-tab', 'bills-tab', 'customers-tab'] },
    floor_kds: { label: 'Floor + KDS', tabs: ['pos-tab', 'floor-tab', 'kds-tab'] },
    kitchen: { label: 'Kitchen only', tabs: ['kds-tab'] },
    manager: { label: 'Full manager', tabs: null }, // filled from role defaults
  };
  global.RS_ACCESS_PRESETS = ACCESS_PRESETS;
  global.RS_tabsForPreset = function (key) {
    if (key === 'manager' && global.RS_ROLE_DEFAULTS && RS_ROLE_DEFAULTS.tabsForRole) {
      return RS_ROLE_DEFAULTS.tabsForRole('manager');
    }
    const p = ACCESS_PRESETS[key];
    return p && p.tabs ? p.tabs.slice() : [];
  };

  /* ---------- boot ---------- */
  function boot() {
    applyDensity();
    ensureSyncPill();
    paintSyncPill();
    ensureWaChip();
    paintWaChip();
    platformBadge();
    hookLiveAccess();
    hookSettle();
    applyRoleNav();
    applyKdsFocus();
    wireFloorLongPress();
    injectMyShiftSummary();
    injectDensityControl();
    injectAuditPanel();
    markSoldOutTiles();
    maybeOfflineCoach();
    // Super-admin clarity on title
    if (role() === 'superadmin') {
      try {
        document.title = 'RestroSuite Platform · Super-Admin';
      } catch (_) {}
    }
  }

  document.addEventListener('rs:ready', function () {
    setTimeout(boot, 100);
    setTimeout(hookSettle, 800);
    setTimeout(hookLiveAccess, 200);
  });
  document.addEventListener('rs:hydrated', function () {
    applyRoleNav();
    applyKdsFocus();
    markSoldOutTiles();
    injectAuditPanel();
    injectDensityControl();
    injectMyShiftSummary();
    setTimeout(hookSettle, 300);
  });
  window.addEventListener('online', paintSyncPill);
  window.addEventListener('offline', paintSyncPill);
  window.addEventListener('rs:sync-queue-changed', paintSyncPill);
  window.addEventListener('rs:sync-queue-drained', paintSyncPill);
  window.addEventListener('rs:wa-queue-changed', paintWaChip);
  document.addEventListener('rs:tab', function (ev) {
    applyKdsFocus();
    markSoldOutTiles();
    // Settings used to host density — strip if any stale inject reappears
    try {
      const tab = ev && ev.detail && ev.detail.tab;
      if (tab === 'settings-tab' || document.getElementById('settings-tab')?.classList?.contains('active')) {
        stripSettingsDensity();
      }
    } catch (_) {
      stripSettingsDensity();
    }
  });
  setInterval(paintSyncPill, 4000);
  setInterval(paintWaChip, 8000);
  setInterval(markSoldOutTiles, 20000);

  if (document.readyState !== 'loading') {setTimeout(boot, 50);}
  else {document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 50); });}

  global.RSProductPolish18 = {
    auditLog: auditLog,
    paintSyncPill: paintSyncPill,
    showAccessBanner: showAccessBanner,
    applyDensity: applyDensity,
    openDensityPrefs: openDensityPrefs,
    humanizeCloudError: humanizeCloudError,
    ACCESS_PRESETS: ACCESS_PRESETS,
  };
  global.RS_openDeviceDisplay = openDensityPrefs;
})(typeof window !== 'undefined' ? window : globalThis);
