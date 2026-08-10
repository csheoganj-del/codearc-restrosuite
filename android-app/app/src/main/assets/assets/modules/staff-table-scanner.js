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

  const STYLE_ID = 'rs-staff-scan-style';
  const ROOT_ID = 'rs-staff-scan-root';
  let streamRef = null;
  let loopTimer = null;
  let lastHit = '';
  let lastHitAt = 0;
  let frameN = 0;
  let autoActTimer = null;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon || 'fa-qrcode');}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normTableKey(raw) {
    let key = String(raw == null ? '' : raw)
      .trim()
      .toLowerCase();
    if (!key) {return '';}
    key = key.replace(/\btable\b|\btbl\b/g, '').replace(/[^a-z0-9]/g, '');
    if (/^t\d+$/.test(key)) {key = key.slice(1);}
    if (/^\d+$/.test(key)) {key = String(parseInt(key, 10));}
    return key;
  }

  function currentTenantSlug() {
    try {
      if (global.RS_API && typeof RS_API.session === 'function') {
        const s = RS_API.session() || {};
        if (s.slug || s.tenant_slug) {return String(s.slug || s.tenant_slug);}
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
    const text = String(raw || '').trim();
    if (!text) {return null;}

    let tenant = '';
    let table = '';
    let token = '';
    let mode = '';

    try {
      let url;
      if (/^https?:\/\//i.test(text)) {url = new URL(text);}
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
          const tParam = url.searchParams.get('t') || '';
          if (/^\d{1,4}[A-Za-z]?$/.test(tParam) || /^table/i.test(tParam)) {table = tParam;}
          else if (!tenant && tParam) {tenant = tParam;}
        }
        token =
          url.searchParams.get('token') ||
          url.searchParams.get('session') ||
          url.searchParams.get('session_token') ||
          '';
        mode = url.searchParams.get('mode') || '';
        // Path forms: /order/table/5 , /t/5 , /qr-order.html already handled by query
        if (!table) {
          const m = url.pathname.match(/(?:table|t|tbl)\/([^/?#]+)/i);
          if (m) {table = decodeURIComponent(m[1]);}
        }
        // Hash routes: #/table/5
        if (!table && url.hash) {
          const mh = url.hash.match(/(?:table|t|tbl)[/=]([^&/?#]+)/i);
          if (mh) {table = decodeURIComponent(mh[1]);}
        }
      }
    } catch (_) {}

    // Plain table number typed by staff
    if (!table && /^\d{1,4}[A-Za-z]?$/.test(text)) {
      table = text;
    }
    // "Table 5" / "T-05" / "Table 01"
    if (!table) {
      const m2 = text.match(/(?:table|tbl|t)[\s#:.-]*([0-9]{1,4}[A-Za-z]?)/i);
      if (m2) {table = m2[1];}
    }
    // Last path segment if numeric: .../01
    if (!table) {
      const m3 = text.match(/\/(\d{1,4}[A-Za-z]?)(?:\?|#|$)/);
      if (m3) {table = m3[1];}
    }

    if (!table) {return null;}
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
    const list =
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
      const settings = global.RS_SETTINGS || {};
      if (settings.set_public_order_base) {return String(settings.set_public_order_base).replace(/\/$/, '');}
    } catch (_) {}
    const h = (location.hostname || '').toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1') {return 'https://restrosuite.codearc.co.in';}
    return location.origin;
  }

  function ensureStyle() {
    // Always refresh styles so animation updates ship without hard reload issues
    const old = document.getElementById(STYLE_ID);
    if (old) {old.remove();}
    const s = document.createElement('style');
    s.id = STYLE_ID;
    const r = '#' + ROOT_ID;
    s.textContent = [
      '@keyframes rs-scan-line{0%{top:12%;opacity:.4}12%{opacity:1}50%{top:86%;opacity:1}62%{opacity:.4}100%{top:12%;opacity:.4}}',
      '@keyframes rs-scan-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}',
      '@keyframes rs-scan-glow{0%,100%{box-shadow:inset 0 0 0 0 rgba(37,211,102,0)}50%{box-shadow:inset 0 0 0 3px rgba(37,211,102,.55)}}',
      '@keyframes rs-scan-corners{0%,100%{opacity:.85}50%{opacity:1}}',
      r +
        '{position:fixed;inset:0;z-index:2147483601;display:flex;align-items:center;justify-content:center;background:rgba(8,7,10,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:16px;box-sizing:border-box;}',
      r +
        ' .rs-scan-card{width:min(400px,100%);max-height:min(92dvh,720px);display:flex;flex-direction:column;background:#111114;color:#f4f2f0;border-radius:22px;box-shadow:0 28px 80px rgba(0,0,0,.55);overflow:hidden;border:1px solid rgba(255,255,255,.08);}',
      r +
        ' .rs-scan-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 10px;flex-shrink:0;}',
      r +
        ' .rs-scan-head h3{margin:0;font-size:15px;font-weight:800;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;color:#fff;}',
      r + ' .rs-scan-head h3 i{color:#25D366;font-size:15px;}',
      r +
        ' .rs-scan-x{border:0;background:rgba(255,255,255,.1);color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;display:grid;place-items:center;flex-shrink:0;}',
      r + ' .rs-scan-x:hover{background:rgba(255,255,255,.16);}',
      r +
        ' .rs-scan-vid-wrap{position:relative;margin:0 14px;border-radius:16px;overflow:hidden;background:#000;aspect-ratio:1;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);}',
      r + ' .rs-scan-vid-wrap video{width:100%;height:100%;object-fit:cover;display:block;background:#000;}',
      r + ' .rs-scan-vid-wrap canvas{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}',
      /* Soft vignette — NOT a solid oval hole */
      r +
        ' .rs-scan-mask{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 50%,transparent 42%,rgba(0,0,0,.28) 68%,rgba(0,0,0,.5) 100%);}',
      /* Square viewfinder corners (WhatsApp / UPI style) */
      r +
        ' .rs-scan-frame{position:absolute;inset:14%;border:0;pointer-events:none;animation:rs-scan-corners 1.8s ease-in-out infinite;}',
      r +
        ' .rs-scan-frame:before,' +
        r +
        ' .rs-scan-frame:after,' +
        r +
        ' .rs-scan-frame i:before,' +
        r +
        ' .rs-scan-frame i:after{content:"";position:absolute;width:26px;height:26px;border-color:#25D366;border-style:solid;filter:drop-shadow(0 0 4px rgba(37,211,102,.5));}',
      r + ' .rs-scan-frame:before{top:0;left:0;border-width:3.5px 0 0 3.5px;border-radius:8px 0 0 0;}',
      r + ' .rs-scan-frame:after{top:0;right:0;border-width:3.5px 3.5px 0 0;border-radius:0 8px 0 0;}',
      r + ' .rs-scan-frame i{position:absolute;inset:0;pointer-events:none;}',
      r + ' .rs-scan-frame i:before{bottom:0;left:0;top:auto;border-width:0 0 3.5px 3.5px;border-radius:0 0 0 8px;}',
      r + ' .rs-scan-frame i:after{bottom:0;right:0;top:auto;left:auto;border-width:0 3.5px 3.5px 0;border-radius:0 0 8px 0;}',
      r +
        ' .rs-scan-laser{position:absolute;left:18%;right:18%;height:2px;border-radius:2px;pointer-events:none;background:linear-gradient(90deg,transparent,#25D366 18%,#fff 50%,#25D366 82%,transparent);box-shadow:0 0 14px 3px rgba(37,211,102,.75);animation:rs-scan-line 2s ease-in-out infinite;}',
      r +
        ' .rs-scan-laser:after{content:"";position:absolute;left:0;right:0;top:-16px;height:32px;background:linear-gradient(180deg,transparent,rgba(37,211,102,.2),transparent);}',
      /* Placeholder when camera off / loading */
      r +
        ' .rs-scan-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:linear-gradient(160deg,#1a1a1f 0%,#0c0c0e 100%);color:rgba(255,255,255,.55);font-size:13px;font-weight:600;text-align:center;padding:24px;z-index:1;}',
      r + ' .rs-scan-placeholder i{font-size:36px;color:rgba(37,211,102,.55);margin-bottom:4px;}',
      r + ' .rs-scan-vid-wrap.is-live .rs-scan-placeholder{display:none;}',
      r + ' .rs-scan-vid-wrap.is-found .rs-scan-laser{display:none;}',
      r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame:before,' +
        r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame:after,' +
        r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame i:before,' +
        r +
        ' .rs-scan-vid-wrap.is-found .rs-scan-frame i:after{border-color:#34d399;}',
      r + ' .rs-scan-vid-wrap.is-found{animation:rs-scan-glow .9s ease-in-out 2;}',
      r + ' .rs-scan-vid-wrap.is-idle .rs-scan-laser{animation-play-state:paused;opacity:.15;}',
      r +
        ' .rs-scan-vid-wrap.is-zooming .rs-scan-laser{background:linear-gradient(90deg,transparent,#38bdf8 18%,#fff 50%,#38bdf8 82%,transparent);box-shadow:0 0 14px 3px rgba(56,189,248,.8);animation-duration:1.15s;}',
      r + ' .rs-scan-vid-wrap video{transition:transform .35s ease;transform-origin:center center;}',
      r + ' .rs-scan-vid-wrap.is-zooming video{transform:scale(1.35);}',
      r + ' .rs-scan-vid-wrap.is-found video{transform:scale(1.1);}',
      /* Bottom sheet body */
      r + ' .rs-scan-body{flex:1;min-height:0;overflow-y:auto;padding:10px 16px 14px;display:flex;flex-direction:column;gap:8px;}',
      r +
        ' .rs-scan-status{font-size:13.5px;font-weight:700;color:rgba(255,255,255,.78);display:flex;align-items:center;gap:10px;min-height:28px;}',
      r +
        ' .rs-scan-live{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:rgba(37,211,102,.14);color:#34d399;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0;}',
      r +
        ' .rs-scan-live span{width:5px;height:5px;border-radius:50%;background:#25D366;animation:rs-scan-dot 1.2s ease-in-out infinite;}',
      r + ' .rs-scan-live span:nth-child(2){animation-delay:.15s;}',
      r + ' .rs-scan-live span:nth-child(3){animation-delay:.3s;}',
      r + ' .rs-scan-status.is-found{color:#34d399;}',
      r + ' .rs-scan-status.is-error{color:#fbbf24;}',
      /* Floating tools on camera (calm, not a control panel) */
      r +
        ' .rs-scan-float{position:absolute;left:10px;right:10px;bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;z-index:3;pointer-events:none;}',
      r +
        ' .rs-scan-float label,' +
        r +
        ' .rs-scan-float button{pointer-events:auto;border:0;border-radius:999px;padding:10px 14px;font:inherit;font-weight:800;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 6px 20px rgba(0,0,0,.35);}',
      r +
        ' .rs-scan-float .btn-snap{background:rgba(37,211,102,.95);color:#062816;}',
      r +
        ' .rs-scan-float .btn-live{background:rgba(20,20,24,.72);color:#fff;border:1px solid rgba(255,255,255,.14);}',
      r +
        ' .rs-scan-hit{padding:12px 14px;border-radius:14px;background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.35);font-size:13.5px;font-weight:700;color:#d1fae5;display:none;}',
      r + ' .rs-scan-hit.on{display:block;}',
      r + ' .rs-scan-auto{font-size:12px;font-weight:700;color:#6ee7b7;margin-top:4px;}',
      r +
        ' .rs-scan-primary{display:none;width:100%;border:0;border-radius:14px;padding:14px 12px;font:inherit;font-weight:800;font-size:14.5px;cursor:pointer;background:#25D366;color:#062816;align-items:center;justify-content:center;gap:8px;}',
      r + ' .rs-scan-primary.on{display:inline-flex;}',
      r + ' .rs-scan-primary:hover{filter:brightness(1.05);}',
      /* Quiet fallbacks — collapsed by default */
      r +
        ' .rs-scan-links{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;}',
      r +
        ' .rs-scan-links button{border:0;background:transparent;color:rgba(255,255,255,.55);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:6px 8px;border-radius:8px;}',
      r + ' .rs-scan-links button:hover{color:#fff;background:rgba(255,255,255,.06);}',
      r + ' .rs-scan-links button[aria-expanded="true"]{color:#6ee7b7;}',
      r + ' .rs-scan-links .dot{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.25);}',
      r +
        ' .rs-scan-panel{display:none;flex-direction:column;gap:8px;padding:10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);}',
      r + ' .rs-scan-panel.on{display:flex;}',
      r + ' .rs-scan-manual{display:flex;gap:8px;}',
      r +
        ' .rs-scan-manual input{flex:1;min-width:0;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:12px;padding:11px 12px;font:inherit;font-size:14px;}',
      r + ' .rs-scan-manual input::placeholder{color:rgba(255,255,255,.4);}',
      r +
        ' .rs-scan-manual .btn-go{border:0;background:#25D366;color:#062816;border-radius:12px;padding:0 18px;font-weight:800;cursor:pointer;flex-shrink:0;}',
      r +
        ' .rs-scan-more-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}',
      r +
        ' .rs-scan-more-grid button{width:100%;justify-content:center;border-radius:12px;padding:12px 6px;font-weight:700;font-size:11.5px;cursor:pointer;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;display:inline-flex;flex-direction:column;align-items:center;gap:6px;}',
      r + ' .rs-scan-more-grid button i{font-size:15px;opacity:.9;}',
      r + ' .rs-scan-more-grid button:hover{background:rgba(255,255,255,.1);}',
      r +
        ' .rs-scan-foot{margin:2px 0 0;font-size:11px;color:rgba(255,255,255,.38);line-height:1.4;text-align:center;}',
      '@media (max-height:640px){' +
        r +
        ' .rs-scan-vid-wrap{aspect-ratio:4/3;max-height:42dvh;}' +
        r +
        ' .rs-scan-more-grid{grid-template-columns:1fr 1fr;}}',
      '@media (max-width:380px){' +
        r +
        ' .rs-scan-float label span.rs-scan-lbl,' +
        r +
        ' .rs-scan-float button span.rs-scan-lbl{display:none;}}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function setScanUiState(root, state, message) {
    if (!root) {return;}
    const wrap = root.querySelector('.rs-scan-vid-wrap');
    const status = root.querySelector('[data-status]');
    const live = root.querySelector('[data-live]');
    const label = root.querySelector('[data-status-text]');
    const phText = root.querySelector('[data-ph-text]');
    if (wrap) {
      wrap.classList.toggle('is-found', state === 'found');
      wrap.classList.toggle('is-idle', state === 'idle' || state === 'error');
      wrap.classList.toggle('is-zooming', state === 'zooming');
      if (state === 'scanning' || state === 'zooming' || state === 'found') {
        wrap.classList.add('is-live');
      }
      if (state === 'error' || state === 'idle') {
        // keep is-live if video already playing
        const v = wrap.querySelector('video');
        if (!v || !v.srcObject || v.readyState < 2) {wrap.classList.remove('is-live');}
      }
    }
    if (status) {
      status.classList.toggle('is-found', state === 'found');
      status.classList.toggle('is-error', state === 'error');
    }
    if (label && message != null) {label.textContent = message;}
    if (phText && message && (state === 'error' || state === 'idle')) {
      phText.textContent = message;
    }
    if (live) {
      live.hidden = false;
      if (state === 'scanning') {
        live.innerHTML = '<span></span><span></span><span></span> Scanning';
      } else if (state === 'zooming') {
        live.innerHTML = '<span></span><span></span><span></span> Zoom';
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
    const root = document.getElementById(ROOT_ID);
    if (root) {root.remove();}
  }

  async function openTableInPosFromScan(parsed, opts) {
    opts = opts || {};
    const key = parsed.tableKey || normTableKey(parsed.table);
    let t = findFloorTable(key);
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
    const slug = parsed.tenant || currentTenantSlug();
    if (!slug) {
      toast('Outlet slug missing — open POS instead', 'fa-circle-exclamation');
      openTableInPosFromScan(parsed, { seat: false });
      return;
    }
    const url =
      guestOrderBaseUrl() +
      '/order.html?tenant=' +
      encodeURIComponent(slug) +
      '&table=' +
      encodeURIComponent(parsed.table) +
      '&mode=waiter';
    location.href = url;
  }

  function showHit(root, parsed) {
    const hit = root.querySelector('[data-hit]');
    if (!hit) {return;}
    hit.classList.add('on');
    hit.innerHTML =
      '<i class="fa-solid fa-circle-check" style="color:#0F9F6E;margin-right:6px"></i>' +
      'Table <strong>' +
      esc(parsed.table) +
      '</strong> locked' +
      '<div class="rs-scan-auto">Opening POS…</div>';
    root._parsed = parsed;
    try {
      if (typeof root._showPrimaryPos === 'function') {root._showPrimaryPos(true);}
    } catch (_) {}
  }

  async function handleDecoded(root, text) {
    const now = Date.now();
    if (text === lastHit && now - lastHitAt < 2200) {return;}
    lastHit = text;
    lastHitAt = now;

    const parsed = parseTableQrPayload(text);
    if (!parsed) {
      setScanUiState(
        root,
        'scanning',
        'Got a code but not a table QR — paste link or type table #'
      );
      // Still surface raw payload so staff can paste/debug
      try {
        const manual = root.querySelector('[data-manual]');
        if (manual && text && text.length < 400) {manual.value = text;}
      } catch (_) {}
      return;
    }

    const mySlug = currentTenantSlug();
    if (
      parsed.tenant &&
      mySlug &&
      String(parsed.tenant).toLowerCase() !== String(mySlug).toLowerCase()
    ) {
      toast('QR is for another outlet (' + parsed.tenant + ')', 'fa-triangle-exclamation');
    }

    showHit(root, parsed);
    setScanUiState(root, 'found', 'Table ' + parsed.table + ' · opening POS…');
    try {
      if (navigator.vibrate) {navigator.vibrate([40, 40, 40]);}
    } catch (_) {}

    // Auto-open POS (calm path: detect → lock → act)
    if (autoActTimer) {clearTimeout(autoActTimer);}
    autoActTimer = setTimeout(async function () {
      if (!document.getElementById(ROOT_ID) || !root._parsed) {return;}
      if (root._parsed.tableKey !== parsed.tableKey) {return;}
      try {
        closeScanner();
        await openTableInPosFromScan(parsed, { seat: false });
      } catch (e) {
        console.warn('[StaffScan] auto open POS failed', e);
        toast('Table locked — tap Open POS now', 'fa-utensils');
        try {
          if (typeof root._showPrimaryPos === 'function') {root._showPrimaryPos(true);}
        } catch (_) {}
      }
    }, 420);
  }

  function isIOS() {
    try {
      const ua = navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    } catch (_) {
      return false;
    }
  }

  function isSecureCameraContext() {
    try {
      if (location.protocol === 'https:') {return true;}
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {return true;}
    } catch (_) {}
    return false;
  }

  function ensureJsQr() {
    return new Promise(function (resolve) {
      if (global.jsQR) { resolve(true); return; }
      // Absolute-from-origin first (Safari caches / path quirks with relative)
      let origin = '';
      try {
        origin = location.origin || '';
      } catch (_) {}
      const sources = [
        origin + '/assets/lib/jsQR.min.js',
        'assets/lib/jsQR.min.js',
        '../assets/lib/jsQR.min.js',
        'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
        'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js',
      ];
      let i = 0;
      function tryNext() {
        if (i >= sources.length) {
          console.warn('[StaffScan] jsQR failed to load from all sources');
          return resolve(false);
        }
        const src = sources[i++];
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () {
          console.info('[StaffScan] jsQR loaded from', src);
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
      let done = false;
      const t = setTimeout(function () {
        if (done) {return;}
        done = true;
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      }, timeoutMs || 4000);
      function ok() {
        if (done) {return;}
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
    const video = root.querySelector('video');
    if (!video) {return;}

    // Safari only allows camera on HTTPS (Yono app is native — different rules)
    if (!isSecureCameraContext()) {
      setScanUiState(
        root,
        'error',
        'Camera needs HTTPS. Open restrosuite.codearc.co.in (not http). Or type table #.'
      );
      return;
    }

    const gum =
      (navigator.mediaDevices && navigator.mediaDevices.getUserMedia
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        : null) ||
      navigator.webkitGetUserMedia ||
      navigator.getUserMedia;

    if (!gum && !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      setScanUiState(root, 'error', 'Camera API missing — type table number below');
      return;
    }

    const ios = isIOS();
    // iPhone Safari: advanced constraints often FAIL the whole open (Yono is native so works).
    // Use simplest constraints first on iOS.
    const attempts = ios
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

    let opened = false;
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
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
        console.info('[StaffScan] camera ok with constraints', attempts[i]);
        break;
      } catch (e) {
        lastErr = e;
        console.warn('[StaffScan] camera try failed', attempts[i], e && (e.name || e.message));
      }
    }
    if (!opened) {
      console.warn('[StaffScan] camera', lastErr);
      let msg = 'Camera blocked — allow camera, then try again. Or type table # below.';
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
        const track = streamRef.getVideoTracks()[0];
        const caps = track.getCapabilities && track.getCapabilities();
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
      const ready = await waitForVideoReady(video, 5000);
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
      const wrapOk = root.querySelector('.rs-scan-vid-wrap');
      if (wrapOk) {wrapOk.classList.add('is-live');}
      setScanUiState(
        root,
        'scanning',
        'Point at table QR'
      );
    } catch (e) {
      console.warn('[StaffScan] video play', e);
      setScanUiState(root, 'error', 'Camera preview failed — use Snap photo or type table #');
      return;
    }

    // Load decoder BEFORE loop (critical on Safari)
    const hasJsQr = await ensureJsQr();
    if (!hasJsQr) {
      setScanUiState(
        root,
        'error',
        'QR decoder failed to load. Snap a photo or type table #.'
      );
      // Keep camera on for preview; manual still works
    } else {
      setScanUiState(root, 'scanning', 'Point at table QR');
    }

    // BarcodeDetector is NOT on iPhone Safari — don't rely on it
    let detector = null;
    if (!ios) {
      try {
        if (global.BarcodeDetector) {
          detector = new BarcodeDetector({ formats: ['qr_code'] });
        }
      } catch (_) {
        detector = null;
      }
    }

    const canvas = root.querySelector('canvas');
    // iOS Safari: display:none canvas can break drawImage — keep off-screen instead
    if (canvas) {
      canvas.style.cssText =
        'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      canvas.removeAttribute('hidden');
    }
    let ctx = null;
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
    const zoomLevels = ios ? [1, 1.5, 2.2] : [1, 1.35, 1.75, 2.25, 2.8];
    let zoomIdx = 0;
    let missStreak = 0;

    function runJsQrOnImageData(img) {
      if (!global.jsQR || !img) {return null;}
      try {
        const code = global.jsQR(img.data, img.width, img.height, {
          inversionAttempts: 'attemptBoth',
        });
        return code && code.data ? code.data : null;
      } catch (_) {
        return null;
      }
    }

    function decodeWithJsQrMulti(digZoom) {
      if (!ctx || !global.jsQR) {return null;}
      if (video.readyState < 2) {return null;}
      let w = video.videoWidth || 0;
      let h = video.videoHeight || 0;
      // iOS: sometimes readyState is 4 but dimensions still 0 briefly
      if (w < 16 || h < 16) {
        w = video.clientWidth || 0;
        h = video.clientHeight || 0;
      }
      if (w < 32 || h < 32) {return null;}

      const z = Math.max(1, digZoom || 1);
      const cropW = Math.floor(w / z);
      const cropH = Math.floor(h / z);
      const sx = Math.floor((w - cropW) / 2);
      const sy = Math.floor((h - cropH) / 2);

      // iPhone 6s: one target size is faster and more reliable than 3
      const targets = ios ? [480] : z > 1.5 ? [640, 480] : [640, 480, 360];
      for (let ti = 0; ti < targets.length; ti++) {
        const maxW = targets[ti];
        const scale = cropW > maxW ? maxW / cropW : 1;
        const cw = Math.max(32, Math.floor(cropW * scale));
        const ch = Math.max(32, Math.floor(cropH * scale));
        try {
          canvas.width = cw;
          canvas.height = ch;
          ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cw, ch);
          const img = ctx.getImageData(0, 0, cw, ch);
          const hit = runJsQrOnImageData(img);
          if (hit) {return hit;}
        } catch (drawErr) {
          console.warn('[StaffScan] draw/decode', drawErr);
        }
      }
      return null;
    }

    async function tick() {
      if (!document.getElementById(ROOT_ID)) {return;}
      if (root._parsed) {
        loopTimer = setTimeout(tick, 500);
        return;
      }
      frameN++;
      try {
        let decoded = null;

        // Skip BarcodeDetector on iOS — not available / not needed
        if (detector && !ios && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes && codes[0] && codes[0].rawValue) {decoded = codes[0].rawValue;}
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
            const z = zoomLevels[zoomIdx];
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
          const zLabel =
            zoomLevels[zoomIdx] > 1.05 ? ' · zoom ' + zoomLevels[zoomIdx].toFixed(1) + '×' : '';
          const dim =
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
        if (frameN % 30 === 0) {console.warn('[StaffScan] tick', e);}
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
      if (!file) { resolve(null); return; }
      ensureJsQr().then(function (ok) {
        if (!ok || !global.jsQR) {return resolve(null);}
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
          try {
            const maxSide = 1400;
            const iw = img.naturalWidth || img.width;
            const ih = img.naturalHeight || img.height;
            const scale = Math.min(1, maxSide / Math.max(iw, ih));
            const cw = Math.max(32, Math.floor(iw * scale));
            const ch = Math.max(32, Math.floor(ih * scale));
            const c = document.createElement('canvas');
            c.width = cw;
            c.height = ch;
            const cx = c.getContext('2d');
            cx.drawImage(img, 0, 0, cw, ch);
            // Try full image + center crops (photo may have QR small in frame)
            const crops = [
              [0, 0, cw, ch],
              [cw * 0.15, ch * 0.15, cw * 0.7, ch * 0.7],
              [cw * 0.25, ch * 0.25, cw * 0.5, ch * 0.5],
            ];
            for (let i = 0; i < crops.length; i++) {
              const cr = crops[i];
              const c2 = document.createElement('canvas');
              const tw = Math.max(32, Math.floor(cr[2]));
              const th = Math.max(32, Math.floor(cr[3]));
              c2.width = Math.min(800, tw);
              c2.height = Math.min(800, th);
              const cx2 = c2.getContext('2d');
              cx2.drawImage(c, cr[0], cr[1], cr[2], cr[3], 0, 0, c2.width, c2.height);
              const data = cx2.getImageData(0, 0, c2.width, c2.height);
              const code = global.jsQR(data.data, data.width, data.height, {
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

    const ios = isIOS();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Scan table QR');
    root.innerHTML =
      '<div class="rs-scan-card">' +
      '<div class="rs-scan-head">' +
      '<h3><i class="fa-solid fa-qrcode"></i> Scan table</h3>' +
      '<button type="button" class="rs-scan-x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      // Big viewfinder — primary UI
      '<div class="rs-scan-vid-wrap is-idle" data-vid-box>' +
      '<video playsinline webkit-playsinline muted autoplay></video>' +
      '<canvas aria-hidden="true"></canvas>' +
      '<div class="rs-scan-placeholder" data-placeholder>' +
      '<i class="fa-solid fa-camera"></i>' +
      '<div data-ph-text>' +
      (ios ? 'Point camera at table QR' : 'Point at table QR') +
      '</div>' +
      '</div>' +
      '<div class="rs-scan-mask" aria-hidden="true"></div>' +
      '<div class="rs-scan-frame" aria-hidden="true"><i></i></div>' +
      '<div class="rs-scan-laser" aria-hidden="true"></div>' +
      '<div class="rs-scan-float">' +
      '<label class="btn-snap" title="Snap photo of QR">' +
      '<i class="fa-solid fa-camera"></i><span class="rs-scan-lbl">Snap</span>' +
      '<input type="file" accept="image/*" capture="environment" data-snap style="display:none">' +
      '</label>' +
      '<button type="button" class="btn-live" data-live-cam title="Restart camera">' +
      '<i class="fa-solid fa-rotate-right"></i><span class="rs-scan-lbl">' +
      (ios ? 'Live' : 'Retry') +
      '</span></button>' +
      '</div>' +
      '</div>' +
      '<div class="rs-scan-body">' +
      '<div class="rs-scan-status" data-status>' +
      '<span class="rs-scan-live" data-live><span></span><span></span><span></span> Ready</span>' +
      '<span data-status-text>Point at table QR</span>' +
      '</div>' +
      '<div class="rs-scan-hit" data-hit></div>' +
      '<button type="button" class="rs-scan-primary" data-act="pos">' +
      '<i class="fa-solid fa-utensils"></i> Open POS now' +
      '</button>' +
      '<div class="rs-scan-links">' +
      '<button type="button" data-toggle-manual aria-expanded="false">Type table #</button>' +
      '<span class="dot" aria-hidden="true"></span>' +
      '<button type="button" data-toggle-more aria-expanded="false">More</button>' +
      '</div>' +
      '<div class="rs-scan-panel" data-panel-manual>' +
      '<div class="rs-scan-manual">' +
      '<input type="text" data-manual inputmode="numeric" autocomplete="off" placeholder="e.g. 5 or T2" aria-label="Table number">' +
      '<button type="button" class="btn-go" data-manual-go>Go</button>' +
      '</div>' +
      '</div>' +
      '<div class="rs-scan-panel" data-panel-more>' +
      '<div class="rs-scan-more-grid">' +
      '<button type="button" data-act="seat"><i class="fa-solid fa-chair"></i> Seat + QR</button>' +
      '<button type="button" data-act="kot"><i class="fa-solid fa-fire-burner"></i> Waiter KOT</button>' +
      '<button type="button" data-act="hub"><i class="fa-solid fa-eye"></i> Guest view</button>' +
      '</div>' +
      '</div>' +
      '<p class="rs-scan-foot">Locks automatically → opens POS. Same QR guests use.</p>' +
      '</div></div>';

    document.body.appendChild(root);
    setScanUiState(root, 'idle', ios ? 'Point camera at table QR' : 'Point at table QR');

    root.querySelector('[data-close]').onclick = closeScanner;
    root.addEventListener('click', function (e) {
      if (e.target === root) {closeScanner();}
    });

    root.querySelector('[data-toggle-manual]').onclick = function () {
      const panel = root.querySelector('[data-panel-manual]');
      const open = !panel.classList.contains('on');
      root.querySelector('[data-panel-manual]').classList.toggle('on', open);
      root.querySelector('[data-toggle-manual]').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        root.querySelector('[data-panel-more]').classList.remove('on');
        root.querySelector('[data-toggle-more]').setAttribute('aria-expanded', 'false');
        const inp = root.querySelector('[data-manual]');
        if (inp) {setTimeout(function () { try { inp.focus(); } catch (_) {} }, 40);}
      }
    };
    root.querySelector('[data-toggle-more]').onclick = function () {
      const panel = root.querySelector('[data-panel-more]');
      const open = !panel.classList.contains('on');
      root.querySelector('[data-panel-more]').classList.toggle('on', open);
      root.querySelector('[data-toggle-more]').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        root.querySelector('[data-panel-manual]').classList.remove('on');
        root.querySelector('[data-toggle-manual]').setAttribute('aria-expanded', 'false');
      }
    };

    // --- Photo capture (iOS-reliable) ---
    const snapInput = root.querySelector('[data-snap]');
    if (snapInput) {
      snapInput.addEventListener('change', async function () {
        const file = snapInput.files && snapInput.files[0];
        if (!file) {return;}
        setScanUiState(root, 'scanning', 'Reading photo…');
        const text = await decodeQrFromFile(file);
        snapInput.value = '';
        if (!text) {
          setScanUiState(
            root,
            'error',
            'No QR in photo — move closer, or type table #'
          );
          toast('No QR in photo — retake closer or type table #', 'fa-circle-exclamation');
          // Open manual fallback automatically
          root.querySelector('[data-panel-manual]').classList.add('on');
          root.querySelector('[data-toggle-manual]').setAttribute('aria-expanded', 'true');
          return;
        }
        await handleDecoded(root, text);
      });
    }

    // --- Live camera ---
    const liveBtn = root.querySelector('[data-live-cam]');
    if (liveBtn) {
      liveBtn.onclick = function () {
        stopCamera();
        setScanUiState(root, 'scanning', 'Starting camera…');
        const ph = root.querySelector('[data-ph-text]');
        if (ph) {ph.textContent = 'Point at table QR';}
        startCamera(root);
      };
    }

    // Desktop / non-iOS: auto-start live camera
    if (!ios) {
      startCamera(root);
    }

    function showPrimaryPos(show) {
      const btn = root.querySelector('[data-act="pos"]');
      if (btn) {btn.classList.toggle('on', !!show);}
    }

    function requireParsed() {
      if (root._parsed) {return root._parsed;}
      const manual = (root.querySelector('[data-manual]').value || '').trim();
      const p = parseTableQrPayload(manual);
      if (p) {
        showHit(root, p);
        showPrimaryPos(true);
        setScanUiState(root, 'found', 'Table ' + p.table + ' ready');
        return p;
      }
      // Expand type-table if nothing scanned
      root.querySelector('[data-panel-manual]').classList.add('on');
      root.querySelector('[data-toggle-manual]').setAttribute('aria-expanded', 'true');
      toast('Scan a table QR or enter table number', 'fa-circle-exclamation');
      return null;
    }

    root.querySelector('[data-manual-go]').onclick = async function () {
      const p = requireParsed();
      if (!p) {return;}
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
      const p = requireParsed();
      if (!p) {return;}
      if (autoActTimer) {
        clearTimeout(autoActTimer);
        autoActTimer = null;
      }
      closeScanner();
      await openTableInPosFromScan(p, { seat: false });
    };
    root.querySelector('[data-act="seat"]').onclick = async function () {
      const p = requireParsed();
      if (!p) {return;}
      if (autoActTimer) {
        clearTimeout(autoActTimer);
        autoActTimer = null;
      }
      closeScanner();
      await openTableInPosFromScan(p, { seat: true });
    };
    root.querySelector('[data-act="kot"]').onclick = function () {
      const p = requireParsed();
      if (!p) {return;}
      if (autoActTimer) {
        clearTimeout(autoActTimer);
        autoActTimer = null;
      }
      closeScanner();
      openWaiterKot(p);
    };
    root.querySelector('[data-act="hub"]').onclick = function () {
      const p = requireParsed();
      if (!p) {return;}
      const slug = p.tenant || currentTenantSlug();
      const url =
        guestOrderBaseUrl() +
        '/qr-order.html?tenant=' +
        encodeURIComponent(slug) +
        '&table=' +
        encodeURIComponent(p.table) +
        '&hub=1';
      window.open(url, '_blank', 'noopener');
    };

    // Expose for showHit to reveal primary CTA
    root._showPrimaryPos = showPrimaryPos;

    if (typeof opts.onOpen === 'function') {opts.onOpen();}
  }

  global.RSStaffTableScanner = {
    open: openScanner,
    close: closeScanner,
    parse: parseTableQrPayload,
    normTableKey: normTableKey,
  };

  global.openStaffTableScanner = openScanner;
})(typeof window !== 'undefined' ? window : globalThis);
