/* ============================================================
   RestroSuite -- Live Service Alerts (waiter calls + payment checks)

   Guests tap "Call Waiter" / "Bring Water" / submit a UTR on the
   table QR portal (qr-order.html -> tenant-public edge function ->
   doppio_notifications). This module surfaces those requests on
   every logged-in staff screen (POS counter, waiter phones):

     - Floating alert cards (bottom-right) with table + request +
       elapsed time and an Acknowledge button.
     - Two-tone chime + phone vibration on arrival; ONE polite voice
       announcement ("Table 5 needs Drinking Water") for waiter calls.
     - Soft reminder chime every 25s while unacknowledged (auto-stops
       after 5 minutes per call -- no endless siren).
     - Acknowledge on ANY device clears the card everywhere
       (cloud isRead update -> Supabase realtime -> other screens).
     - Mute toggle persisted per device (waiter can silence a phone).

   Data flow: dashboard.js already refreshes the 'notifications'
   collection via Supabase realtime and fires 'rs:collection_synced'.
   We listen to that, plus keep a light 15s polling fallback because
   production RLS can block realtime subscriptions.
   ============================================================ */
(function () {
  'use strict';

  var ALERT_TYPES = { waiter_call: true, payment_alert: true };
  var MAX_AGE_MS = 30 * 60 * 1000;        // ignore calls older than 30 min
  var REMINDER_EVERY_MS = 25 * 1000;      // soft reminder cadence
  var REMINDER_STOP_AFTER_MS = 5 * 60 * 1000; // stop nagging after 5 min
  var POLL_MS = 15 * 1000;                // realtime fallback poll
  var MUTE_KEY = 'rs_service_alert_mute';

  var seenIds = {};        // id -> true (already announced)
  var activeCalls = [];    // current unread service notifications
  var firstLoadDone = false;
  var audioCtx = null;
  var audioUnlocked = false;
  var reminderTimer = null;
  var tickTimer = null;
  var pollTimer = null;
  var root = null;

  /* ---------------- helpers ---------------- */

  function isMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function setMuted(v) {
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (e) {}
  }

  function safe(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function tenantSessionActive() {
    try {
      if (window.RS_API && RS_API.session) {
        var s = RS_API.session();
        if (s && s.role !== 'superadmin' && s.role !== 'brand_admin') return true;
      }
      var role = sessionStorage.getItem('logged_in_role');
      if (role && role !== 'superadmin' && role !== 'brand_admin') return true;
    } catch (e) {}
    return false;
  }

  function parseTable(n) {
    var m = String(n.title || '').match(/table\s*([a-z0-9\- ]+?)\s*(call|payment|$)/i);
    return m ? m[1].trim() : '';
  }

  function parseRequest(n) {
    var msg = String(n.message || '');
    var idx = msg.indexOf(':');
    if (n.type === 'payment_alert') return msg || 'Payment verification';
    return idx >= 0 ? msg.slice(idx + 1).trim() : (msg || 'Assistance');
  }

  function notifTime(n) {
    var t = Date.parse(n.timestamp || n.createdAt || '') || Date.now();
    return t;
  }

  function elapsedLabel(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60);
    return m + 'm ' + (s % 60) + 's ago';
  }

  /* ---------------- audio / haptics / voice ---------------- */

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    } catch (e) {}
    return audioCtx;
  }

  function unlockAudio() {
    var ctx = ensureAudio();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(function () { audioUnlocked = true; }).catch(function () {});
    } else if (ctx) {
      audioUnlocked = true;
    }
  }

  // Pleasant two-tone "ding-dong" -- no external sound file needed.
  function playChime(soft) {
    if (isMuted()) return;
    var ctx = ensureAudio();
    if (!ctx || ctx.state === 'suspended') return; // wait for user gesture
    try {
      var vol = soft ? 0.12 : 0.25;
      [[1318.5, 0], [1046.5, 0.18]].forEach(function (tone) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = tone[0];
        var t0 = ctx.currentTime + tone[1];
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.5);
      });
    } catch (e) {}
  }

  function vibrate() {
    if (isMuted()) return;
    try { if (navigator.vibrate) navigator.vibrate([220, 90, 220]); } catch (e) {}
  }

  function announce(call) {
    if (isMuted() || call.type !== 'waiter_call') return;
    try {
      if (!window.speechSynthesis) return;
      var text = 'Table ' + (call.table || '') + ' needs ' + (call.request || 'assistance');
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.volume = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------------- data ---------------- */

  function extractCalls(rows) {
    var now = Date.now();
    return (rows || [])
      .filter(function (n) {
        return n && ALERT_TYPES[n.type] && !n.isRead && (now - notifTime(n)) < MAX_AGE_MS;
      })
      .map(function (n) {
        return {
          id: String(n.id),
          type: n.type,
          table: parseTable(n),
          request: parseRequest(n),
          at: notifTime(n),
          raw: n
        };
      })
      .sort(function (a, b) { return a.at - b.at; });
  }

  function refreshFromLocal() {
    if (!window.RS_DB) return Promise.resolve();
    var read = (RS_DB.listLocal ? RS_DB.listLocal('notifications') : RS_DB.list('notifications'));
    return Promise.resolve(read).then(function (rows) { applyCalls(extractCalls(rows)); }).catch(function () {});
  }

  function pollCloud() {
    if (!window.RS_DB || !RS_DB.isCloud || document.hidden || !navigator.onLine) return;
    RS_DB.listCloud('notifications').then(function (rows) {
      if (RS_DB.writeLocal) RS_DB.writeLocal('notifications', rows || []);
      applyCalls(extractCalls(rows));
    }).catch(function () {});
  }

  function applyCalls(calls) {
    var fresh = calls.filter(function (c) { return !seenIds[c.id]; });
    activeCalls = calls;
    render();

    if (!firstLoadDone) {
      // Don't voice-announce a backlog on login; a single chime is enough.
      firstLoadDone = true;
      calls.forEach(function (c) { seenIds[c.id] = true; });
      if (calls.length) { playChime(false); vibrate(); }
      syncReminder();
      return;
    }

    if (fresh.length) {
      playChime(false);
      vibrate();
      // Announce at most 2 to avoid chaos during a rush.
      fresh.slice(0, 2).forEach(announce);
      fresh.forEach(function (c) { seenIds[c.id] = true; });
    }
    syncReminder();
  }

  function acknowledge(call) {
    activeCalls = activeCalls.filter(function (c) { return c.id !== call.id; });
    render();
    syncReminder();
    if (window.RS_DB) {
      var updated = Object.assign({}, call.raw, { isRead: true });
      RS_DB.put('notifications', call.id, updated).catch(function (e) {
        console.warn('[service-alerts] ack sync failed:', e && e.message);
      });
    }
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
  }

  /* ---------------- reminder loop ---------------- */

  function syncReminder() {
    var now = Date.now();
    var nagging = activeCalls.some(function (c) { return (now - c.at) < REMINDER_STOP_AFTER_MS; });
    if (nagging && !reminderTimer) {
      reminderTimer = setInterval(function () {
        var t = Date.now();
        var still = activeCalls.some(function (c) { return (t - c.at) < REMINDER_STOP_AFTER_MS; });
        if (!still) { clearInterval(reminderTimer); reminderTimer = null; return; }
        if (!document.hidden) playChime(true);
      }, REMINDER_EVERY_MS);
    } else if (!nagging && reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }
    if (activeCalls.length && !tickTimer) {
      tickTimer = setInterval(renderTimes, 1000);
    } else if (!activeCalls.length && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  /* ---------------- UI ---------------- */

  function injectStyles() {
    if (document.getElementById('rs-service-alert-css')) return;
    var css = [
      '#rs-service-alerts{position:fixed;right:14px;bottom:14px;z-index:99990;display:flex;flex-direction:column;gap:10px;max-width:340px;width:calc(100vw - 28px);font-family:inherit;}',
      '@media (max-width:768px){#rs-service-alerts{bottom:86px;}}',
      '.rs-sa-card{background:#1c2536;color:#fff;border:1px solid rgba(252,128,25,.55);border-left:5px solid #FF4F00;border-radius:12px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.35);display:flex;align-items:center;gap:12px;animation:rsSaIn .3s ease;}',
      '.rs-sa-card.rs-sa-pay{border-color:rgba(16,185,129,.55);border-left-color:#10B981;}',
      '@keyframes rsSaIn{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}',
      '.rs-sa-ic{width:38px;height:38px;border-radius:10px;background:rgba(252,128,25,.18);color:#FF4F00;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;animation:rsSaPulse 1.6s ease-in-out infinite;}',
      '.rs-sa-pay .rs-sa-ic{background:rgba(16,185,129,.18);color:#10B981;}',
      '@keyframes rsSaPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}',
      '.rs-sa-body{flex:1;min-width:0;}',
      '.rs-sa-title{font-weight:800;font-size:14px;line-height:1.25;}',
      '.rs-sa-sub{font-size:12px;opacity:.8;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rs-sa-time{font-size:10.5px;opacity:.6;margin-top:2px;}',
      '.rs-sa-ack{background:#FF4F00;color:#fff;border:none;border-radius:9px;padding:9px 13px;font-weight:800;font-size:12px;cursor:pointer;flex-shrink:0;}',
      '.rs-sa-ack:active{transform:scale(.96);}',
      '.rs-sa-pay .rs-sa-ack{background:#10B981;}',
      '.rs-sa-bar{display:flex;justify-content:flex-end;align-items:center;gap:8px;}',
      '.rs-sa-mute{background:rgba(28,37,54,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:50px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;}',
      '.rs-sa-more{font-size:11px;color:#fff;background:rgba(28,37,54,.92);border:1px solid rgba(255,255,255,.18);border-radius:50px;padding:6px 12px;font-weight:700;}'
    ].join('\n');
    var el = document.createElement('style');
    el.id = 'rs-service-alert-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function ensureRoot() {
    if (root && document.body.contains(root)) return root;
    root = document.createElement('div');
    root.id = 'rs-service-alerts';
    document.body.appendChild(root);
    return root;
  }

  function iconFor(call) {
    if (call.type === 'payment_alert') return 'fa-money-bill-wave';
    var r = (call.request || '').toLowerCase();
    if (r.indexOf('water') >= 0) return 'fa-glass-water';
    if (r.indexOf('cutlery') >= 0 || r.indexOf('plate') >= 0) return 'fa-utensils';
    if (r.indexOf('clear') >= 0) return 'fa-broom';
    if (r.indexOf('bill') >= 0) return 'fa-receipt';
    return 'fa-bell-concierge';
  }

  function render() {
    injectStyles();
    var host = ensureRoot();
    if (!activeCalls.length) { host.innerHTML = ''; return; }

    var visible = activeCalls.slice(0, 3);
    var extra = activeCalls.length - visible.length;
    var now = Date.now();

    host.innerHTML =
      '<div class="rs-sa-bar">' +
        (extra > 0 ? '<span class="rs-sa-more">+' + extra + ' more waiting</span>' : '') +
        '<button type="button" class="rs-sa-mute" data-act="mute"><i class="fa-solid ' + (isMuted() ? 'fa-volume-xmark' : 'fa-volume-high') + '"></i>' + (isMuted() ? 'Muted' : 'Sound on') + '</button>' +
      '</div>' +
      visible.map(function (c) {
        var isPay = c.type === 'payment_alert';
        return '<div class="rs-sa-card' + (isPay ? ' rs-sa-pay' : '') + '" data-id="' + safe(c.id) + '">' +
          '<div class="rs-sa-ic"><i class="fa-solid ' + iconFor(c) + '"></i></div>' +
          '<div class="rs-sa-body">' +
            '<div class="rs-sa-title">' + (c.table ? 'Table ' + safe(c.table) : 'Guest') + (isPay ? ' &middot; Payment' : '') + '</div>' +
            '<div class="rs-sa-sub">' + safe(c.request) + '</div>' +
            '<div class="rs-sa-time" data-at="' + c.at + '">' + elapsedLabel(now - c.at) + '</div>' +
          '</div>' +
          '<button type="button" class="rs-sa-ack" data-act="ack">' + (isPay ? 'Verify' : 'On it') + '</button>' +
        '</div>';
      }).join('');

    Array.prototype.forEach.call(host.querySelectorAll('[data-act="ack"]'), function (btn) {
      btn.onclick = function () {
        var id = btn.closest('.rs-sa-card').getAttribute('data-id');
        var call = activeCalls.filter(function (c) { return c.id === id; })[0];
        if (call) acknowledge(call);
      };
    });
    var muteBtn = host.querySelector('[data-act="mute"]');
    if (muteBtn) muteBtn.onclick = function () { setMuted(!isMuted()); render(); };
  }

  function renderTimes() {
    if (!root) return;
    var now = Date.now();
    Array.prototype.forEach.call(root.querySelectorAll('.rs-sa-time'), function (el) {
      var at = Number(el.getAttribute('data-at') || 0);
      if (at) el.textContent = elapsedLabel(now - at);
    });
  }

  /* ---------------- boot ---------------- */

  function start() {
    if (!tenantSessionActive()) return; // superadmin console: stay silent
    injectStyles();

    // Unlock audio on the first user interaction (browser autoplay policy).
    ['click', 'touchstart', 'keydown'].forEach(function (evt) {
      document.addEventListener(evt, unlockAudio, { once: true, passive: true });
    });

    // Primary feed: dashboard.js realtime refresh of the notifications collection.
    document.addEventListener('rs:collection_synced', function (e) {
      if (e && e.detail && e.detail.collection === 'notifications') refreshFromLocal();
    });

    // Fallback: light polling (covers realtime being blocked by RLS).
    pollTimer = setInterval(pollCloud, POLL_MS);

    // Initial paint.
    if (window.RS_DB && RS_DB.isCloud) pollCloud(); else refreshFromLocal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1200); });
  } else {
    setTimeout(start, 1200);
  }
})();
