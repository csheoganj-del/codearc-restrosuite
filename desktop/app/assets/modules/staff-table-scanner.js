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
  var frameN = 0;
  var autoActTimer = null;

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
      else if (
        text.indexOf('?') >= 0 ||
        text.indexOf('tenant=') >= 0 ||
        text.indexOf('table=') >= 0 ||
        text.indexOf('slug=') >= 0 ||
        text.indexOf('tbl=') >= 0
      ) {
        url = new URL(text, location.origin || 'https://restrosuite.codearc.co.in');
      }
      if (url) {
        tenant =
          url.searchParams.get('tenant') ||
          url.searchParams.get('outlet') ||
          url.searchParams.get('slug') ||
          '';
        // Prefer explicit table params — never treat bare "t=" as table when "tbl"/"table" exist
        table =
          url.searchParams.get('table') ||
          url.searchParams.get('table_number') ||
          url.searchParams.get('tableNumber') ||
          url.searchParams.get('tbl') ||
          url.searchParams.get('tableNo') ||
          '';
        // Only use short "t=" as table when it looks like a table id (digits), not a slug
        if (!table) {
          var tParam = url.searchParams.get('t') || '';
          if (/^\d{1,4}[A-Za-z]?$/.test(tParam) || /^table/i.test(tParam)) table = tParam;
          else if (!tenant && tParam) tenant = tParam;
        }
        token =
          url.searchParams.get('token') ||
          url.searchParams.get('session') ||
          url.searchParams.get('session_token') ||
          '';
        mode = url.searchParams.get('mode') || '';
        // Path forms: /order/table/5 , /t/5 , /qr-order.html already handled by query
        if (!table) {
          var m = url.pathname.match(/(?:table|t|tbl)\/([^/?#]+)/i);
          if (m) table = decodeURIComponent(m[1]);
        }
        // Hash routes: #/table/5
        if (!table && url.hash) {
          var mh = url.hash.match(/(?:table|t|tbl)[/=]([^&/?#]+)/i);
          if (mh) table = decodeURIComponent(mh[1]);
        }
      }
    } catch (_) {}

    // Plain table number typed by staff
    if (!table && /^\d{1,4}[A-Za-z]?$/.test(text)) {
      table = text;
    }
    // "Table 5" / "T-05" / "Table 01"
    if (!table) {
      var m2 = text.match(/(?:table|tbl|t)[\s#:.-]*([0-9]{1,4}[A-Za-z]?)/i);
      if (m2) table = m2[1];
    }
    // Last path segment if numeric: .../01
    if (!table) {
      var m3 = text.match(/\/(\d{1,4}[A-Za-z]?)(?:\?|#|$)/);
      if (m3) table = m3[1];
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
    // Always refresh styles so animation updates ship without hard reload issues
    var old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    var s = document.createElement('style');
    s.id = STYLE_ID;
    var r = '#' + ROOT_ID;
    s.textContent = [
      '@keyframes rs-scan-line{0%{top:8%;opacity:.35}8%{opacity:1}50%{top:88%;opacity:1}58%{opacity:.35}100%{top:8%;opacity:.35}}',
      '@keyframes rs-scan-pulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.02)}}',
      '@keyframes rs-scan-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}',
      '@keyframes rs-scan-glow{0%,100%{box-shadow:0 0 0 0 rgba(37,211,102,.0)}50%{box-shadow:0 0 18px 2px rgba(37,211,102,.35)}}',
      '@keyframes rs-scan-corners{0%,100%{border-color:rgba(37,211,102,.75)}50%{border-color:rgba(37,211,102,1)}}',
      r +
        '{position:fixed;inset:0;z-index:2147483601;display:flex;align-items:flex-end;justify-content:center;background:rgba(12,10,9,.62);backdrop-filter:blur(4px);padding:12px;}',
      r +
        ' .rs-scan-card{width:min(440px,100%);background:var(--panel,#fff);color:var(--text,#16151c);border-radius:20px 20px 14px 14px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;border:1px solid var(--stroke-2,rgba(0,0,0,.08));}',
      r + ' .rs-scan-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 8px;}',
      r + ' .rs-scan-head h3{margin:0;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;}',
      r + ' .rs-scan-head h3 i{color:#25D366;}',
      r + ' .rs-scan-x{border:0;background:var(--stroke-2,rgba(0,0,0,.06));width:34px;height:34px;border-radius:10px;cursor:pointer;}',
      r +
        ' .rs-scan-sub{margin:0 16px 10px;font-size:12.5px;line-height:1.45;color:var(--text-soft,#6b6570);}',
      r +
        ' .rs-scan-vid-wrap{position:relative;margin:0 16px;border-radius:14px;overflow:hidden;background:#0c0b0a;aspect-ratio:4/3;}',
      r + ' .rs-scan-vid-wrap video,' + r + ' .rs-scan-vid-wrap canvas{width:100%;height:100%;object-fit:cover;display:block;}',
      /* Dim outside the viewfinder */
      r +
        ' .rs-scan-mask{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 52% 48% at 50% 50%,transparent 58%,rgba(0,0,0,.55) 59%)}',
      /* WhatsApp-style square corners */
      r +
        ' .rs-scan-frame{position:absolute;inset:16% 14%;border:0;pointer-events:none;animation:rs-scan-corners 1.6s ease-in-out infinite;}',
      r +
        ' .rs-scan-frame:before,' +
        r +
        ' .rs-scan-frame:after,' +
        r +
        ' .rs-scan-frame i:before,' +
        r +
        ' .rs-scan-frame i:after{content:"";position:absolute;width:22px;height:22px;border-color:#25D366;border-style:solid;}',
      r + ' .rs-scan-frame:before{top:0;left:0;border-width:3px 0 0 3px;border-radius:6px 0 0 0;}',
      r + ' .rs-scan-frame:after{top:0;right:0;border-width:3px 3px 0 0;border-radius:0 6px 0 0;}',
      r + ' .rs-scan-frame i{position:absolute;inset:0;pointer-events:none;}',
      r + ' .rs-scan-frame i:before{bottom:0;left:0;top:auto;border-width:0 0 3px 3px;border-radius:0 0 0 6px;}',
      r + ' .rs-scan-frame i:after{bottom:0;right:0;top:auto;left:auto;border-width:0 3px 3px 0;border-radius:0 0 6px 0;}',
      /* Moving laser line */
      r +
        ' .rs-scan-laser{position:absolute;left:18%;right:18%;height:2px;border-radius:2px;pointer-events:none;background:linear-gradient(90deg,transparent,#25D366 20%,#fff 50%,#25D366 80%,transparent);box-shadow:0 0 12px 2px rgba(37,211,102,.85);animation:rs-scan-line 2.1s ease-in-out infinite;}',
      r +
        ' .rs-scan-laser:after{content:"";position:absolute;left:0;right:0;top:-14px;height:28px;background:linear-gradient(180deg,transparent,rgba(37,211,102,.22),transparent);}',
      /* State: found */
      r + ' .rs-scan-vid-wrap.is-found .rs-scan-laser{display:none;}',
      r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame{animation:none;filter:none;}',
      r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame:before,' +
        r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame:after,' +
        r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame i:before,' +
        r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame i:after{border-color:#0F9F6E;}',
      r + ' .rs-scan-vid-wrap.is-found{animation:rs-scan-glow 1s ease-in-out 2;}',
      r + ' .rs-scan-vid-wrap.is-idle .rs-scan-laser{animation-play-state:paused;opacity:.2;}',
      r +
        ' .rs-scan-vid-wrap.is-zooming .rs-scan-laser{background:linear-gradient(90deg,transparent,#38bdf8 20%,#fff 50%,#38bdf8 80%,transparent);box-shadow:0 0 14px 2px rgba(56,189,248,.9);animation-duration:1.2s;}',
      r +
        ' .rs-scan-vid-wrap video{transition:transform .35s ease;transform-origin:center center;}',
      r + ' .rs-scan-vid-wrap.is-zooming video{transform:scale(1.35);}',
      r + ' .rs-scan-vid-wrap.is-found video{transform:scale(1.12);}',
      /* Live status row with dots */
      r +
        ' .rs-scan-status{padding:10px 16px;font-size:13px;font-weight:800;color:var(--text-soft,#6b6570);display:flex;align-items:center;gap:10px;min-height:42px;}',
      r +
        ' .rs-scan-live{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(37,211,102,.12);color:#0F9F6E;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0;}',
      r +
        ' .rs-scan-live span{width:6px;height:6px;border-radius:50%;background:#25D366;animation:rs-scan-dot 1.2s ease-in-out infinite;}',
      r + ' .rs-scan-live span:nth-child(2){animation-delay:.15s;}',
      r + ' .rs-scan-live span:nth-child(3){animation-delay:.3s;}',
      r + ' .rs-scan-status.is-found{color:#0F9F6E;}',
      r + ' .rs-scan-status.is-found .rs-scan-live{background:rgba(15,159,110,.15);color:#0F9F6E;}',
      r + ' .rs-scan-status.is-found .rs-scan-live span{background:#0F9F6E;animation:none;}',
      r + ' .rs-scan-status.is-error{color:#b45309;}',
      r + ' .rs-scan-manual{display:flex;gap:8px;padding:0 16px 12px;}',
      r +
        ' .rs-scan-manual input{flex:1;min-width:0;border:1px solid var(--stroke-2,rgba(0,0,0,.12));border-radius:10px;padding:10px 12px;font:inherit;}',
      r + ' .rs-scan-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px 14px;}',
      r + ' .rs-scan-actions .btn{width:100%;justify-content:center;}',
      r +
        ' .rs-scan-hit{margin:0 16px 12px;padding:10px 12px;border-radius:12px;background:rgba(15,159,110,.1);border:1px solid rgba(15,159,110,.28);font-size:13px;font-weight:700;display:none;}',
      r + ' .rs-scan-hit.on{display:block;}',
      r + ' .rs-scan-foot{padding:0 16px 16px;font-size:11.5px;color:var(--text-mute,#8a8490);line-height:1.4;}',
      r + ' .rs-scan-auto{font-size:11px;font-weight:600;color:#0F9F6E;margin-top:4px;}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function setScanUiState(root, state, message) {
    if (!root) return;
    var wrap = root.querySelector('.rs-scan-vid-wrap');
    var status = root.querySelector('[data-status]');
    var live = root.querySelector('[data-live]');
    var label = root.querySelector('[data-status-text]');
    if (wrap) {
      wrap.classList.toggle('is-found', state === 'found');
      wrap.classList.toggle('is-idle', state === 'idle' || state === 'error');
      wrap.classList.toggle('is-zooming', state === 'zooming');
    }
    if (status) {
      status.classList.toggle('is-found', state === 'found');
      status.classList.toggle('is-error', state === 'error');
    }
    if (label && message != null) label.textContent = message;
    if (live) {
      live.hidden = false;
      if (state === 'scanning') {
        live.innerHTML = '<span></span><span></span><span></span> Scanning';
      } else if (state === 'zooming') {
        live.innerHTML = '<span></span><span></span><span></span> Auto-zoom';
      } else if (state === 'found') {
        live.innerHTML = '<i class="fa-solid fa-check" style="font-size:10px"></i> Locked';
      } else if (state === 'error') {
        live.innerHTML = 'Retry';
      } else {
        live.innerHTML = '<span></span><span></span><span></span> Ready';
      }
    }
  }

  function stopCamera() {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    if (autoActTimer) {
      clearTimeout(autoActTimer);
      autoActTimer = null;
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
      '</strong> detected' +
      '<div class="rs-scan-auto">Opening POS in a moment… or tap a button below</div>';
    root._parsed = parsed;
  }

  async function handleDecoded(root, text) {
    var now = Date.now();
    if (text === lastHit && now - lastHitAt < 2200) return;
    lastHit = text;
    lastHitAt = now;

    var parsed = parseTableQrPayload(text);
    if (!parsed) {
      setScanUiState(
        root,
        'scanning',
        'Got a code but not a table QR — paste link or type table #'
      );
      // Still surface raw payload so staff can paste/debug
      try {
        var manual = root.querySelector('[data-manual]');
        if (manual && text && text.length < 400) manual.value = text;
      } catch (_) {}
      return;
    }

    var mySlug = currentTenantSlug();
    if (
      parsed.tenant &&
      mySlug &&
      String(parsed.tenant).toLowerCase() !== String(mySlug).toLowerCase()
    ) {
      toast('QR is for another outlet (' + parsed.tenant + ')', 'fa-triangle-exclamation');
    }

    showHit(root, parsed);
    setScanUiState(root, 'found', 'Table ' + parsed.table + ' locked — opening POS…');
    try {
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    } catch (_) {}

    // Auto-open POS (Yono-style: detect → lock → act without extra taps)
    if (autoActTimer) clearTimeout(autoActTimer);
    autoActTimer = setTimeout(async function () {
      if (!document.getElementById(ROOT_ID) || !root._parsed) return;
      if (root._parsed.tableKey !== parsed.tableKey) return;
      try {
        closeScanner();
        await openTableInPosFromScan(parsed, { seat: false });
      } catch (e) {
        console.warn('[StaffScan] auto open POS failed', e);
        toast('Table detected — tap Open POS', 'fa-utensils');
      }
    }, 450);
  }

  function isIOS() {
    try {
      var ua = navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    } catch (_) {
      return false;
    }
  }

  function isSecureCameraContext() {
    try {
      if (location.protocol === 'https:') return true;
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
    } catch (_) {}
    return false;
  }

  function ensureJsQr() {
    return new Promise(function (resolve) {
      if (global.jsQR) return resolve(true);
      // Absolute-from-origin first (Safari caches / path quirks with relative)
      var origin = '';
      try {
        origin = location.origin || '';
      } catch (_) {}
      var sources = [
        origin + '/assets/lib/jsQR.min.js',
        'assets/lib/jsQR.min.js',
        '../assets/lib/jsQR.min.js',
        'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
        'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js',
      ];
      var i = 0;
      function tryNext() {
        if (i >= sources.length) {
          console.warn('[StaffScan] jsQR failed to load from all sources');
          return resolve(false);
        }
        var src = sources[i++];
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () {
          console.log('[StaffScan] jsQR loaded from', src);
          resolve(!!global.jsQR);
        };
        s.onerror = function () {
          console.warn('[StaffScan] jsQR load fail', src);
          tryNext();
        };
        document.head.appendChild(s);
      }
      tryNext();
    });
  }

  function waitForVideoReady(video, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      }, timeoutMs || 4000);
      function ok() {
        if (done) return;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          done = true;
          clearTimeout(t);
          resolve(true);
        }
      }
      video.addEventListener('loadedmetadata', ok);
      video.addEventListener('loadeddata', ok);
      video.addEventListener('playing', ok);
      // already ready?
      ok();
    });
  }

  async function startCamera(root) {
    var video = root.querySelector('video');
    if (!video) return;

    // Safari only allows camera on HTTPS (Yono app is native — different rules)
    if (!isSecureCameraContext()) {
      setScanUiState(
        root,
        'error',
        'Camera needs HTTPS. Open restrosuite.codearc.co.in (not http). Or type table #.'
      );
      return;
    }

    var gum =
      (navigator.mediaDevices && navigator.mediaDevices.getUserMedia
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        : null) ||
      navigator.webkitGetUserMedia ||
      navigator.getUserMedia;

    if (!gum && !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      setScanUiState(root, 'error', 'Camera API missing — type table number below');
      return;
    }

    var ios = isIOS();
    // iPhone Safari: advanced constraints often FAIL the whole open (Yono is native so works).
    // Use simplest constraints first on iOS.
    var attempts = ios
      ? [
          { audio: false, video: { facingMode: 'environment' } },
          { audio: false, video: true },
          { audio: false, video: { facingMode: 'user' } },
        ]
      : [
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          { audio: false, video: { facingMode: 'environment' } },
          { audio: false, video: { facingMode: 'user' } },
          { audio: false, video: true },
        ];

    var opened = false;
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          streamRef = await navigator.mediaDevices.getUserMedia(attempts[i]);
        } else {
          // Legacy callback API
          streamRef = await new Promise(function (res, rej) {
            gum.call(navigator, attempts[i], res, rej);
          });
        }
        opened = true;
        console.log('[StaffScan] camera ok with constraints', attempts[i]);
        break;
      } catch (e) {
        lastErr = e;
        console.warn('[StaffScan] camera try failed', attempts[i], e && (e.name || e.message));
      }
    }
    if (!opened) {
      console.warn('[StaffScan] camera', lastErr);
      var msg = 'Camera blocked — allow camera, then try again. Or type table # below.';
      if (lastErr && /NotAllowed|Permission/i.test(String(lastErr.name || lastErr.message || ''))) {
        msg =
          'Camera permission denied. Settings → Safari → Camera → Allow, then reopen Scan.';
      } else if (lastErr && /NotFound|DevicesNotFound/i.test(String(lastErr.name || ''))) {
        msg = 'No camera found. Type table number below.';
      } else if (lastErr && /NotReadable|TrackStart|Abort/i.test(String(lastErr.name || ''))) {
        msg = 'Camera busy (close other apps using camera), then try again.';
      }
      setScanUiState(root, 'error', msg);
      return;
    }

    // Optional hardware zoom — never required; skip soft-fail on iOS
    if (!ios) {
      try {
        var track = streamRef.getVideoTracks()[0];
        var caps = track.getCapabilities && track.getCapabilities();
        if (caps && caps.zoom) {
          root._camTrack = track;
          root._zoomCaps = caps.zoom;
        }
      } catch (_) {}
    }

    try {
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.setAttribute('muted', 'true');
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      // iOS: assign srcObject then play after metadata
      if ('srcObject' in video) {
        video.srcObject = streamRef;
      } else {
        video.src = URL.createObjectURL(streamRef);
      }
      var ready = await waitForVideoReady(video, 5000);
      try {
        await video.play();
      } catch (playErr) {
        // iOS sometimes needs a second play after metadata
        console.warn('[StaffScan] play retry', playErr);
        await new Promise(function (r) {
          setTimeout(r, 200);
        });
        await video.play();
      }
      if (!ready) {
        // Still try — some iOS builds report 0 size briefly
        await new Promise(function (r) {
          setTimeout(r, 300);
        });
      }
      setScanUiState(
        root,
        'scanning',
        ios
          ? 'Scanning… fill green box with QR (Safari)'
          : 'Point at table QR — works from a distance'
      );
    } catch (e) {
      console.warn('[StaffScan] video play', e);
      setScanUiState(root, 'error', 'Camera preview failed — type table # below');
      return;
    }

    // Load decoder BEFORE loop (critical on Safari)
    var hasJsQr = await ensureJsQr();
    if (!hasJsQr) {
      setScanUiState(
        root,
        'error',
        'QR decoder failed to load. Type table # (e.g. 5) and tap Go.'
      );
      // Keep camera on for preview; manual still works
    } else {
      setScanUiState(root, 'scanning', 'Scanning… hold QR in the green box');
    }

    // BarcodeDetector is NOT on iPhone Safari — don't rely on it
    var detector = null;
    if (!ios) {
      try {
        if (global.BarcodeDetector) {
          detector = new BarcodeDetector({ formats: ['qr_code'] });
        }
      } catch (_) {
        detector = null;
      }
    }

    var canvas = root.querySelector('canvas');
    // iOS Safari: display:none canvas can break drawImage — keep off-screen instead
    if (canvas) {
      canvas.style.cssText =
        'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      canvas.removeAttribute('hidden');
    }
    var ctx = null;
    if (canvas && canvas.getContext) {
      try {
        ctx = canvas.getContext('2d', { willReadFrequently: true });
      } catch (_) {
        ctx = null;
      }
      if (!ctx) {
        try {
          ctx = canvas.getContext('2d');
        } catch (_) {
          ctx = null;
        }
      }
    }

    // Fewer zoom steps on old iPhones (CPU) — still far + mid + close
    var zoomLevels = ios ? [1, 1.5, 2.2] : [1, 1.35, 1.75, 2.25, 2.8];
    var zoomIdx = 0;
    var missStreak = 0;

    function runJsQrOnImageData(img) {
      if (!global.jsQR || !img) return null;
      try {
        var code = global.jsQR(img.data, img.width, img.height, {
          inversionAttempts: 'attemptBoth',
        });
        return code && code.data ? code.data : null;
      } catch (_) {
        return null;
      }
    }

    function decodeWithJsQrMulti(digZoom) {
      if (!ctx || !global.jsQR) return null;
      if (video.readyState < 2) return null;
      var w = video.videoWidth || 0;
      var h = video.videoHeight || 0;
      // iOS: sometimes readyState is 4 but dimensions still 0 briefly
      if (w < 16 || h < 16) {
        w = video.clientWidth || 0;
        h = video.clientHeight || 0;
      }
      if (w < 32 || h < 32) return null;

      var z = Math.max(1, digZoom || 1);
      var cropW = Math.floor(w / z);
      var cropH = Math.floor(h / z);
      var sx = Math.floor((w - cropW) / 2);
      var sy = Math.floor((h - cropH) / 2);

      // iPhone 6s: one target size is faster and more reliable than 3
      var targets = ios ? [480] : z > 1.5 ? [640, 480] : [640, 480, 360];
      for (var ti = 0; ti < targets.length; ti++) {
        var maxW = targets[ti];
        var scale = cropW > maxW ? maxW / cropW : 1;
        var cw = Math.max(32, Math.floor(cropW * scale));
        var ch = Math.max(32, Math.floor(cropH * scale));
        try {
          canvas.width = cw;
          canvas.height = ch;
          ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cw, ch);
          var img = ctx.getImageData(0, 0, cw, ch);
          var hit = runJsQrOnImageData(img);
          if (hit) return hit;
        } catch (drawErr) {
          console.warn('[StaffScan] draw/decode', drawErr);
        }
      }
      return null;
    }

    async function tick() {
      if (!document.getElementById(ROOT_ID)) return;
      if (root._parsed) {
        loopTimer = setTimeout(tick, 500);
        return;
      }
      frameN++;
      try {
        var decoded = null;

        // Skip BarcodeDetector on iOS — not available / not needed
        if (detector && !ios && video.readyState >= 2) {
          try {
            var codes = await detector.detect(video);
            if (codes && codes[0] && codes[0].rawValue) decoded = codes[0].rawValue;
          } catch (_) {}
        }

        // Primary path: jsQR (works on Safari iOS when camera + canvas work)
        if (!decoded && global.jsQR) {
          decoded = decodeWithJsQrMulti(zoomLevels[zoomIdx] || 1);
        }

        // Cycle digital zoom if missing
        if (!decoded && global.jsQR && frameN % 2 === 0) {
          missStreak++;
          if (missStreak >= 2) {
            zoomIdx = (zoomIdx + 1) % zoomLevels.length;
            missStreak = 0;
            var z = zoomLevels[zoomIdx];
            if (z > 1.2) {
              setScanUiState(root, 'zooming', 'Auto-zoom ' + z.toFixed(1) + '× — hold steady');
            }
            decoded = decodeWithJsQrMulti(z);
          }
        }

        if (decoded) {
          zoomIdx = 0;
          missStreak = 0;
          await handleDecoded(root, decoded);
        } else if (frameN % 12 === 0) {
          var zLabel =
            zoomLevels[zoomIdx] > 1.05 ? ' · zoom ' + zoomLevels[zoomIdx].toFixed(1) + '×' : '';
          var dim =
            video.videoWidth > 0
              ? ''
              : ' · waiting for camera frame…';
          setScanUiState(
            root,
            zoomLevels[zoomIdx] > 1.2 ? 'zooming' : 'scanning',
            (global.jsQR ? 'Scanning' : 'No decoder') + zLabel + dim
          );
        }
      } catch (e) {
        if (frameN % 30 === 0) console.warn('[StaffScan] tick', e);
      }
      // iOS: slightly slower loop keeps UI smooth on 6s-class CPUs
      loopTimer = setTimeout(tick, ios ? 320 : 220);
    }
    tick();
  }

  /**
   * Decode QR from a still photo (iOS Safari-reliable).
   * Native UPI apps use the system camera kit; Safari's best equivalent is
   * capture=environment → full photo → jsQR (live stream is flaky on old iOS).
   */
  function decodeQrFromFile(file) {
    return new Promise(function (resolve) {
      if (!file) return resolve(null);
      ensureJsQr().then(function (ok) {
        if (!ok || !global.jsQR) return resolve(null);
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          try {
            var maxSide = 1400;
            var iw = img.naturalWidth || img.width;
            var ih = img.naturalHeight || img.height;
            var scale = Math.min(1, maxSide / Math.max(iw, ih));
            var cw = Math.max(32, Math.floor(iw * scale));
            var ch = Math.max(32, Math.floor(ih * scale));
            var c = document.createElement('canvas');
            c.width = cw;
            c.height = ch;
            var cx = c.getContext('2d');
            cx.drawImage(img, 0, 0, cw, ch);
            // Try full image + center crops (photo may have QR small in frame)
            var crops = [
              [0, 0, cw, ch],
              [cw * 0.15, ch * 0.15, cw * 0.7, ch * 0.7],
              [cw * 0.25, ch * 0.25, cw * 0.5, ch * 0.5],
            ];
            for (var i = 0; i < crops.length; i++) {
              var cr = crops[i];
              var c2 = document.createElement('canvas');
              var tw = Math.max(32, Math.floor(cr[2]));
              var th = Math.max(32, Math.floor(cr[3]));
              c2.width = Math.min(800, tw);
              c2.height = Math.min(800, th);
              var cx2 = c2.getContext('2d');
              cx2.drawImage(c, cr[0], cr[1], cr[2], cr[3], 0, 0, c2.width, c2.height);
              var data = cx2.getImageData(0, 0, c2.width, c2.height);
              var code = global.jsQR(data.data, data.width, data.height, {
                inversionAttempts: 'attemptBoth',
              });
              if (code && code.data) {
                URL.revokeObjectURL(url);
                return resolve(code.data);
              }
            }
          } catch (e) {
            console.warn('[StaffScan] photo decode', e);
          }
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    });
  }

  function openScanner(opts) {
    opts = opts || {};
    ensureStyle();
    closeScanner();
    lastHit = '';
    lastHitAt = 0;
    frameN = 0;

    var ios = isIOS();
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Scan table QR');
    root.innerHTML =
      '<div class="rs-scan-card">' +
      '<div class="rs-scan-head"><h3><i class="fa-solid fa-qrcode"></i> Staff table scan</h3>' +
      '<button type="button" class="rs-scan-x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<p class="rs-scan-sub">' +
      (ios
        ? '<b>iPhone tip:</b> use <b>Snap QR photo</b> (most reliable on Safari). Live view may also work. Same QR guests scan with their Camera app.'
        : 'Hold the printed table QR in the green box — auto-zoom + auto lock. Same QR guests use.') +
      '</p>' +
      // Photo capture — primary reliable path on iOS Safari
      '<div style="padding:0 16px 10px;display:flex;flex-direction:column;gap:8px">' +
      '<label class="btn btn-primary" style="display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;width:100%;box-sizing:border-box;padding:12px 14px;font-weight:800">' +
      '<i class="fa-solid fa-camera"></i> Snap QR photo (recommended)' +
      '<input type="file" accept="image/*" capture="environment" data-snap style="display:none">' +
      '</label>' +
      '<button type="button" class="btn btn-ghost" data-live-cam style="width:100%;justify-content:center">' +
      '<i class="fa-solid fa-video"></i> ' +
      (ios ? 'Try live camera scan' : 'Start live camera') +
      '</button>' +
      '</div>' +
      '<div class="rs-scan-vid-wrap" data-vid-box style="display:none">' +
      '<video playsinline webkit-playsinline muted autoplay></video>' +
      '<canvas aria-hidden="true"></canvas>' +
      '<div class="rs-scan-mask" aria-hidden="true"></div>' +
      '<div class="rs-scan-frame" aria-hidden="true"><i></i></div>' +
      '<div class="rs-scan-laser" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="rs-scan-status" data-status>' +
      '<span class="rs-scan-live" data-live><span></span><span></span><span></span> Ready</span>' +
      '<span data-status-text>' +
      (ios ? 'Tap “Snap QR photo” to open camera' : 'Starting…') +
      '</span>' +
      '</div>' +
      '<div class="rs-scan-hit" data-hit></div>' +
      '<div class="rs-scan-manual">' +
      '<input type="text" data-manual inputmode="numeric" autocomplete="off" placeholder="Or type table # (e.g. 5)">' +
      '<button type="button" class="btn btn-ghost" data-manual-go>Go</button></div>' +
      '<div class="rs-scan-actions">' +
      '<button type="button" class="btn btn-primary" data-act="pos"><i class="fa-solid fa-utensils"></i> Open POS</button>' +
      '<button type="button" class="btn btn-ghost" data-act="seat"><i class="fa-solid fa-chair"></i> Seat + open QR</button>' +
      '<button type="button" class="btn btn-ghost" data-act="kot"><i class="fa-solid fa-fire-burner"></i> Waiter KOT</button>' +
      '<button type="button" class="btn btn-ghost" data-act="hub"><i class="fa-solid fa-eye"></i> Guest preview</button>' +
      '</div>' +
      '<p class="rs-scan-foot">Yono uses a native camera. On Safari, <b>Snap QR photo</b> is the reliable path. ' +
      'Always works: type table number → Go → Open POS.</p>' +
      '</div>';

    document.body.appendChild(root);
    setScanUiState(root, 'idle', ios ? 'Tap “Snap QR photo” (best on iPhone)' : 'Ready');

    root.querySelector('[data-close]').onclick = closeScanner;
    root.addEventListener('click', function (e) {
      if (e.target === root) closeScanner();
    });

    // --- Photo capture (iOS-reliable) ---
    var snapInput = root.querySelector('[data-snap]');
    if (snapInput) {
      snapInput.addEventListener('change', async function () {
        var file = snapInput.files && snapInput.files[0];
        if (!file) return;
        setScanUiState(root, 'scanning', 'Reading photo…');
        var text = await decodeQrFromFile(file);
        snapInput.value = '';
        if (!text) {
          setScanUiState(
            root,
            'error',
            'No QR found in photo. Fill the frame with the code and retake, or type table #.'
          );
          toast('No QR in photo — retake closer or type table #', 'fa-circle-exclamation');
          return;
        }
        await handleDecoded(root, text);
      });
    }

    // --- Live camera (optional / secondary on iOS) ---
    var liveBtn = root.querySelector('[data-live-cam]');
    var vidBox = root.querySelector('[data-vid-box]');
    if (liveBtn) {
      liveBtn.onclick = function () {
        if (vidBox) vidBox.style.display = '';
        liveBtn.style.display = 'none';
        setScanUiState(root, 'scanning', 'Starting live camera…');
        startCamera(root);
      };
    }

    // Desktop / non-iOS: auto-start live camera
    if (!ios) {
      if (vidBox) vidBox.style.display = '';
      if (liveBtn) liveBtn.style.display = 'none';
      startCamera(root);
    }

    function requireParsed() {
      if (root._parsed) return root._parsed;
      var manual = (root.querySelector('[data-manual]').value || '').trim();
      var p = parseTableQrPayload(manual);
      if (p) {
        showHit(root, p);
        setScanUiState(root, 'found', 'Table ' + p.table + ' ready');
        return p;
      }
      toast('Scan a table QR or enter table number', 'fa-circle-exclamation');
      return null;
    }

    root.querySelector('[data-manual-go]').onclick = async function () {
      var p = requireParsed();
      if (!p) return;
      // On manual entry, open POS immediately (staff already typed the number)
      if (autoActTimer) {
        clearTimeout(autoActTimer);
        autoActTimer = null;
      }
      closeScanner();
      await openTableInPosFromScan(p, { seat: false });
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
      if (autoActTimer) {
        clearTimeout(autoActTimer);
        autoActTimer = null;
      }
      closeScanner();
      await openTableInPosFromScan(p, { seat: false });
    };
    root.querySelector('[data-act="seat"]').onclick = async function () {
      var p = requireParsed();
      if (!p) return;
      if (autoActTimer) {
        clearTimeout(autoActTimer);
        autoActTimer = null;
      }
      closeScanner();
      await openTableInPosFromScan(p, { seat: true });
    };
    root.querySelector('[data-act="kot"]').onclick = function () {
      var p = requireParsed();
      if (!p) return;
      if (autoActTimer) {
        clearTimeout(autoActTimer);
        autoActTimer = null;
      }
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

    if (typeof opts.onOpen === 'function') opts.onOpen();
  }

  global.RSStaffTableScanner = {
    open: openScanner,
    close: closeScanner,
    parse: parseTableQrPayload,
    normTableKey: normTableKey,
  };

  global.openStaffTableScanner = openScanner;
})(typeof window !== 'undefined' ? window : globalThis);
