/* ============================================================
   RestroSuite — Staff table QR scanner (in-app only)
   ------------------------------------------------------------
   Same printed table QR:
     • Guest phone camera  → public order / hub (guest CX)
     • Staff dashboard scan → POS / seat / waiter KOT (staff CX)

   Differentiation is by *who opens the scanner* (logged-in staff
   app), not by printing two different QR codes.
   ============================================================ */
(function (global) {
  'use strict';

  var STYLE_ID = 'rs-staff-scan-style';
  var ROOT_ID = 'rs-staff-scan-root';
  var streamRef = null;
  var loopTimer = null;
  var lastHit = '';
  var lastHitAt = 0;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon || 'fa-qrcode');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normTableKey(raw) {
    var key = String(raw == null ? '' : raw)
      .trim()
      .toLowerCase();
    if (!key) return '';
    key = key.replace(/\btable\b|\btbl\b/g, '').replace(/[^a-z0-9]/g, '');
    if (/^t\d+$/.test(key)) key = key.slice(1);
    if (/^\d+$/.test(key)) key = String(parseInt(key, 10));
    return key;
  }

  function currentTenantSlug() {
    try {
      if (global.RS_API && typeof RS_API.session === 'function') {
        var s = RS_API.session() || {};
        if (s.slug || s.tenant_slug) return String(s.slug || s.tenant_slug);
      }
    } catch (_) {}
    try {
      return (
        sessionStorage.getItem('tenant_slug') ||
        localStorage.getItem('tenant_slug') ||
        ''
      );
    } catch (_) {
      return '';
    }
  }

  /**
   * Parse guest table QR / deep links into { tenant, table, token, mode }.
   * Accepts full URLs, path-only, or bare "table=5" fragments.
   */
  function parseTableQrPayload(raw) {
    var text = String(raw || '').trim();
    if (!text) return null;

    var tenant = '';
    var table = '';
    var token = '';
    var mode = '';

    try {
      var url;
      if (/^https?:\/\//i.test(text)) url = new URL(text);
      else if (text.indexOf('?') >= 0 || text.indexOf('tenant=') >= 0 || text.indexOf('table=') >= 0) {
        url = new URL(text, location.origin);
      }
      if (url) {
        tenant = url.searchParams.get('tenant') || url.searchParams.get('outlet') || '';
        table = url.searchParams.get('table') || url.searchParams.get('t') || '';
        token = url.searchParams.get('token') || url.searchParams.get('session') || '';
        mode = url.searchParams.get('mode') || '';
        // Path forms: /order/table/5 or /t/5
        if (!table) {
          var m = url.pathname.match(/(?:table|t)\/(\w+)/i);
          if (m) table = m[1];
        }
      }
    } catch (_) {}

    // Plain table number typed by staff
    if (!table && /^\d{1,4}[A-Za-z]?$/.test(text)) {
      table = text;
    }
    // "Table 5" / "T-05"
    if (!table) {
      var m2 = text.match(/(?:table|tbl|t)[\s#:.-]*([0-9]{1,4}[A-Za-z]?)/i);
      if (m2) table = m2[1];
    }

    if (!table) return null;
    return {
      tenant: tenant || currentTenantSlug(),
      table: String(table).trim(),
      tableKey: normTableKey(table),
      token: token,
      mode: mode,
      raw: text,
    };
  }

  function findFloorTable(tableKey) {
    var list =
      (global.RS && Array.isArray(RS.TABLES) && RS.TABLES) ||
      (global.TABLES && Array.isArray(global.TABLES) && global.TABLES) ||
      [];
    return (
      list.find(function (t) {
        return normTableKey(t.n || t.name || t.tableNumber) === tableKey;
      }) || null
    );
  }

  function guestOrderBaseUrl() {
    try {
      var settings = global.RS_SETTINGS || {};
      if (settings.set_public_order_base) return String(settings.set_public_order_base).replace(/\/$/, '');
    } catch (_) {}
    var h = (location.hostname || '').toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1') return 'https://restrosuite.codearc.co.in';
    return location.origin;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    var r = '#' + ROOT_ID;
    s.textContent = [
      r + '{position:fixed;inset:0;z-index:2147483601;display:flex;align-items:flex-end;justify-content:center;background:rgba(12,10,9,.62);backdrop-filter:blur(4px);padding:12px;}',
      r + ' .rs-scan-card{width:min(440px,100%);background:var(--panel,#fff);color:var(--text,#16151c);border-radius:20px 20px 14px 14px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;border:1px solid var(--stroke-2,rgba(0,0,0,.08));}',
      r + ' .rs-scan-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 8px;}',
      r + ' .rs-scan-head h3{margin:0;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;}',
      r + ' .rs-scan-head h3 i{color:#FF4F00;}',
      r + ' .rs-scan-x{border:0;background:var(--stroke-2,rgba(0,0,0,.06));width:34px;height:34px;border-radius:10px;cursor:pointer;}',
      r + ' .rs-scan-sub{margin:0 16px 10px;font-size:12.5px;line-height:1.45;color:var(--text-soft,#6b6570);}',
      r + ' .rs-scan-vid-wrap{position:relative;margin:0 16px;border-radius:14px;overflow:hidden;background:#0c0b0a;aspect-ratio:4/3;}',
      r + ' .rs-scan-vid-wrap video,' + r + ' .rs-scan-vid-wrap canvas{width:100%;height:100%;object-fit:cover;display:block;}',
      r + ' .rs-scan-frame{position:absolute;inset:18% 16%;border:2px solid rgba(255,79,0,.85);border-radius:12px;box-shadow:0 0 0 999px rgba(0,0,0,.28);pointer-events:none;}',
      r + ' .rs-scan-status{padding:10px 16px;font-size:12.5px;font-weight:700;color:var(--text-soft,#6b6570);}',
      r + ' .rs-scan-manual{display:flex;gap:8px;padding:0 16px 12px;}',
      r + ' .rs-scan-manual input{flex:1;min-width:0;border:1px solid var(--stroke-2,rgba(0,0,0,.12));border-radius:10px;padding:10px 12px;font:inherit;}',
      r + ' .rs-scan-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px 14px;}',
      r + ' .rs-scan-actions .btn{width:100%;justify-content:center;}',
      r + ' .rs-scan-hit{margin:0 16px 12px;padding:10px 12px;border-radius:12px;background:rgba(255,79,0,.08);border:1px solid rgba(255,79,0,.18);font-size:13px;font-weight:700;display:none;}',
      r + ' .rs-scan-hit.on{display:block;}',
      r + ' .rs-scan-foot{padding:0 16px 16px;font-size:11.5px;color:var(--text-mute,#8a8490);line-height:1.4;}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function stopCamera() {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    if (streamRef) {
      try {
        streamRef.getTracks().forEach(function (t) {
          t.stop();
        });
      } catch (_) {}
      streamRef = null;
    }
  }

  function closeScanner() {
    stopCamera();
    var root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

  async function openTableInPosFromScan(parsed, opts) {
    opts = opts || {};
    var key = parsed.tableKey || normTableKey(parsed.table);
    var t = findFloorTable(key);
    if (!t) {
      t = { n: parsed.table, name: parsed.table, cap: 4, state: 'free' };
    }

    // Prefer Growth floor helpers (RS.openTableInPos)
    if (global.RS && typeof RS.openTableInPos === 'function') {
      await RS.openTableInPos(t, {
        seat: !!opts.seat,
        loadOrder: true,
        openQrSession: true,
        toast: 'Table ' + (t.n || parsed.table) + ' opened from staff scan',
        icon: 'fa-qrcode',
      });
      return;
    }

    if (global.RS && typeof RS.activateTab === 'function') {
      await RS.activateTab('pos-tab');
    }
    await new Promise(function (r) {
      setTimeout(r, 140);
    });
    if (global.RS && typeof RS.setTable === 'function') {
      try {
        RS.setTable(String(t.n || parsed.table));
      } catch (_) {}
    }
    toast('Table ' + (t.n || parsed.table) + ' ready on POS', 'fa-utensils');
  }

  function openWaiterKot(parsed) {
    var slug = parsed.tenant || currentTenantSlug();
    if (!slug) {
      toast('Outlet slug missing — open POS instead', 'fa-circle-exclamation');
      openTableInPosFromScan(parsed, { seat: false });
      return;
    }
    var url =
      guestOrderBaseUrl() +
      '/order.html?tenant=' +
      encodeURIComponent(slug) +
      '&table=' +
      encodeURIComponent(parsed.table) +
      '&mode=waiter';
    // Staff session already in this origin — open same-tab so tenant_session_token is shared
    location.href = url;
  }

  function showHit(root, parsed) {
    var hit = root.querySelector('[data-hit]');
    if (!hit) return;
    hit.classList.add('on');
    hit.innerHTML =
      '<i class="fa-solid fa-circle-check" style="color:#0F9F6E;margin-right:6px"></i>' +
      'Table <strong>' +
      esc(parsed.table) +
      '</strong> · choose staff action below';
    root._parsed = parsed;
  }

  async function handleDecoded(root, text) {
    var now = Date.now();
    if (text === lastHit && now - lastHitAt < 1800) return;
    lastHit = text;
    lastHitAt = now;
    var parsed = parseTableQrPayload(text);
    if (!parsed) {
      root.querySelector('[data-status]').textContent = 'Not a table QR — try again or type table #';
      return;
    }
    // Soft tenant mismatch warning
    var mySlug = currentTenantSlug();
    if (parsed.tenant && mySlug && String(parsed.tenant).toLowerCase() !== String(mySlug).toLowerCase()) {
      toast('QR is for another outlet (' + parsed.tenant + ')', 'fa-triangle-exclamation');
    }
    showHit(root, parsed);
    root.querySelector('[data-status]').textContent = 'Table ' + parsed.table + ' detected';
    try {
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (_) {}
  }

  function ensureJsQr() {
    return new Promise(function (resolve) {
      if (global.jsQR) return resolve(true);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      s.async = true;
      s.onload = function () { resolve(!!global.jsQR); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  async function startCamera(root) {
    var video = root.querySelector('video');
    var status = root.querySelector('[data-status]');
    if (!video) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = 'Camera not available — type table number below';
      return;
    }
    // Prefer rear camera; fall back to any camera (BlueStacks / desktop webcam)
    var attempts = [
      { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { audio: false, video: { facingMode: 'user' } },
      { audio: false, video: true },
    ];
    var opened = false;
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        streamRef = await navigator.mediaDevices.getUserMedia(attempts[i]);
        opened = true;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!opened) {
      console.warn('[StaffScan] camera', lastErr);
      var msg = 'Camera blocked — allow camera permission, then try again. Or type table # below.';
      if (lastErr && /NotAllowed|Permission/i.test(String(lastErr.name || lastErr.message || ''))) {
        msg = 'Camera permission denied. Allow Camera for RestroSuite in system settings, then reopen Scan.';
      } else if (lastErr && /NotFound|DevicesNotFound/i.test(String(lastErr.name || ''))) {
        msg = 'No camera found on this device. Type table number below.';
      }
      status.textContent = msg;
      return;
    }
    try {
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.muted = true;
      video.srcObject = streamRef;
      await video.play();
      status.textContent = 'Point at the table QR…';
    } catch (e) {
      console.warn('[StaffScan] video play', e);
      status.textContent = 'Camera opened but preview failed — type table # below';
      return;
    }

    await ensureJsQr();

    var detector = null;
    try {
      if (global.BarcodeDetector) {
        var formats = ['qr_code'];
        if (typeof BarcodeDetector.getSupportedFormats === 'function') {
          var supported = await BarcodeDetector.getSupportedFormats();
          if (supported && supported.indexOf('qr_code') >= 0) formats = ['qr_code'];
        }
        detector = new BarcodeDetector({ formats: formats });
      }
    } catch (_) {
      detector = null;
    }
    if (!detector && !global.jsQR) {
      status.textContent = 'Scanner library missing — type table # or paste QR link below';
    }

    var canvas = root.querySelector('canvas');
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d', { willReadFrequently: true }) : null;

    async function tick() {
      if (!document.getElementById(ROOT_ID)) return;
      try {
        if (detector && video.readyState >= 2) {
          var codes = await detector.detect(video);
          if (codes && codes[0] && codes[0].rawValue) {
            await handleDecoded(root, codes[0].rawValue);
          }
        } else if (ctx && video.readyState >= 2 && global.jsQR) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var code = global.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) await handleDecoded(root, code.data);
        }
      } catch (e) {
        /* ignore frame errors */
      }
      loopTimer = setTimeout(tick, detector ? 220 : 380);
    }
    tick();
  }

  function openScanner(opts) {
    opts = opts || {};
    ensureStyle();
    closeScanner();

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Scan table QR');
    root.innerHTML =
      '<div class="rs-scan-card">' +
      '<div class="rs-scan-head"><h3><i class="fa-solid fa-camera"></i> Staff table scan</h3>' +
      '<button type="button" class="rs-scan-x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<p class="rs-scan-sub">Guests scan this same QR with their <b>phone camera</b> to order. ' +
      'You must scan here so the system opens the <b>staff</b> workflow (POS / KOT).</p>' +
      '<div class="rs-scan-vid-wrap"><video playsinline muted autoplay></video><canvas style="display:none"></canvas>' +
      '<div class="rs-scan-frame" aria-hidden="true"></div></div>' +
      '<div class="rs-scan-status" data-status>Starting camera…</div>' +
      '<div class="rs-scan-hit" data-hit></div>' +
      '<div class="rs-scan-manual">' +
      '<input type="text" data-manual inputmode="text" autocomplete="off" placeholder="Or type table # / paste QR link">' +
      '<button type="button" class="btn btn-ghost" data-manual-go>Go</button></div>' +
      '<div class="rs-scan-actions">' +
      '<button type="button" class="btn btn-primary" data-act="pos"><i class="fa-solid fa-utensils"></i> Open POS</button>' +
      '<button type="button" class="btn btn-ghost" data-act="seat"><i class="fa-solid fa-chair"></i> Seat + open QR</button>' +
      '<button type="button" class="btn btn-ghost" data-act="kot"><i class="fa-solid fa-fire-burner"></i> Waiter KOT</button>' +
      '<button type="button" class="btn btn-ghost" data-act="hub"><i class="fa-solid fa-eye"></i> Guest preview</button>' +
      '</div>' +
      '<p class="rs-scan-foot">Guest keeps full control after you take the order: track, add more, amend pending items, call service, pay.</p>' +
      '</div>';

    document.body.appendChild(root);

    root.querySelector('[data-close]').onclick = closeScanner;
    root.addEventListener('click', function (e) {
      if (e.target === root) closeScanner();
    });

    function requireParsed() {
      if (root._parsed) return root._parsed;
      var manual = (root.querySelector('[data-manual]').value || '').trim();
      var p = parseTableQrPayload(manual);
      if (p) {
        showHit(root, p);
        return p;
      }
      toast('Scan a table QR or enter table number', 'fa-circle-exclamation');
      return null;
    }

    root.querySelector('[data-manual-go]').onclick = function () {
      var p = requireParsed();
      if (p) toast('Table ' + p.table + ' ready — pick an action', 'fa-qrcode');
    };
    root.querySelector('[data-manual]').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        root.querySelector('[data-manual-go]').click();
      }
    });

    root.querySelector('[data-act="pos"]').onclick = async function () {
      var p = requireParsed();
      if (!p) return;
      closeScanner();
      await openTableInPosFromScan(p, { seat: false });
    };
    root.querySelector('[data-act="seat"]').onclick = async function () {
      var p = requireParsed();
      if (!p) return;
      closeScanner();
      await openTableInPosFromScan(p, { seat: true });
    };
    root.querySelector('[data-act="kot"]').onclick = function () {
      var p = requireParsed();
      if (!p) return;
      closeScanner();
      openWaiterKot(p);
    };
    root.querySelector('[data-act="hub"]').onclick = function () {
      var p = requireParsed();
      if (!p) return;
      var slug = p.tenant || currentTenantSlug();
      var url =
        guestOrderBaseUrl() +
        '/qr-order.html?tenant=' +
        encodeURIComponent(slug) +
        '&table=' +
        encodeURIComponent(p.table) +
        '&hub=1';
      window.open(url, '_blank', 'noopener');
    };

    startCamera(root);
    if (typeof opts.onOpen === 'function') opts.onOpen();
  }

  global.RSStaffTableScanner = {
    open: openScanner,
    close: closeScanner,
    parse: parseTableQrPayload,
    normTableKey: normTableKey,
  };

  // Convenience global used by floor toolbar
  global.openStaffTableScanner = openScanner;
})(typeof window !== 'undefined' ? window : globalThis);
