/* ============================================================
   RestroSuite — Product 10x layer
   Mobile shell · shift denominations · manual online orders ·
   feedback approval · staff QR scanner · hi/en · staff security
   Loaded after competitive-ops / growth features.
   ============================================================ */
(function (global) {
  'use strict';

  const RS10 = (global.RS10 = global.RS10 || {});

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
    else if (typeof console !== 'undefined') console.log('[RS10]', msg);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function session() {
    try {
      return (global.RS_API && RS_API.session && RS_API.session()) || {};
    } catch (_) {
      return {};
    }
  }
  function isTouchMobile() {
    try {
      return window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)').matches;
    } catch (_) {
      return window.innerWidth <= 900;
    }
  }
  function isDesktopWide() {
    try {
      return window.matchMedia('(min-width: 1025px) and (hover: hover)').matches;
    } catch (_) {
      return window.innerWidth >= 1025;
    }
  }

  /* ───────────── i18n (simple hi / en) ───────────── */
  const DICT = {
    en: {
      pos: 'POS',
      kitchen: 'Kitchen',
      bills: 'Bills',
      orders: 'Orders',
      reports: 'Reports',
      more: 'More',
      inventory: 'Inventory',
      settings: 'Settings',
      shift_open: 'Open shift',
      shift_close: 'Close shift',
      cart: 'Cart',
      checkout: 'Checkout',
      support: 'Support',
      feedback: 'Feedback',
      language: 'Language',
      scan_table: 'Scan table QR',
      guests: 'Guests',
      online_orders: 'Online orders',
      save: 'Save',
      cancel: 'Cancel',
      approve: 'Show on website',
      hide: 'Hide from website',
      deactivate: 'Deactivate login',
      shift_float: 'Opening cash (notes & coins)',
      shift_count: 'Closing cash count',
      total: 'Total',
      send_owner: 'Send to owner',
    },
    hi: {
      pos: 'बिलिंग',
      kitchen: 'रसोई',
      bills: 'बिल',
      orders: 'ऑर्डर',
      reports: 'रिपोर्ट',
      more: 'और',
      inventory: 'स्टॉक',
      settings: 'सेटिंग',
      shift_open: 'शिफ्ट खोलें',
      shift_close: 'शिफ्ट बंद',
      cart: 'कार्ट',
      checkout: 'पेमेंट',
      support: 'सहायता',
      feedback: 'फीडबैक',
      language: 'भाषा',
      scan_table: 'टेबल QR स्कैन',
      guests: 'मेहमान',
      online_orders: 'ऑनलाइन ऑर्डर',
      save: 'सेव',
      cancel: 'रद्द',
      approve: 'वेबसाइट पर दिखाएँ',
      hide: 'वेबसाइट से हटाएँ',
      deactivate: 'लॉगिन बंद करें',
      shift_float: 'शुरुआती नकद (नोट/सिक्के)',
      shift_count: 'बंद करते समय नकद गिनती',
      total: 'कुल',
      send_owner: 'मालिक को भेजें',
    },
  };

  function getLang() {
    try {
      return localStorage.getItem('rs_lang') === 'hi' ? 'hi' : 'en';
    } catch (_) {
      return 'en';
    }
  }
  function t(key) {
    const lang = getLang();
    return (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || key;
  }
  RS10.t = t;
  RS10.getLang = getLang;

  function setLang(lang) {
    const next = lang === 'hi' ? 'hi' : 'en';
    try {
      localStorage.setItem('rs_lang', next);
    } catch (_) {}
    document.documentElement.setAttribute('lang', next === 'hi' ? 'hi' : 'en');
    document.documentElement.setAttribute('data-rs-lang', next);
    applyI18nDom();
    toast(next === 'hi' ? 'भाषा: हिंदी' : 'Language: English', 'fa-language');
    try {
      document.dispatchEvent(new CustomEvent('rs:lang', { detail: { lang: next } }));
    } catch (_) {}
  }
  RS10.setLang = setLang;

  function applyI18nDom() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const val = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.placeholder != null) el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
    // Mobile bottom nav labels
    const map = {
      'pos-tab': 'pos',
      'qr-orders-tab': 'orders',
      'kds-tab': 'kitchen',
      'bills-tab': 'bills',
      'reports-tab': 'reports',
    };
    document.querySelectorAll('.mnav-link[data-tab]').forEach((a) => {
      const k = map[a.getAttribute('data-tab')];
      const span = a.querySelector('span');
      if (k && span) span.textContent = t(k);
    });
    const more = document.querySelector('#mnav-more span');
    if (more) more.textContent = t('more');
  }

  /* ───────────── INR denomination helpers ───────────── */
  const INR_NOTES = [500, 200, 100, 50, 20, 10, 5, 2, 1];

  function denomTotal(counts) {
    let t = 0;
    INR_NOTES.forEach((d) => {
      t += d * (Math.max(0, Number(counts[d]) || 0));
    });
    return t;
  }

  function denomModalHtml(title, sub, initialTotal) {
    const seed = Math.max(0, Number(initialTotal) || 0);
    // Pre-fill greedy notes for convenience
    let left = seed;
    const pre = {};
    INR_NOTES.forEach((d) => {
      pre[d] = Math.floor(left / d);
      left -= pre[d] * d;
    });
    const rows = INR_NOTES.map(
      (d) => `<label class="rs10-den-row">
        <span class="rs10-den-note">₹${d}</span>
        <input type="number" min="0" max="9999" step="1" inputmode="numeric" data-den="${d}" value="${pre[d] || 0}" class="form-input rs10-den-inp">
        <span class="rs10-den-line" data-den-line="${d}">₹${(pre[d] || 0) * d}</span>
      </label>`
    ).join('');
    return `<div class="rs10-den-wrap">
      <p class="rs10-den-sub">${esc(sub)}</p>
      <div class="rs10-den-grid">${rows}</div>
      <div class="rs10-den-total"><span>${esc(t('total'))}</span><b id="rs10-den-sum">${rs(seed)}</b></div>
      <label class="rs10-den-note-field"><span>Note (optional)</span>
        <input type="text" id="rs10-den-note" class="form-input" placeholder="Counted by…" maxlength="80">
      </label>
    </div>`;
  }

  function wireDenomModal(root, onChange) {
    const update = () => {
      const counts = {};
      root.querySelectorAll('[data-den]').forEach((inp) => {
        const d = Number(inp.getAttribute('data-den'));
        const n = Math.max(0, Math.floor(Number(inp.value) || 0));
        counts[d] = n;
        const line = root.querySelector(`[data-den-line="${d}"]`);
        if (line) line.textContent = rs(d * n);
      });
      const sum = denomTotal(counts);
      const el = root.querySelector('#rs10-den-sum');
      if (el) el.textContent = rs(sum);
      if (onChange) onChange(sum, counts);
      return { sum, counts };
    };
    root.querySelectorAll('[data-den]').forEach((inp) => {
      inp.addEventListener('input', update);
    });
    return update();
  }

  function promptDenomination({ title, sub, initial }) {
    return new Promise((resolve) => {
      if (!global.RSModal) {
        const f = window.prompt(title + ' — total ₹', String(initial || 0));
        if (f === null) return resolve(null);
        return resolve({ total: Number(f) || 0, counts: {}, note: '' });
      }
      let last = { sum: Number(initial) || 0, counts: {} };
      RSModal.open({
        title: title || t('shift_float'),
        sub: sub || '',
        icon: 'fa-money-bill-wave',
        size: 'sm',
        body: denomModalHtml(title, sub || '', initial),
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>${esc(t('cancel'))}</button>
               <button type="button" class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> ${esc(t('save'))}</button>`,
        onMount(m, close) {
          last = wireDenomModal(m, (sum, counts) => {
            last = { sum, counts };
          });
          const x = m.querySelector('[data-x]');
          if (x)
            x.onclick = () => {
              close();
              resolve(null);
            };
          const ok = m.querySelector('[data-ok]');
          if (ok)
            ok.onclick = () => {
              const note = (m.querySelector('#rs10-den-note') || {}).value || '';
              close();
              resolve({ total: last.sum, counts: last.counts, note: String(note).trim() });
            };
        },
      });
    });
  }
  RS10.promptDenomination = promptDenomination;

  /* ───────────── Shift open/close: denom UI is used by competitive-ops via RS10.promptDenomination ───────────── */
  function patchShiftFlow() {
    // No click intercept — competitive-ops.js calls RS10.promptDenomination on open/close.
  }

  /* ───────────── Mobile topbar overflow + QR scanner ───────────── */
  function installMobileChrome() {
    const right = document.getElementById('tb-right');
    if (!right || right.dataset.rs10Chrome === '1') return;
    right.dataset.rs10Chrome = '1';

    // Overflow "⋯" for secondary icons on mobile
    let more = document.getElementById('tb-more-btn');
    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.id = 'tb-more-btn';
      more.className = 'tb-icon-btn tb-more-btn';
      more.setAttribute('aria-label', 'More tools');
      more.setAttribute('title', 'More');
      more.innerHTML = '<i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>';
      right.appendChild(more);

      const menu = document.createElement('div');
      menu.id = 'tb-more-menu';
      menu.className = 'tb-more-menu';
      menu.hidden = true;
      menu.innerHTML = `
        <button type="button" class="tb-more-item" data-act="lang"><i class="fa-solid fa-language"></i><span data-i18n="language">Language</span></button>
        <button type="button" class="tb-more-item" data-act="theme"><i class="fa-solid fa-circle-half-stroke"></i><span>Theme</span></button>
        <button type="button" class="tb-more-item" data-act="notif"><i class="fa-regular fa-bell"></i><span>Notifications</span></button>
        <button type="button" class="tb-more-item" data-act="feedback"><i class="fa-solid fa-star"></i><span data-i18n="feedback">Feedback</span></button>
      `;
      right.appendChild(menu);

      more.onclick = (e) => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
        more.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      };
      document.addEventListener('click', () => {
        menu.hidden = true;
      });
      menu.addEventListener('click', (e) => e.stopPropagation());
      menu.querySelectorAll('[data-act]').forEach((btn) => {
        btn.onclick = () => {
          const act = btn.getAttribute('data-act');
          menu.hidden = true;
          if (act === 'lang') {
            setLang(getLang() === 'hi' ? 'en' : 'hi');
          } else if (act === 'theme') {
            document.getElementById('theme-toggle')?.click();
          } else if (act === 'notif') {
            document.getElementById('tb-notif-btn')?.click();
          } else if (act === 'feedback') {
            openStaffFeedback();
          }
        };
      });
    }

    // Staff QR scanner — always visible in top bar (phone, tablet, desktop webcam)
    let scan = document.getElementById('tb-qr-scan');
    if (!scan) {
      scan = document.createElement('button');
      scan.type = 'button';
      scan.id = 'tb-qr-scan';
      scan.className = 'tb-icon-btn tb-qr-scan';
      scan.setAttribute('aria-label', t('scan_table') || 'Scan table QR');
      scan.setAttribute(
        'title',
        'Scan table QR (camera) · or type table number — same session as guest'
      );
      scan.setAttribute('data-i18n-title', 'scan_table');
      scan.innerHTML = '<i class="fa-solid fa-qrcode" aria-hidden="true"></i>';
      // Prefer next to WhatsApp / support cluster so it is not lost in overflow
      const wa = document.getElementById('tb-wa-status-btn');
      const support = document.getElementById('tb-support-wrap');
      if (wa && wa.parentNode) wa.parentNode.insertBefore(scan, wa);
      else if (support && support.parentNode) support.parentNode.insertBefore(scan, support);
      else right.insertBefore(scan, right.firstChild);
      scan.onclick = () => openStaffQrScanner();
    }
    updateScanVisibility();
    window.addEventListener('resize', updateScanVisibility);
  }

  function updateScanVisibility() {
    const scan = document.getElementById('tb-qr-scan');
    if (!scan) return;
    // Always show — staff on counter PC also need table QR scan / table #
    scan.style.display = '';
    scan.hidden = false;
  }

  function openStaffQrScanner() {
    // Role gate: waiter, admin, manager, owner, captain
    const role = String(session().role || sessionStorage.getItem('logged_in_role') || '').toLowerCase();
    const allowed = /owner|admin|manager|waiter|captain|cashier|superadmin/.test(role) || !role;
    if (!allowed) {
      toast('No permission to scan table QR', 'fa-lock');
      return;
    }

    if (!global.RSModal) {
      const url = window.prompt('Paste table QR link or table number');
      if (url) handleScannedTablePayload(url);
      return;
    }

    RSModal.open({
      title: t('scan_table'),
      sub: 'Point camera at table QR · same session as guest',
      icon: 'fa-qrcode',
      size: 'sm',
      body: `<div class="rs10-scan">
        <div id="rs10-scan-video-wrap" class="rs10-scan-video-wrap">
          <video id="rs10-scan-video" playsinline muted></video>
          <canvas id="rs10-scan-canvas" hidden></canvas>
          <div class="rs10-scan-frame"></div>
        </div>
        <p class="rs10-scan-hint">Or enter table number</p>
        <div class="rs10-scan-manual">
          <input type="text" id="rs10-scan-table" class="form-input" placeholder="Table 12" inputmode="text">
          <button type="button" class="btn btn-primary" id="rs10-scan-go">Open</button>
        </div>
        <p id="rs10-scan-status" class="rs10-scan-status"></p>
      </div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>`,
      onMount(m, close) {
        let stream = null;
        let timer = null;
        const status = m.querySelector('#rs10-scan-status');
        const stop = () => {
          if (timer) clearInterval(timer);
          if (stream) stream.getTracks().forEach((tr) => tr.stop());
          stream = null;
        };
        m.querySelector('[data-x]').onclick = () => {
          stop();
          close();
        };
        m.querySelector('#rs10-scan-go').onclick = () => {
          const v = (m.querySelector('#rs10-scan-table').value || '').trim();
          if (!v) return;
          stop();
          close();
          handleScannedTablePayload(v);
        };

        const video = m.querySelector('#rs10-scan-video');
        const canvas = m.querySelector('#rs10-scan-canvas');
        const startCam = async () => {
          try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              if (status) status.textContent = 'Camera not available — type table number';
              return;
            }
            const tries = [
              { video: { facingMode: { ideal: 'environment' } }, audio: false },
              { video: { facingMode: 'user' }, audio: false },
              { video: true, audio: false },
            ];
            let errLast = null;
            for (const c of tries) {
              try { stream = await navigator.mediaDevices.getUserMedia(c); errLast = null; break; }
              catch (e) { errLast = e; }
            }
            if (!stream) {
              if (status) status.textContent = 'Camera permission denied — enter table manually';
              console.warn('[rs10 scan]', errLast);
              return;
            }
            video.setAttribute('playsinline', 'true');
            video.muted = true;
            video.srcObject = stream;
            await video.play();
            if (status) status.textContent = 'Scanning…';

            // BarcodeDetector when available; else load jsQR
            if (global.BarcodeDetector) {
              const det = new BarcodeDetector({ formats: ['qr_code'] });
              timer = setInterval(async () => {
                try {
                  const codes = await det.detect(video);
                  if (codes && codes[0] && codes[0].rawValue) {
                    stop();
                    close();
                    handleScannedTablePayload(codes[0].rawValue);
                  }
                } catch (_) {}
              }, 500);
            } else {
              const runJsQr = () => {
                if (!global.jsQR || !canvas) {
                  if (status) status.textContent = 'Enter table number below (scanner lib unavailable)';
                  return;
                }
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                timer = setInterval(() => {
                  try {
                    if (video.readyState < 2) return;
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 480;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = global.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
                    if (code && code.data) {
                      stop();
                      close();
                      handleScannedTablePayload(code.data);
                    }
                  } catch (_) {}
                }, 400);
              };
              if (global.jsQR) runJsQr();
              else {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
                s.onload = runJsQr;
                s.onerror = () => { if (status) status.textContent = 'Enter table number below'; };
                document.head.appendChild(s);
              }
            }
          } catch (err) {
            if (status) status.textContent = 'Camera permission denied — enter table manually';
          }
        };
        startCam();
      },
    });
  }
  RS10.openStaffQrScanner = openStaffQrScanner;

  function handleScannedTablePayload(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    let table = text;
    let url = null;
    try {
      if (/^https?:\/\//i.test(text) || text.includes('qr-order') || text.includes('table=')) {
        url = new URL(text, location.origin);
        table =
          url.searchParams.get('table') ||
          url.searchParams.get('t') ||
          url.searchParams.get('tableNumber') ||
          table;
      }
    } catch (_) {}

    // Normalize "Table 12" / "12"
    const m = String(table).match(/(\d{1,3})/);
    const tableLabel = m ? 'Table ' + m[1] : table;

    // Set POS table + covers prompt + activate POS
    try {
      if (global.RS && RS.activateTab) RS.activateTab('pos-tab');
    } catch (_) {}

    const sel = document.getElementById('cart-table');
    if (sel) {
      let found = false;
      Array.from(sel.options).forEach((o) => {
        if (o.value === tableLabel || o.textContent === tableLabel || o.value.includes(m && m[1])) {
          sel.value = o.value;
          found = true;
        }
      });
      if (!found) {
        const opt = document.createElement('option');
        opt.value = tableLabel;
        opt.textContent = tableLabel;
        sel.appendChild(opt);
        sel.value = tableLabel;
      }
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Guest count
    const covers = document.getElementById('cart-covers');
    if (covers && !Number(covers.value)) {
      setTimeout(async () => {
        const n = window.prompt(t('guests') + ' (covers)', '2');
        if (n != null && covers) {
          covers.value = String(Math.max(0, Math.min(99, Number(n) || 0)));
          covers.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 200);
    }

    // Switch order type to dine-in if buttons exist
    document.querySelectorAll('.order-type-btn').forEach((b) => {
      if (/dine/i.test(b.getAttribute('aria-label') || b.title || b.textContent || '')) {
        b.click();
      }
    });

    toast('Table ' + tableLabel + ' · ready to order', 'fa-chair');
    try {
      document.dispatchEvent(
        new CustomEvent('rs:table-scanned', { detail: { table: tableLabel, raw: text } })
      );
    } catch (_) {}
  }

  /* ───────────── Support → Feedback ───────────── */
  function installSupportFeedback() {
    const menu = document.getElementById('tb-support-menu');
    if (!menu || menu.querySelector('[data-rs10-feedback]')) return;
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'tb-support-item';
    a.setAttribute('role', 'menuitem');
    a.setAttribute('data-rs10-feedback', '1');
    a.innerHTML = `
      <span class="tb-support-ico" style="background:rgba(255,79,0,.12);color:var(--orange,#FF4F00)"><i class="fa-solid fa-star" aria-hidden="true"></i></span>
      <span class="tb-support-copy">
        <strong data-i18n="feedback">Feedback</strong>
        <span>Rate experience · suggest improvements</span>
      </span>`;
    a.onclick = () => {
      menu.hidden = true;
      openStaffFeedback();
    };
    menu.appendChild(a);

    // Language row under support
    const lang = document.createElement('button');
    lang.type = 'button';
    lang.className = 'tb-support-item';
    lang.setAttribute('role', 'menuitem');
    lang.innerHTML = `
      <span class="tb-support-ico" style="background:rgba(42,155,143,.12);color:var(--teal,#2a9b8f)"><i class="fa-solid fa-language" aria-hidden="true"></i></span>
      <span class="tb-support-copy">
        <strong data-i18n="language">Language</strong>
        <span>English · हिंदी</span>
      </span>`;
    lang.onclick = () => {
      menu.hidden = true;
      setLang(getLang() === 'hi' ? 'en' : 'hi');
    };
    menu.appendChild(lang);
  }

  function openStaffFeedback() {
    const slug = sessionStorage.getItem('tenant_slug') || '';
    if (!global.RSModal) {
      if (slug) window.open('/feedback?tenant=' + encodeURIComponent(slug) + '&source=staff', '_blank');
      return;
    }
    RSModal.open({
      title: t('feedback'),
      sub: 'Your note goes to CodeArc + outlet owner. Guests use QR/bill link.',
      icon: 'fa-star',
      size: 'sm',
      body: `<div class="rs10-fb">
        <label class="fl">Stars</label>
        <div class="rs10-fb-stars" id="rs10-fb-stars">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-r="${n}" class="on">★</button>`).join('')}
        </div>
        <label class="fl">Comment</label>
        <textarea id="rs10-fb-text" class="form-input" rows="3" placeholder="What worked? What felt hard?"></textarea>
        <label class="row" style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px">
          <input type="checkbox" id="rs10-fb-public"> Suggest for homepage (owner must approve)
        </label>
      </div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>${esc(t('cancel'))}</button>
             <button type="button" class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-paper-plane"></i> Send</button>`,
      onMount(m, close) {
        let rating = 5;
        const paint = () => {
          m.querySelectorAll('#rs10-fb-stars button').forEach((b) => {
            b.classList.toggle('on', Number(b.getAttribute('data-r')) <= rating);
          });
        };
        m.querySelectorAll('#rs10-fb-stars button').forEach((b) => {
          b.onclick = () => {
            rating = Number(b.getAttribute('data-r')) || 5;
            paint();
          };
        });
        paint();
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-ok]').onclick = async () => {
          const comment = (m.querySelector('#rs10-fb-text').value || '').trim();
          const wantPublic = !!(m.querySelector('#rs10-fb-public') || {}).checked;
          const row = {
            id: 'RV-' + Date.now(),
            guestName: session().display_name || session().username || 'Staff',
            rating,
            comment,
            source: 'staff',
            status: wantPublic ? 'pending' : 'internal',
            homepageApproved: false,
            createdAt: new Date().toISOString(),
            tableNumber: '',
          };
          try {
            if (global.RS_DB && RS_DB.put) await RS_DB.put('reviews', row.id, row);
            // local hub list
            try {
              const key = 'rs_hub_reviews';
              const list = JSON.parse(localStorage.getItem(key) || '[]');
              list.unshift(row);
              localStorage.setItem(key, JSON.stringify(list.slice(0, 200)));
            } catch (_) {}
            toast('Thanks — feedback saved', 'fa-star');
          } catch (e) {
            toast('Could not save feedback', 'fa-circle-exclamation');
          }
          close();
        };
      },
    });
  }
  RS10.openStaffFeedback = openStaffFeedback;

  /* ───────────── Review approve for homepage ───────────── */
  function installReviewApprovalHooks() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest && e.target.closest('[data-rs10-review-act]');
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      const act = btn.getAttribute('data-rs10-review-act');
      if (!id || !act) return;
      let row = null;
      try {
        if (global.RS_DB && RS_DB.get) row = await RS_DB.get('reviews', id);
      } catch (_) {}
      if (!row) {
        try {
          const list = JSON.parse(localStorage.getItem('rs_hub_reviews') || '[]');
          row = list.find((r) => String(r.id) === String(id));
        } catch (_) {}
      }
      if (!row) {
        toast('Review not found', 'fa-circle-exclamation');
        return;
      }
      if (act === 'approve') {
        row.homepageApproved = true;
        row.status = 'approved';
      } else if (act === 'hide') {
        row.homepageApproved = false;
        row.status = 'hidden';
      }
      try {
        if (global.RS_DB && RS_DB.put) await RS_DB.put('reviews', row.id, row);
      } catch (_) {}
      try {
        const list = JSON.parse(localStorage.getItem('rs_hub_reviews') || '[]');
        const i = list.findIndex((r) => String(r.id) === String(id));
        if (i >= 0) list[i] = row;
        else list.unshift(row);
        localStorage.setItem('rs_hub_reviews', JSON.stringify(list.slice(0, 200)));
        // Publish approved set for homepage
        const approved = list.filter((r) => r.homepageApproved && Number(r.rating) >= 4);
        localStorage.setItem('rs_homepage_reviews', JSON.stringify(approved.slice(0, 20)));
      } catch (_) {}
      toast(act === 'approve' ? 'Will show on homepage' : 'Hidden from homepage', 'fa-star');
      btn.closest('tr')?.classList.add('rs10-review-updated');
    });
  }

  RS10.getHomepageReviews = function () {
    try {
      return JSON.parse(localStorage.getItem('rs_homepage_reviews') || '[]');
    } catch (_) {
      return [];
    }
  };

  /* ───────────── Manual online order entry ───────────── */
  function installManualOnlineOrder() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('#agg-manual-order, [data-rs10-manual-online]');
      if (!btn) return;
      e.preventDefault();
      openManualOnlineOrder();
    });

    // Inject button into aggregator toolbar when rendered
    const obs = new MutationObserver(() => {
      const toolbar = document.querySelector('.agg-toolbar');
      if (!toolbar || toolbar.querySelector('#agg-manual-order')) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'agg-manual-order';
      b.className = 'btn btn-primary btn-sm';
      b.title = 'Enter Swiggy / Zomato / other order manually';
      b.innerHTML = '<i class="fa-solid fa-plus"></i> Manual order';
      const refresh = toolbar.querySelector('#agg-refresh');
      if (refresh) toolbar.insertBefore(b, refresh);
      else toolbar.appendChild(b);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function openManualOnlineOrder() {
    if (!global.RSModal) {
      toast('Open Online Orders tab to add', 'fa-motorcycle');
      return;
    }
    const menu = (global.RS && RS.MENU) || [];
    const menuOpts = menu
      .slice(0, 80)
      .map(
        (m) =>
          `<option value="${esc(m.id)}" data-price="${Number(m.price || m.salePrice || 0)}" data-name="${esc(m.name)}">${esc(m.name)} · ${rs(m.price || m.salePrice || 0)}</option>`
      )
      .join('');

    RSModal.open({
      title: 'Manual online order',
      sub: 'Swiggy · Zomato · ONDC · Other — full bill workflow',
      icon: 'fa-motorcycle',
      size: 'md',
      body: `<div class="rs10-online-form">
        <div class="form-grid-2">
          <div class="set-field"><label class="fl">Platform</label>
            <select id="rs10-ol-plat" class="form-input">
              <option value="swiggy">Swiggy</option>
              <option value="zomato">Zomato</option>
              <option value="ondc">ONDC</option>
              <option value="other">Other / phone</option>
            </select>
          </div>
          <div class="set-field"><label class="fl">External order ID</label>
            <input id="rs10-ol-oid" class="form-input" placeholder="e.g. SWG-12345" autocomplete="off">
          </div>
          <div class="set-field"><label class="fl">Customer name</label>
            <input id="rs10-ol-name" class="form-input" placeholder="Guest name">
          </div>
          <div class="set-field"><label class="fl">Phone</label>
            <input id="rs10-ol-phone" class="form-input" placeholder="10-digit" inputmode="tel">
          </div>
        </div>
        <div class="set-field" style="margin-top:10px"><label class="fl">Add menu item</label>
          <div style="display:flex;gap:8px">
            <select id="rs10-ol-menu" class="form-input" style="flex:1">${menuOpts || '<option value="">No menu loaded</option>'}</select>
            <input id="rs10-ol-qty" class="form-input" type="number" min="1" value="1" style="width:72px" title="Qty">
            <button type="button" class="btn btn-ghost" id="rs10-ol-add"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
        <ul id="rs10-ol-lines" class="rs10-ol-lines"></ul>
        <div class="form-grid-2" style="margin-top:8px">
          <div class="set-field"><label class="fl">Delivery fee</label>
            <input id="rs10-ol-fee" class="form-input" type="number" min="0" value="0" inputmode="decimal">
          </div>
          <div class="set-field"><label class="fl">Status</label>
            <select id="rs10-ol-status" class="form-input">
              <option value="Pending Review">New / Pending</option>
              <option value="preparing">Accepted / Preparing</option>
              <option value="ready">Ready</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div class="rs10-ol-total">Total <b id="rs10-ol-total">${rs(0)}</b></div>
      </div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>${esc(t('cancel'))}</button>
             <button type="button" class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-check"></i> Save order</button>`,
      onMount(m, close) {
        const lines = [];
        const listEl = m.querySelector('#rs10-ol-lines');
        const totalEl = m.querySelector('#rs10-ol-total');
        const paint = () => {
          listEl.innerHTML = lines
            .map(
              (l, i) =>
                `<li><span>${esc(l.qty)}× ${esc(l.name)}</span><span>${rs(l.price * l.qty)}</span>
                  <button type="button" data-rm="${i}" class="btn btn-ghost btn-sm" title="Remove">×</button></li>`
            )
            .join('');
          listEl.querySelectorAll('[data-rm]').forEach((b) => {
            b.onclick = () => {
              lines.splice(Number(b.getAttribute('data-rm')), 1);
              paint();
            };
          });
          const fee = Number(m.querySelector('#rs10-ol-fee').value) || 0;
          const sub = lines.reduce((a, l) => a + l.price * l.qty, 0);
          totalEl.textContent = rs(sub + fee);
        };
        m.querySelector('#rs10-ol-add').onclick = () => {
          const sel = m.querySelector('#rs10-ol-menu');
          const opt = sel.options[sel.selectedIndex];
          if (!opt || !opt.value) return;
          const qty = Math.max(1, Number(m.querySelector('#rs10-ol-qty').value) || 1);
          lines.push({
            id: opt.value,
            name: opt.getAttribute('data-name') || opt.textContent,
            price: Number(opt.getAttribute('data-price')) || 0,
            qty,
          });
          paint();
        };
        m.querySelector('#rs10-ol-fee').oninput = paint;
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-ok]').onclick = async () => {
          if (!lines.length) {
            toast('Add at least one item', 'fa-circle-exclamation');
            return;
          }
          const plat = m.querySelector('#rs10-ol-plat').value || 'other';
          const fee = Number(m.querySelector('#rs10-ol-fee').value) || 0;
          const sub = lines.reduce((a, l) => a + l.price * l.qty, 0);
          const total = sub + fee;
          const status = m.querySelector('#rs10-ol-status').value || 'Pending Review';
          const stamp = Date.now();
          const id = stamp * 1000 + Math.floor(Math.random() * 1000);
          const oid =
            (m.querySelector('#rs10-ol-oid').value || '').trim() ||
            plat.slice(0, 3).toUpperCase() + '-' + String(stamp).slice(-6);
          const row = {
            id,
            orderId: oid,
            tableNumber: 'Delivery',
            orderType: 'Online Delivery',
            platform: plat,
            channel: 'aggregator',
            source: plat,
            customerName: (m.querySelector('#rs10-ol-name').value || '').trim() || 'Online guest',
            customerPhone: (m.querySelector('#rs10-ol-phone').value || '').trim(),
            items: lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })),
            deliveryFee: fee,
            total,
            status,
            dateTime: new Date().toISOString(),
            priority: 'normal',
            manualEntry: true,
          };
          try {
            if (window.RS_DB) {
              await RS_DB.put('pending_orders', id, row);
              if (window.RS_SYNC && RS_SYNC.syncPendingOrders)
                await RS_SYNC.syncPendingOrders({ forceCloud: true });
            }
            // If delivered, also create a bill for history/reporting
            if (status === 'delivered' || status === 'ready') {
              await settleOnlineToBill(row);
            }
            toast((platName(plat) || 'Online') + ' order saved', 'fa-motorcycle');
            close();
            try {
              if (global.RS && RS.activateTab) RS.activateTab('aggregator-tab');
              document.dispatchEvent(new CustomEvent('rs:online-order-manual', { detail: row }));
            } catch (_) {}
            // re-render if possible
            setTimeout(() => {
              try {
                if (global.RS && RS.renderAgg) RS.renderAgg();
              } catch (_) {}
            }, 200);
          } catch (err) {
            console.warn(err);
            toast('Could not save online order', 'fa-circle-exclamation');
          }
        };
      },
    });
  }
  RS10.openManualOnlineOrder = openManualOnlineOrder;

  function platName(p) {
    return { swiggy: 'Swiggy', zomato: 'Zomato', ondc: 'ONDC', other: 'Other' }[p] || p;
  }

  async function settleOnlineToBill(order) {
    if (!global.RS || !RS.saveOne) return;
    const items = order.items || [];
    const sub = items.reduce((a, i) => a + Number(i.price) * Number(i.qty), 0);
    const fee = Number(order.deliveryFee) || 0;
    const gst = Math.round(sub * 0.05);
    const grand = sub + fee + gst;
    const bill = {
      id: 'BILL-OL-' + Date.now(),
      no: order.orderId || 'OL-' + Date.now(),
      orderId: order.orderId,
      customerName: order.customerName || 'Online guest',
      customerPhone: order.customerPhone || '',
      dateTime: order.dateTime || new Date().toISOString(),
      time: new Date().toLocaleString('en-IN'),
      table: 'Online · ' + platName(order.platform || order.source),
      subtotal: sub,
      gst,
      amount: grand,
      total: grand,
      paymentMethod: 'Online',
      pay: 'Online',
      channel: 'aggregator',
      platform: order.platform || order.source,
      orderType: 'Online Delivery',
      status: String(order.status).toLowerCase() === 'cancelled' ? 'Cancelled' : 'Paid',
      _items: items,
      deliveryFee: fee,
    };
    try {
      await RS.saveOne('bills', bill);
      if (Array.isArray(RS.BILLS)) RS.BILLS.unshift(bill);
    } catch (e) {
      console.warn('[RS10] settle bill', e);
    }
  }

  /* ───────────── Employee deactivate + session revoke ─────────────
     Primary UX lives in employees-ui.js (emp-toggle-active).
     This layer hardens staff login suspend + session kill when any
     deactivate control fires, and injects buttons only if missing. */
  function installStaffSecurity() {
    async function hardDeactivate({ empId, staffUserId, name }) {
      const label = name || 'Staff';
      // 1) Staff login suspend + session revoke (source of truth for access)
      if (global.RS_API && typeof RS_API.staffUsers === 'function') {
        let sid = staffUserId || null;
        if (!sid && empId) {
          try {
            const res = await RS_API.staffUsers({ action: 'list_users' });
            const users = (res && res.users) || [];
            const hit = users.find(
              (u) =>
                String(u.employee_id || '') === String(empId) ||
                String(u.display_name || '').toLowerCase() === String(label).toLowerCase()
            );
            if (hit) sid = hit.id;
          } catch (_) {}
        }
        if (sid) {
          try {
            await RS_API.staffUsers({ action: 'update_user', user_id: sid, status: 'suspended' });
          } catch (_) {}
          try {
            await RS_API.staffUsers({ action: 'revoke_user_sessions', user_id: sid });
          } catch (_) {
            try {
              if (typeof RS_API.data === 'function') {
                await RS_API.data({ operation: 'revoke_user_sessions', userId: sid });
              }
            } catch (__) {}
          }
        }
      }
      // 2) Directory flag
      if (global.RS_DB && empId) {
        try {
          const emp = await RS_DB.get('employees', empId);
          if (emp) {
            emp.active = false;
            emp.status = 'Inactive';
            emp.disabledAt = new Date().toISOString();
            await RS_DB.put('employees', empId, emp);
          }
        } catch (_) {}
      }
      toast(label + ' deactivated · sessions revoked', 'fa-user-slash');
    }

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest && e.target.closest('[data-rs10-deactivate]');
      if (!btn) return;
      // Let employees-ui handle its native toggle unless this is our inject only
      if (btn.classList.contains('emp-toggle-active')) return;
      e.preventDefault();
      const userId = btn.getAttribute('data-user-id') || btn.getAttribute('data-id');
      const staffUserId = btn.getAttribute('data-staff-user-id') || '';
      const name = btn.getAttribute('data-name') || 'Staff';
      if (!userId && !staffUserId) return;
      if (!confirm('Deactivate ' + name + '?\n\nThey cannot login. Active sessions will be revoked.'))
        return;
      try {
        await hardDeactivate({ empId: userId, staffUserId, name });
        const row = btn.closest('tr, .emp-line-row, .emp-card');
        if (row) row.classList.add('rs10-deactivated');
      } catch (err) {
        toast('Deactivate failed — open Employees → Logins and Suspend', 'fa-circle-exclamation');
      }
    });

    // Inject deactivate only on legacy tables missing native toggle
    const obs = new MutationObserver(() => {
      document
        .querySelectorAll('#employees-tab tr[data-id], #employees-tab [data-emp-id], #employees-tab .emp-line-row[data-id]')
        .forEach((row) => {
          if (row.querySelector('[data-rs10-deactivate], .emp-toggle-active')) return;
          const id = row.getAttribute('data-id') || row.getAttribute('data-emp-id');
          if (!id) return;
          const cell =
            row.querySelector('.rl-acts, td:last-child, .emp-actions') || row;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-ghost btn-sm';
          b.setAttribute('data-rs10-deactivate', '1');
          b.setAttribute('data-user-id', id);
          b.setAttribute('data-staff-user-id', row.getAttribute('data-staff-user-id') || '');
          b.setAttribute('data-name', row.getAttribute('data-name') || '');
          b.title = t('deactivate');
          b.innerHTML = '<i class="fa-solid fa-user-slash"></i>';
          cell.appendChild(b);
        });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ───────────── Mobile: Menu + Inventory (+ bills) as cards ───────────── */
  function installMobileDataCards() {
    if (document.documentElement.dataset.rs10Cards === '1') return;
    document.documentElement.dataset.rs10Cards = '1';

    function ensureCardsHost(tabEl, className, afterScroll) {
      let cards = tabEl.querySelector('.' + className);
      if (cards) return cards;
      cards = document.createElement('div');
      cards.className = className;
      cards.setAttribute('data-rs10-mobile-cards', '1');
      const scroll =
        afterScroll ||
        tabEl.querySelector('.table-scroll') ||
        tabEl.querySelector('.panel .table-scroll');
      if (scroll && scroll.parentNode) scroll.parentNode.insertBefore(cards, scroll.nextSibling || scroll);
      else tabEl.appendChild(cards);
      return cards;
    }

    function isMobileCards() {
      try {
        return window.matchMedia('(max-width: 760px)').matches;
      } catch (_) {
        return window.innerWidth <= 760;
      }
    }

    const enhanceBills = () => {
      const body = document.getElementById('bills-table-body');
      const wrap = document.getElementById('bills-tab');
      if (!body || !wrap) return;
      const cards = ensureCardsHost(wrap, 'rs10-bill-cards');
      if (!isMobileCards()) {
        cards.innerHTML = '';
        return;
      }
      const rows = Array.from(body.querySelectorAll('tr')).filter((tr) => tr.querySelectorAll('td').length >= 3).slice(0, 60);
      if (!rows.length) {
        cards.innerHTML = '<div class="rs10-empty-card">No bills yet</div>';
        return;
      }
      cards.innerHTML = rows
        .map((tr, idx) => {
          const cells = tr.querySelectorAll('td');
          const no = (cells[0] && cells[0].textContent) || '';
          const cust = (cells[1] && cells[1].textContent) || '';
          const amt = (cells[cells.length - 2] && cells[cells.length - 2].textContent) || '';
          const pay = (cells[3] && cells[3].textContent) || '';
          return `<button type="button" class="rs10-mcard rs10-bill-card" data-i="${idx}">
            <div class="rs10-mcard-top"><b>${esc(no.trim())}</b><span class="rs10-mcard-price">${esc(amt.trim())}</span></div>
            <div class="rs10-mcard-sub">${esc(cust.trim())}${pay ? ' · ' + esc(pay.trim()) : ''}</div>
          </button>`;
        })
        .join('');
      cards.querySelectorAll('[data-i]').forEach((btn) => {
        btn.onclick = () => {
          const tr = rows[+btn.getAttribute('data-i')];
          if (!tr) return;
          const clickable = tr.querySelector('button.go, button.icon-act, a, [data-open]');
          if (clickable) clickable.click();
          else tr.click();
        };
      });
    };

    /** Menu editor — full card with veg badge, price, stock, toggle + actions */
    const enhanceEditor = () => {
      const wrap = document.getElementById('editor-tab');
      const body = document.getElementById('editor-list');
      if (!wrap || !body) return;
      const listPanel = body.closest('.panel') || wrap;
      const cards = ensureCardsHost(listPanel, 'rs10-menu-cards', body.closest('.table-scroll'));
      if (!isMobileCards()) {
        cards.innerHTML = '';
        return;
      }
      const rows = Array.from(body.querySelectorAll('tr[data-id]'));
      if (!rows.length) {
        const empty = body.querySelector('.sr-empty');
        cards.innerHTML = empty
          ? `<div class="rs10-empty-card">${esc(empty.textContent || 'No menu items')}</div>`
          : '<div class="rs10-empty-card">No menu items yet</div>';
        return;
      }
      cards.innerHTML = rows
        .map((tr, idx) => {
          const id = tr.getAttribute('data-id') || '';
          const name = (tr.querySelector('b') && tr.querySelector('b').textContent) || '';
          const meta = (tr.querySelector('td div[style*="font-size:11px"]') &&
            tr.querySelector('td div[style*="font-size:11px"]').textContent) || '';
          const vegEl = tr.querySelector('.veg');
          const isNonVeg = vegEl && vegEl.classList.contains('nonveg');
          const cells = tr.querySelectorAll('td');
          const price = (cells[2] && cells[2].textContent) || '';
          const stockEl = tr.querySelector('.stock-dot');
          const stockTxt = stockEl ? stockEl.textContent.trim() : '';
          const stockCls = stockEl ? stockEl.className.replace('stock-dot', '').trim() : '';
          const av = tr.querySelector('input[data-av]');
          const checked = av && av.checked ? 'checked' : '';
          return `<article class="rs10-mcard rs10-menu-card" data-i="${idx}" data-id="${esc(id)}">
            <div class="rs10-mcard-top">
              <div class="rs10-mcard-title">
                <span class="veg ${isNonVeg ? 'nonveg' : ''}" aria-hidden="true"></span>
                <div>
                  <b>${esc(name.trim())}</b>
                  <div class="rs10-mcard-sub">${esc(meta.trim())}</div>
                </div>
              </div>
              <span class="rs10-mcard-price">${esc(price.trim())}</span>
            </div>
            <div class="rs10-mcard-row">
              <span class="stock-dot ${esc(stockCls)}">${esc(stockTxt || '—')}</span>
              <label class="rs10-mcard-toggle">
                <input type="checkbox" data-card-av ${checked}>
                <span>${checked ? 'Available' : 'Sold out'}</span>
              </label>
            </div>
            <div class="rs10-mcard-acts">
              <button type="button" class="btn btn-ghost btn-sm" data-card-edit><i class="fa-solid fa-pen"></i> Edit</button>
              <button type="button" class="btn btn-ghost btn-sm" data-card-recipe><i class="fa-solid fa-flask"></i> Recipe</button>
              <button type="button" class="btn btn-ghost btn-sm rs10-danger" data-card-del><i class="fa-solid fa-trash"></i></button>
            </div>
          </article>`;
        })
        .join('');
      cards.querySelectorAll('.rs10-menu-card').forEach((card) => {
        const tr = rows[+card.getAttribute('data-i')];
        if (!tr) return;
        const av = card.querySelector('[data-card-av]');
        if (av) {
          av.onchange = () => {
            const src = tr.querySelector('input[data-av]');
            if (!src) return;
            src.checked = av.checked;
            src.dispatchEvent(new Event('change', { bubbles: true }));
            const lab = card.querySelector('.rs10-mcard-toggle span');
            if (lab) lab.textContent = av.checked ? 'Available' : 'Sold out';
          };
        }
        const map = [
          ['[data-card-edit]', '[data-edit]'],
          ['[data-card-recipe]', '[data-recipe]'],
          ['[data-card-del]', '[data-del]'],
        ];
        map.forEach(([sel, srcSel]) => {
          const b = card.querySelector(sel);
          if (b)
            b.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              const src = tr.querySelector(srcSel);
              if (src) src.click();
            };
        });
      });
    };

    /** Inventory stock list as cards */
    const enhanceInv = () => {
      const wrap = document.getElementById('inventory-tab');
      if (!wrap) return;
      const tbody =
        document.getElementById('inv-table-body') ||
        wrap.querySelector('#inv-panel-stock tbody') ||
        wrap.querySelector('.inv-stock-table tbody');
      if (!tbody) return;
      const stockPanel = document.getElementById('inv-panel-stock') || tbody.closest('.panel') || wrap;
      const cards = ensureCardsHost(stockPanel, 'rs10-inv-cards', tbody.closest('.table-scroll'));
      if (!isMobileCards()) {
        cards.innerHTML = '';
        return;
      }
      // Hide cards when not on stock sub-tab
      const stockPane = document.getElementById('inv-panel-stock');
      if (stockPane && stockPane.style.display === 'none') {
        cards.innerHTML = '';
        cards.style.display = 'none';
        return;
      }
      cards.style.display = '';
      const rows = Array.from(tbody.querySelectorAll('tr[data-inv-id]'));
      if (!rows.length) {
        cards.innerHTML = '<div class="rs10-empty-card">No stock items yet — tap Add stock item</div>';
        return;
      }
      cards.innerHTML = rows
        .map((tr, idx) => {
          const name = (tr.querySelector('.inv-name') && tr.querySelector('.inv-name').textContent) || '';
          const cat = (tr.querySelector('.inv-cat-pill') && tr.querySelector('.inv-cat-pill').textContent) || '';
          const cells = tr.querySelectorAll('td');
          const stockTxt = (cells[2] && cells[2].querySelector('.td-strong') && cells[2].querySelector('.td-strong').textContent) ||
            (cells[2] && cells[2].textContent) || '';
          const minTxt = (cells[3] && cells[3].textContent) || '';
          const status = tr.querySelector('.stock-dot');
          const statusTxt = status ? status.textContent.trim() : '';
          const statusCls = status ? status.className.replace('stock-dot', '').trim() : '';
          const costBtn = tr.querySelector('[data-set-cost]');
          const costTxt = costBtn ? costBtn.textContent.replace(/\s+/g, ' ').trim() : '';
          const bar = tr.querySelector('td:nth-child(3) span[style*="width"]');
          const pct = bar && bar.style && bar.style.width ? bar.style.width : '0%';
          const barColor = bar && bar.style && bar.style.background ? bar.style.background : 'var(--green)';
          return `<article class="rs10-mcard rs10-inv-card" data-i="${idx}">
            <div class="rs10-mcard-top">
              <div>
                <b class="rs10-ic-name">${esc(name.trim())}</b>
                ${cat ? `<div class="rs10-mcard-sub">${esc(cat.trim())}</div>` : ''}
              </div>
              <span class="stock-dot ${esc(statusCls)}">${esc(statusTxt || '—')}</span>
            </div>
            <div class="rs10-inv-meter" aria-hidden="true"><span style="width:${esc(pct)};background:${esc(barColor)}"></span></div>
            <div class="rs10-mcard-meta">
              <span><i class="fa-solid fa-box"></i> ${esc(stockTxt.trim())}</span>
              <span>Min ${esc(minTxt.trim())}</span>
            </div>
            ${costTxt ? `<button type="button" class="rs10-inv-cost" data-card-cost>${esc(costTxt)}</button>` : ''}
            <div class="rs10-mcard-acts">
              <button type="button" class="btn btn-ghost btn-sm" data-card-batches><i class="fa-solid fa-layer-group"></i> Batches</button>
              <button type="button" class="btn btn-ghost btn-sm" data-card-restock><i class="fa-solid fa-truck"></i> Restock</button>
              <button type="button" class="btn btn-ghost btn-sm" data-card-edit><i class="fa-solid fa-pen"></i> Edit</button>
            </div>
          </article>`;
        })
        .join('');
      cards.querySelectorAll('.rs10-inv-card').forEach((card) => {
        const tr = rows[+card.getAttribute('data-i')];
        if (!tr) return;
        const wire = (sel, srcSel) => {
          const b = card.querySelector(sel);
          if (!b) return;
          b.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const src = tr.querySelector(srcSel);
            if (src) src.click();
          };
        };
        wire('[data-card-batches]', '.inv-name-btn, [data-batches]');
        wire('[data-card-restock]', '.icon-act.go');
        wire('[data-card-edit]', '.icon-act.inv-edit');
        wire('[data-card-cost]', '[data-set-cost]');
      });
    };

    const run = () => {
      if (!isMobileCards()) {
        document.querySelectorAll('[data-rs10-mobile-cards]').forEach((el) => {
          el.innerHTML = '';
        });
        return;
      }
      enhanceBills();
      enhanceEditor();
      enhanceInv();
    };
    const obs = new MutationObserver(() => {
      clearTimeout(run._t);
      run._t = setTimeout(run, 100);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => {
      clearTimeout(run._r);
      run._r = setTimeout(run, 200);
    });
    setTimeout(run, 400);
    document.addEventListener('rs:render-inventory', () => setTimeout(run, 80));
    document.addEventListener('rs:tab-change', () => setTimeout(run, 80));
  }

  /* ───────────── Settings mobile: ensure all sub-tabs work + labels ───────────── */
  function installSettingsMobileFix() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest && e.target.closest('.set-nav button[data-s]');
        if (!btn) return;
        // Ensure click always reaches show() — re-dispatch if label span swallowed
        const key = btn.getAttribute('data-s');
        if (!key) return;
        // Visual feedback
        const nav = btn.closest('.set-nav');
        if (nav) {
          nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        }
      },
      true
    );

    // On mobile show short labels not only icons
    const styleOnce = () => {
      document.documentElement.classList.add('rs10-ready');
    };
    styleOnce();
  }

  /* ───────────── Soft-delete confirmations ───────────── */
  function installSoftDeleteGuards() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest && e.target.closest('[data-danger-reset], #btn-reset-outlet, [data-wipe]');
        if (!btn) return;
        const role = String(session().role || sessionStorage.getItem('logged_in_role') || '').toLowerCase();
        if (!/owner|admin|superadmin/.test(role)) {
          e.preventDefault();
          e.stopPropagation();
          toast('Only owner/admin can wipe data', 'fa-lock');
          return;
        }
        // Extra confirm
        if (!btn.dataset.rs10Confirm) {
          e.preventDefault();
          e.stopPropagation();
          if (
            confirm(
              'This deletes outlet data. A backup should exist first.\n\nType OK in the next prompt to continue.'
            )
          ) {
            const typed = window.prompt('Type DELETE to confirm');
            if (typed === 'DELETE') {
              btn.dataset.rs10Confirm = '1';
              btn.click();
              setTimeout(() => {
                delete btn.dataset.rs10Confirm;
              }, 2000);
            }
          }
        }
      },
      true
    );
  }

  /* ───────────── QR amend rules helper (shared order) ───────────── */
  RS10.canAmendOrderLine = function (order, line) {
    const st = String((order && (order.status || order.kitchenStatus)) || '').toLowerCase();
    if (/ready|served|completed|paid|delivered/.test(st)) {
      return { ok: false, reason: 'Order already prepared / completed — cannot delete' };
    }
    if (/preparing|prep|accepted|cooking|in.?kitchen/.test(st)) {
      return {
        ok: false,
        reason: 'In kitchen preparation — ask staff to void, cannot delete from QR',
      };
    }
    if (line && line.fired && /preparing|prep/.test(String(line.status || '').toLowerCase())) {
      return { ok: false, reason: 'This item is already in prep' };
    }
    return { ok: true };
  };

  RS10.notifyOrderAmendment = function (detail) {
    try {
      document.dispatchEvent(new CustomEvent('rs:order-amended', { detail: detail || {} }));
    } catch (_) {}
    const who = (detail && detail.by) || 'someone';
    const table = (detail && detail.table) || '';
    toast('Order updated' + (table ? ' · ' + table : '') + ' · by ' + who, 'fa-bell');
    // Sound if available
    try {
      if (global.RSOps && typeof RSOps.playFloorChime === 'function') RSOps.playFloorChime();
    } catch (_) {}
  };

  /* ───────────── Update dialog polish ───────────── */
  function polishUpdates() {
    // Ensure app-update.json highlights always show a "What's new" guide link
    const orig = global.RS_SHOW_UPDATE_DIALOG;
    if (typeof orig !== 'function' || orig._rs10) return;
    global.RS_SHOW_UPDATE_DIALOG = function () {
      orig.apply(this, arguments);
      setTimeout(() => {
        const card = document.querySelector('.app-update-card');
        if (!card || card.querySelector('.rs10-update-guide')) return;
        const p = document.createElement('p');
        p.className = 'rs10-update-guide';
        p.style.cssText = 'font-size:12.5px;color:var(--text-soft);margin:8px 0 0';
        p.innerHTML =
          '<i class="fa-solid fa-circle-info"></i> After update: open <b>Help</b> in the sidebar for setup tips. Your open cart is saved on this device.';
        card.querySelector('.app-update-release')?.appendChild(p);
      }, 50);
    };
    global.RS_SHOW_UPDATE_DIALOG._rs10 = true;
  }

  /* ───────────── Cart mobile sheet fix ───────────── */
  function installMobileCartFix() {
    const bar = document.getElementById('pos-m-cart-bar');
    if (!bar || bar.dataset.rs10 === '1') return;
    bar.dataset.rs10 = '1';
    bar.addEventListener('click', () => {
      document.body.classList.add('rs10-cart-open');
      const cart =
        document.querySelector('.pos-cart-side, .pos-cart-sidebar, .pos-cart, #cart-panel') ||
        document.querySelector('#pos-tab .cart-panel');
      if (cart) {
        cart.classList.add('active', 'rs10-cart-sheet');
        cart.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
    // Close on backdrop
    document.addEventListener('click', (e) => {
      if (!document.body.classList.contains('rs10-cart-open')) return;
      const cart = document.querySelector('.rs10-cart-sheet');
      if (!cart) return;
      if (cart.contains(e.target) || (bar && bar.contains(e.target))) return;
      if (e.target.closest && e.target.closest('.pos-item, .menu-card, button, a, input, select'))
        return;
      document.body.classList.remove('rs10-cart-open');
      cart.classList.remove('rs10-cart-sheet');
    });
  }

  /* ───────────── Boot ───────────── */
  function boot() {
    if (document.documentElement.dataset.rs10 === '1') return;
    document.documentElement.dataset.rs10 = '1';
    document.documentElement.setAttribute('data-rs-lang', getLang());
    document.documentElement.setAttribute('lang', getLang() === 'hi' ? 'hi' : 'en');

    installMobileChrome();
    installSupportFeedback();
    installManualOnlineOrder();
    installReviewApprovalHooks();
    installStaffSecurity();
    installMobileDataCards();
    installSettingsMobileFix();
    installSoftDeleteGuards();
    installMobileCartFix();
    patchShiftFlow();
    polishUpdates();
    applyI18nDom();
    installTaxRateTools();
    installPrintCapabilityHint();

    // More menu items for online orders + settings
    const moreHost = document.querySelector('#mnav-more-panel, .mnav-more-body') || null;
    if (moreHost && !moreHost.querySelector('[data-tab="aggregator-tab"]')) {
      const b = document.createElement('button');
      b.className = 'mnav-more-btn';
      b.setAttribute('data-tab', 'aggregator-tab');
      b.innerHTML = '<i class="fa-solid fa-motorcycle"></i><span data-i18n="online_orders">Online Orders</span>';
      moreHost.appendChild(b);
    }
    if (moreHost && !moreHost.querySelector('[data-tab="settings-tab"]')) {
      const b = document.createElement('button');
      b.className = 'mnav-more-btn';
      b.setAttribute('data-tab', 'settings-tab');
      b.innerHTML = '<i class="fa-solid fa-gear"></i><span data-i18n="settings">Settings</span>';
      moreHost.appendChild(b);
    }

    console.info('[RS10] product-10x layer ready');
  }

  function installTaxRateTools() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-s="tax"], .set-nav button[data-s="tax"]');
      if (!btn) return;
      setTimeout(() => {
        const body = document.getElementById('set-body');
        if (!body || body.querySelector('#rs10-tax-tools')) return;
        const bar = document.createElement('div');
        bar.id = 'rs10-tax-tools';
        bar.style.cssText =
          'display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;padding:10px 12px;border:1px solid var(--stroke);border-radius:12px;background:var(--glass-2,rgba(0,0,0,.03))';
        bar.innerHTML =
          '<div style="flex:1;min-width:160px;font-size:12px;color:var(--text-soft)"><b style="color:var(--text)">Country tax rates</b><br>Export / import official rate codes for this outlet country</div>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="rs10-tax-export"><i class="fa-solid fa-file-csv"></i> Export rates</button>' +
          '<label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0"><i class="fa-solid fa-file-import"></i> Import<input type="file" id="rs10-tax-import" accept=".csv,text/csv" hidden></label>';
        body.insertBefore(bar, body.firstChild);
        const exp = bar.querySelector('#rs10-tax-export');
        if (exp) {
          exp.onclick = () => {
            const p = global.RS_getTenantTaxProfile && RS_getTenantTaxProfile();
            const c = (p && p.country) || 'IN';
            if (global.RSTaxCountry && RSTaxCountry.exportRatesCsv) {
              const n = RSTaxCountry.exportRatesCsv(c);
              toast('Exported ' + n + ' rates for ' + c, 'fa-file-csv');
            } else toast('Tax pack not loaded', 'fa-circle-exclamation');
          };
        }
        const imp = bar.querySelector('#rs10-tax-import');
        if (imp) {
          imp.onchange = async () => {
            const f = imp.files && imp.files[0];
            if (!f) return;
            const text = await f.text();
            if (global.RSTaxCountry && RSTaxCountry.importRatesCsv) {
              const n = RSTaxCountry.importRatesCsv(text);
              toast('Imported ' + n + ' tax rates', 'fa-file-import');
            }
            imp.value = '';
          };
        }
      }, 200);
    });
  }

  function installPrintCapabilityHint() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-s="printers"], .set-nav button[data-s="printers"]');
      if (!btn) return;
      setTimeout(() => {
        const body = document.getElementById('set-body');
        if (!body || body.querySelector('#rs10-print-cap')) return;
        let caps = 'Browser print dialog';
        try {
          if (global.AndroidInterface && typeof AndroidInterface.getPrintCapabilities === 'function') {
            caps = AndroidInterface.getPrintCapabilities();
          } else if (global.AndroidInterface) {
            caps = 'Android Print Service (Bluetooth / USB / Wi‑Fi printers in system settings)';
          } else if (global.RS_DESKTOP || global.rsDesktop) {
            caps = 'Desktop silent + RAW ESC/POS + shared USB';
          } else if (navigator.bluetooth) {
            caps = 'PWA: browser print + optional Web Bluetooth ESC/POS';
          }
        } catch (_) {}
        const tip = document.createElement('div');
        tip.id = 'rs10-print-cap';
        tip.style.cssText =
          'font-size:12.5px;color:var(--text-soft);margin:0 0 12px;padding:10px 12px;border-radius:12px;border:1px solid var(--stroke);background:var(--glass-2,rgba(0,0,0,.03));line-height:1.45';
        tip.innerHTML =
          '<b style="color:var(--text)">Print paths</b><br>' +
          esc(typeof caps === 'string' ? caps : JSON.stringify(caps)) +
          '<br><span style="font-size:11px">Phone: pair printer in Android Settings → Print, or use Bluetooth. Desktop: pick USB thermal in top bar.</span>' +
          '<div style="margin-top:8px"><button type="button" class="btn btn-ghost btn-sm" id="rs10-bt-pair"><i class="fa-brands fa-bluetooth-b"></i> Pair Bluetooth thermal</button></div>';
        body.insertBefore(tip, body.firstChild);
        const p = tip.querySelector('#rs10-bt-pair');
        if (p) {
          p.onclick = async () => {
            if (global.RSPrintBridge && RSPrintBridge.printWebBluetoothEscPos) {
              const r = await RSPrintBridge.printWebBluetoothEscPos(btoa('\nRestroSuite BT OK\n\n\n'));
              toast(r && r.ok ? 'Bluetooth printer ready' : (r && r.error) || 'BT pair failed', 'fa-bluetooth');
            } else toast('Bluetooth not available in this browser', 'fa-circle-exclamation');
          };
        }
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
  } else {
    setTimeout(boot, 100);
  }
  document.addEventListener('rs:ready', () => setTimeout(boot, 50));
  global.RS10 = RS10;
})(typeof window !== 'undefined' ? window : globalThis);
