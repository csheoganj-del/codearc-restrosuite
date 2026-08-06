/* ============================================================
   RestroSuite — Super-Admin WhatsApp Ads Portal
   ------------------------------------------------------------
   Upload contacts (CSV / Excel paste), compose message, send via
   central platform WhatsApp using the same human-crafted gateway
   path as bills (typing simulation, gaps, daily limits, uniqueness).

   Stats: total · queued · sent · failed · remaining · skipped
   Campaign history in localStorage (platform-wide).
   ============================================================ */
(function (global) {
  'use strict';

  const STYLE_ID = 'rs-sa-ads-style';
  const STORE_KEY = 'rs_sa_ads_campaigns_v1';
  const DRAFT_KEY = 'rs_sa_ads_draft_v8_nagpur_monthly';
  const DAILY_HINT = 180; // mirrors gateway default DAILY_LIMIT

  let contacts = []; // { name, phone, status, error, at }
  let sending = false;
  let cancelFlag = false;
  let currentCampaignId = null;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isSuper() {
    try {
      const r = String(
        (global.RS_API && RS_API.session && RS_API.session() && RS_API.session().role) ||
          sessionStorage.getItem('logged_in_role') ||
          ''
      ).toLowerCase();
      return r === 'superadmin' || r === 'super_admin' || r === 'brand_admin' || r === 'brandadmin';
    } catch (_) {
      return false;
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {return;}
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#sa-ads-tab .sa-ads-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;align-items:start}',
      '@media(max-width:960px){#sa-ads-tab .sa-ads-grid{grid-template-columns:1fr}}',
      '#sa-ads-tab .sa-ads-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}',
      '@media(max-width:700px){#sa-ads-tab .sa-ads-kpis{grid-template-columns:repeat(2,1fr)}}',
      '#sa-ads-tab .sa-ads-kpi{padding:12px 12px 10px;border-radius:14px;border:1px solid var(--stroke-2);background:var(--panel-solid,var(--panel));}',
      '#sa-ads-tab .sa-ads-kpi b{display:block;font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.1}',
      '#sa-ads-tab .sa-ads-kpi span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mute)}',
      '#sa-ads-tab .sa-ads-kpi.is-sent b{color:#0F9F6E}',
      '#sa-ads-tab .sa-ads-kpi.is-fail b{color:#c0392b}',
      '#sa-ads-tab .sa-ads-kpi.is-rem b{color:#FF4F00}',
      '#sa-ads-tab .sa-ads-kpi.is-queue b{color:#0284c7}',
      '#sa-ads-tab textarea.sa-ads-msg{width:100%;min-height:140px;resize:vertical;border:1px solid var(--stroke-2);border-radius:12px;padding:12px 14px;font:inherit;font-size:13.5px;line-height:1.5;background:var(--glass);color:var(--text);box-sizing:border-box}',
      '#sa-ads-tab .sa-ads-drop{border:1.5px dashed var(--stroke-2);border-radius:14px;padding:18px;text-align:center;background:var(--glass);cursor:pointer;transition:border-color .15s,background .15s}',
      '#sa-ads-tab .sa-ads-drop:hover,#sa-ads-tab .sa-ads-drop.is-drag{border-color:var(--orange);background:rgba(255,79,0,.05)}',
      '#sa-ads-tab .sa-ads-drop i{font-size:22px;color:var(--orange);margin-bottom:6px}',
      '#sa-ads-tab .sa-ads-table{width:100%;border-collapse:collapse;font-size:12.5px}',
      '#sa-ads-tab .sa-ads-table th,#sa-ads-tab .sa-ads-table td{padding:8px 10px;border-bottom:1px solid var(--stroke-2);text-align:left}',
      '#sa-ads-tab .sa-ads-table th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-mute)}',
      '#sa-ads-tab .st-pill{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:800;text-transform:uppercase}',
      '#sa-ads-tab .st-pill.pending{background:rgba(148,163,184,.15);color:#64748b}',
      '#sa-ads-tab .st-pill.queued{background:rgba(14,165,233,.12);color:#0284c7}',
      '#sa-ads-tab .st-pill.sending{background:rgba(255,79,0,.12);color:#FF4F00}',
      '#sa-ads-tab .st-pill.sent{background:rgba(15,159,110,.12);color:#0F9F6E}',
      '#sa-ads-tab .st-pill.failed{background:rgba(192,57,43,.12);color:#c0392b}',
      '#sa-ads-tab .st-pill.skipped{background:rgba(161,98,7,.12);color:#a16207}',
      '#sa-ads-tab .sa-ads-hint{font-size:12px;line-height:1.5;color:var(--text-soft);margin:0 0 12px}',
      '#sa-ads-tab .sa-ads-preview{padding:12px 14px;border-radius:14px;background:#0b141a;color:#e9edef;font-size:13px;line-height:1.5;white-space:pre-wrap;min-height:80px;border:1px solid rgba(255,255,255,.08)}',
      '#sa-ads-tab .sa-ads-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}',
      '#sa-ads-tab .sa-ads-safe{display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--text-mute);margin-top:10px}',
      '#sa-ads-tab .sa-ads-safe span{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:99px;background:var(--glass);border:1px solid var(--stroke-2)}',
      '#sa-ads-tab .sa-ads-safe i{color:#0F9F6E}',
      '#sa-ads-tab .table-scroll-max{max-height:340px;overflow:auto;border:1px solid var(--stroke-2);border-radius:12px}',
      '#sa-ads-tab .sa-ads-hist{font-size:12.5px}',
      '#sa-ads-tab .sa-ads-hist-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--stroke-2)}',
      '#sa-ads-tab .sa-ads-pace{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}',
      '#sa-ads-tab .sa-ads-pace label{font-size:12.5px;font-weight:600;color:var(--text-soft)}',
      '#sa-ads-tab .sa-ads-pace select{border:1px solid var(--stroke-2);border-radius:10px;padding:7px 10px;background:var(--glass);color:var(--text);font:inherit;font-size:13px}',
    ].join('\n');
    document.head.appendChild(s);
  }

  /** In-memory cache of server (+ local fallback) campaign history */
  let _campaignCache = null;

  function loadCampaignsLocal() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveCampaignsLocal(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify((list || []).slice(0, 40)));
    } catch (_) {}
  }

  function loadCampaigns() {
    if (Array.isArray(_campaignCache) && _campaignCache.length) {return _campaignCache;}
    return loadCampaignsLocal();
  }

  function saveCampaigns(list) {
    _campaignCache = (list || []).slice(0, 40);
    saveCampaignsLocal(_campaignCache);
  }

  /** Pull platform-wide history from Supabase (falls back to localStorage). */
  async function refreshCampaignsFromServer() {
    try {
      if (!isSuper() || !global.RS_API || typeof RS_API.admin !== 'function') {
        _campaignCache = loadCampaignsLocal();
        return _campaignCache;
      }
      const out = await RS_API.admin({ action: 'list_ads_campaigns', limit: 30 });
      const remote = (out && out.campaigns) || [];
      if (Array.isArray(remote) && remote.length) {
        _campaignCache = remote;
        saveCampaignsLocal(remote);
        return remote;
      }
      // Merge: keep local if server empty (pre-migration or first use)
      _campaignCache = loadCampaignsLocal();
      return _campaignCache;
    } catch (_) {
      _campaignCache = loadCampaignsLocal();
      return _campaignCache;
    }
  }

  async function persistCampaignToServer(camp) {
    try {
      if (!isSuper() || !global.RS_API || typeof RS_API.admin !== 'function') {return;}
      await RS_API.admin({
        action: 'save_ads_campaign',
        id: camp.id,
        label: camp.label,
        messagePreview: camp.messagePreview || '',
        total: camp.total || 0,
        sent: camp.sent || 0,
        failed: camp.failed || 0,
        skipped: camp.skipped || 0,
        pace: (document.getElementById('sa-ads-pace') || {}).value || 'safe',
        testOnly: /test/i.test(String(camp.label || '')),
      });
    } catch (e) {
      console.warn('WA Ads campaign server save failed (kept locally):', e && e.message);
    }
  }

  function normalizePhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) {return '';}
    // India 10-digit → 91
    if (d.length === 10) {d = '91' + d;}
    if (d.length < 11 || d.length > 15) {return '';}
    return d;
  }

  function parseContactsFromText(text) {
    const rows = [];
    const lines = String(text || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {continue;}
      // skip header-ish
      if (/^(name|phone|mobile|contact)/i.test(line) && i === 0) {continue;}
      let name = '';
      let phone = '';
      if (line.indexOf(',') >= 0 || line.indexOf('\t') >= 0 || line.indexOf(';') >= 0) {
        const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
        // find phone-like cell
        for (const p of parts) {
          if (normalizePhone(p)) {
            phone = normalizePhone(p);
          } else if (!name && p && !/^\d+$/.test(p)) {
            name = p;
          }
        }
        if (!phone && parts[1]) {phone = normalizePhone(parts[1]);}
        if (!name && parts[0] && !normalizePhone(parts[0])) {name = parts[0];}
        if (!phone && parts[0]) {phone = normalizePhone(parts[0]);}
      } else {
        phone = normalizePhone(line);
        name = '';
      }
      if (!phone) {continue;}
      rows.push({ name: name || 'Friend', phone: phone, status: 'pending', error: '', at: null });
    }
    return dedupeContacts(rows);
  }

  function parseContactsFromCsv(text) {
    if (global.RestroSuite && global.RestroSuite.imports && typeof global.RestroSuite.imports.parseCsv === 'function') {
      try {
        const parsed = global.RestroSuite.imports.parseCsv(text);
        if (parsed && parsed.length) {
          const rows = [];
          parsed.forEach((row) => {
            const get = (keys) => {
              for (const k of keys) {
                for (const [rk, rv] of Object.entries(row || {})) {
                  if (String(rk).toLowerCase().replace(/[^a-z0-9]/g, '') === k) {
                    if (rv != null && String(rv).trim()) {return String(rv).trim();}
                  }
                }
              }
              return '';
            };
            const name = get(['name', 'fullname', 'customer', 'contactname', 'owner']);
            const phone = normalizePhone(
              get(['phone', 'mobile', 'whatsapp', 'contact', 'number', 'phonenumber', 'mobileno'])
            );
            if (phone) {
              rows.push({ name: name || 'Friend', phone, status: 'pending', error: '', at: null });
            }
          });
          return dedupeContacts(rows);
        }
      } catch (_) {}
    }
    return parseContactsFromText(text);
  }

  function dedupeContacts(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((c) => {
      if (!c || !c.phone || seen.has(c.phone)) {return;}
      seen.add(c.phone);
      out.push(c);
    });
    return out;
  }

  function statsOf(list) {
    const L = list || contacts;
    const s = { total: L.length, pending: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };
    L.forEach((c) => {
      const st = c.status || 'pending';
      if (s[st] != null) {s[st]++;}
      else {s.pending++;}
    });
    s.remaining = s.pending + s.queued + s.sending;
    return s;
  }

  function personalize(template, contact) {
    const name = (contact && contact.name) || 'there';
    const first = String(name).trim().split(/\s+/)[0] || 'there';
    let msg = String(template || '');
    msg = msg
      .replace(/\{\{\s*name\s*\}\}/gi, name)
      .replace(/\{\{\s*first\s*\}\}/gi, first)
      .replace(/\{\{\s*phone\s*\}\}/gi, (contact && contact.phone) || '');
    // Light human variation — gateway also uniquifies; avoid looking bulk-identical
    if (Math.random() < 0.22 && !/[.!?…]$/.test(msg.trim())) {
      msg = msg.trim() + (Math.random() < 0.5 ? ' 🙏' : '');
    }
    return msg.trim();
  }

  function defaultMessage() {
    // Nagpur campaign — Man Singh (local salesperson)
    // 10/10 cold WA: pain → stakes → local + offline → free/monthly money → CTA → permission
    // Money line: free launch + month-to-month (no forced yearly) — never competitor-bash.
    // Optional VIP image: assets/wa-ads-nagpur-brochure.jpg
    return (
      'Hi {{first}} 👋\n\n' +
      'Quick one — when Wi‑Fi drops at *your* counter, does billing freeze?\n\n' +
      'That\'s the moment customers wait… and sometimes walk out.\n\n' +
      'I\'m *Man Singh Gurjar* from CodeArc (Nagpur). We built *RestroSuite* so local cafés can *keep billing offline* on phone or PC — even with no internet.\n\n' +
      '*Free during launch.* No card. After that, *month-to-month* — no forced yearly lock-in like most POS.\n\n' +
      'Open your free outlet → try *one sample bill* today:\n' +
      'https://restrosuite.codearc.co.in/login?tab=register\n\n' +
      'If it\'s not useful, ignore this — no pressure.\n\n' +
      '— Man Singh Gurjar · Nagpur\n' +
      '+91 73002 00949'
    );
  }

  function renderShell() {
    const tab = document.getElementById('sa-ads-tab');
    if (!tab) {return;}
    ensureStyle();
    const draft = (() => {
      try {
        return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      } catch (_) {
        return {};
      }
    })();
    tab.innerHTML =
      '<div class="panel panel-pad" style="margin-bottom:14px">' +
      '<div class="panel-head" style="margin-bottom:8px">' +
      '<h3 style="display:flex;align-items:center;gap:8px;margin:0"><i class="fa-brands fa-whatsapp" style="color:#25D366"></i> WhatsApp Ads Portal</h3>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="sa-ads-refresh-hist"><i class="fa-solid fa-rotate"></i> Refresh</button>' +
      '</div>' +
      '<p class="sa-ads-hint">Send launch ads from the <b>central platform WhatsApp</b>. Uses the same <b>human-crafted send engine</b> as bills: typing simulation, gaps between chats, message uniqueness, daily caps — lower ban risk than bulk API blasts.</p>' +
      '<div class="sa-ads-safe">' +
      '<span><i class="fa-solid fa-check"></i> Human pacing</span>' +
      '<span><i class="fa-solid fa-check"></i> Between-chat delays</span>' +
      '<span><i class="fa-solid fa-check"></i> Daily limit (~' +
      DAILY_HINT +
      '/day)</span>' +
      '<span><i class="fa-solid fa-check"></i> Live sent / remaining</span>' +
      '</div>' +
      '</div>' +
      '<div class="sa-ads-kpis" id="sa-ads-kpis"></div>' +
      '<div class="sa-ads-grid">' +
      '<div class="panel panel-pad">' +
      '<h4 style="margin:0 0 10px;font-size:14px">1 · Contacts</h4>' +
      '<div class="sa-ads-drop" id="sa-ads-drop" tabindex="0" role="button" aria-label="Upload contacts file">' +
      '<div><i class="fa-solid fa-file-arrow-up"></i></div>' +
      '<div style="font-weight:700;font-size:13.5px">Drop CSV / Excel text here</div>' +
      '<div style="font-size:12px;color:var(--text-mute);margin-top:4px">Columns: Name, Phone · or one phone per line</div>' +
      '<input type="file" id="sa-ads-file" accept=".csv,.txt,.tsv,text/csv,text/plain" style="display:none">' +
      '</div>' +
      '<div class="sa-ads-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" id="sa-ads-pick"><i class="fa-solid fa-folder-open"></i> Choose file</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="sa-ads-template"><i class="fa-solid fa-file-arrow-down"></i> CSV template</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="sa-ads-clear"><i class="fa-solid fa-trash"></i> Clear list</button>' +
      '</div>' +
      '<label style="display:block;margin:14px 0 6px;font-size:12.5px;font-weight:700;color:var(--text-soft)">Or paste contacts</label>' +
      '<textarea class="sa-ads-msg" id="sa-ads-paste" style="min-height:88px" placeholder="Name, Phone&#10;Ravi, 9876543210&#10;Priya, 9123456780"></textarea>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="sa-ads-parse-paste" style="margin-top:8px"><i class="fa-solid fa-list"></i> Add pasted contacts</button>' +
      '<div class="table-scroll-max" style="margin-top:14px">' +
      '<table class="sa-ads-table"><thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Status</th></tr></thead>' +
      '<tbody id="sa-ads-tbody"><tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-mute)">No contacts yet</td></tr></tbody></table>' +
      '</div>' +
      '</div>' +
      '<div class="panel panel-pad">' +
      '<h4 style="margin:0 0 10px;font-size:14px">2 · Message &amp; send</h4>' +
      '<p class="sa-ads-hint" style="margin-top:0">Use <code>{{first}}</code> or <code>{{name}}</code> for personalization. Keep it short and human — not spammy CAPS.</p>' +
      '<textarea class="sa-ads-msg" id="sa-ads-message" maxlength="3500">' +
      esc(draft.message || defaultMessage()) +
      '</textarea>' +
      '<div class="sa-ads-pace">' +
      '<label for="sa-ads-pace">Extra client gap (on top of gateway human delays)</label>' +
      '<select id="sa-ads-pace">' +
      '<option value="safe"' +
      ((draft.pace || 'safe') === 'safe' ? ' selected' : '') +
      '>Safe · ~8–15s between API calls</option>' +
      '<option value="balanced"' +
      (draft.pace === 'balanced' ? ' selected' : '') +
      '>Balanced · ~5–10s</option>' +
      '<option value="fast"' +
      (draft.pace === 'fast' ? ' selected' : '') +
      '>Faster · ~3–6s (higher risk)</option>' +
      '</select>' +
      '</div>' +
      '<label style="display:block;margin:14px 0 6px;font-size:12.5px;font-weight:700;color:var(--text-soft)">Preview (first contact)</label>' +
      '<div class="sa-ads-preview" id="sa-ads-preview"></div>' +
      '<div class="sa-ads-actions">' +
      '<button type="button" class="btn btn-primary" id="sa-ads-send"><i class="fa-brands fa-whatsapp"></i> Send now</button>' +
      '<button type="button" class="btn btn-ghost" id="sa-ads-pause" disabled><i class="fa-solid fa-pause"></i> Stop after current</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="sa-ads-test"><i class="fa-solid fa-vial"></i> Test to my number</button>' +
      '</div>' +
      '<p class="sa-ads-hint" id="sa-ads-status-line" style="margin-top:12px">Idle · gateway must be Ready</p>' +
      '<h4 style="margin:18px 0 8px;font-size:13px">Campaign history</h4>' +
      '<div class="sa-ads-hist" id="sa-ads-hist"></div>' +
      '</div>' +
      '</div>';

    wire();
    paintKpis();
    paintTable();
    paintPreview();
    paintHistory();
    try { paintHistoryAsync(); } catch (_) {}
  }

  function paintKpis() {
    const el = document.getElementById('sa-ads-kpis');
    if (!el) {return;}
    const s = statsOf();
    el.innerHTML =
      '<div class="sa-ads-kpi"><b>' +
      s.total +
      '</b><span>Total</span></div>' +
      '<div class="sa-ads-kpi is-sent"><b>' +
      s.sent +
      '</b><span>Sent</span></div>' +
      '<div class="sa-ads-kpi is-fail"><b>' +
      s.failed +
      '</b><span>Failed</span></div>' +
      '<div class="sa-ads-kpi is-rem"><b>' +
      s.remaining +
      '</b><span>Remaining</span></div>' +
      '<div class="sa-ads-kpi is-queue"><b>' +
      s.skipped +
      '</b><span>Skipped</span></div>';
  }

  function paintTable() {
    const tb = document.getElementById('sa-ads-tbody');
    if (!tb) {return;}
    if (!contacts.length) {
      tb.innerHTML =
        '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-mute)">No contacts yet — upload or paste</td></tr>';
      return;
    }
    // show last activity first when sending
    const view = contacts.slice(0, 500);
    tb.innerHTML = view
      .map((c, i) => {
        const st = c.status || 'pending';
        return (
          '<tr>' +
          '<td>' +
          (i + 1) +
          '</td>' +
          '<td>' +
          esc(c.name) +
          '</td>' +
          '<td>+' +
          esc(c.phone) +
          '</td>' +
          '<td><span class="st-pill ' +
          esc(st) +
          '">' +
          esc(st) +
          '</span>' +
          (c.error ? ' <span style="color:var(--text-mute);font-size:11px">' + esc(c.error).slice(0, 40) + '</span>' : '') +
          '</td></tr>'
        );
      })
      .join('');
  }

  function paintPreview() {
    const ta = document.getElementById('sa-ads-message');
    const prev = document.getElementById('sa-ads-preview');
    if (!ta || !prev) {return;}
    const sample = contacts[0] || { name: 'Ravi Sharma', phone: '919876543210' };
    prev.textContent = personalize(ta.value, sample) || '(empty message)';
  }

  function paintHistory() {
    const el = document.getElementById('sa-ads-hist');
    if (!el) {return;}
    const list = loadCampaigns();
    if (!list.length) {
      el.innerHTML = '<div style="color:var(--text-mute);padding:8px 0">No campaigns yet · history syncs across browsers after first send</div>';
      return;
    }
    el.innerHTML = list
      .slice(0, 12)
      .map((c) => {
        return (
          '<div class="sa-ads-hist-row">' +
          '<div><b>' +
          esc(c.label || 'Campaign') +
          '</b><div style="color:var(--text-mute);font-size:11.5px">' +
          esc(c.at || c.created_at || '') +
          '</div></div>' +
          '<div style="text-align:right;font-weight:700">' +
          '<span style="color:#0F9F6E">' +
          (c.sent || 0) +
          ' sent</span> · ' +
          '<span style="color:#c0392b">' +
          (c.failed || 0) +
          ' fail</span><div style="font-size:11px;color:var(--text-mute);font-weight:600">' +
          (c.total || 0) +
          ' contacts</div></div></div>'
        );
      })
      .join('');
  }

  async function paintHistoryAsync() {
    await refreshCampaignsFromServer();
    paintHistory();
  }

  function setStatusLine(msg) {
    const el = document.getElementById('sa-ads-status-line');
    if (el) {el.textContent = msg;}
  }

  function saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          message: (document.getElementById('sa-ads-message') || {}).value || '',
          pace: (document.getElementById('sa-ads-pace') || {}).value || 'safe',
        })
      );
    } catch (_) {}
  }

  function mergeContacts(newList) {
    contacts = dedupeContacts(contacts.concat(newList || []));
    paintKpis();
    paintTable();
    paintPreview();
    toast(newList.length + ' contact(s) loaded · ' + contacts.length + ' total unique', 'fa-address-book');
  }

  function wire() {
    const drop = document.getElementById('sa-ads-drop');
    const file = document.getElementById('sa-ads-file');
    const pick = document.getElementById('sa-ads-pick');
    if (pick && file) {
      pick.onclick = () => file.click();
    }
    if (drop && file) {
      drop.onclick = () => file.click();
      drop.ondragover = (e) => {
        e.preventDefault();
        drop.classList.add('is-drag');
      };
      drop.ondragleave = () => drop.classList.remove('is-drag');
      drop.ondrop = (e) => {
        e.preventDefault();
        drop.classList.remove('is-drag');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) {readFile(f);}
      };
      file.onchange = () => {
        if (file.files && file.files[0]) {readFile(file.files[0]);}
        file.value = '';
      };
    }
    const parsePaste = document.getElementById('sa-ads-parse-paste');
    if (parsePaste) {
      parsePaste.onclick = () => {
        const t = (document.getElementById('sa-ads-paste') || {}).value || '';
        const rows = parseContactsFromText(t);
        if (!rows.length) {
          toast('No valid phones found in paste', 'fa-circle-exclamation');
          return;
        }
        mergeContacts(rows);
      };
    }
    const clear = document.getElementById('sa-ads-clear');
    if (clear) {
      clear.onclick = () => {
        if (sending) {
          toast('Stop the campaign first', 'fa-circle-exclamation');
          return;
        }
        contacts = [];
        paintKpis();
        paintTable();
        toast('Contact list cleared', 'fa-trash');
      };
    }
    const tmpl = document.getElementById('sa-ads-template');
    if (tmpl) {
      tmpl.onclick = () => {
        const csv =
          '\uFEFFName,Phone\n' +
          'Ravi Sharma,9876543210\n' +
          'Priya Patel,9123456780\n' +
          'Amit Kumar,9988776655\n';
        if (global.RS && RS.downloadFile) {
          RS.downloadFile(csv, 'text/csv;charset=utf-8;', 'restrosuite-ads-contacts-template.csv');
        } else {
          const a = document.createElement('a');
          a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
          a.download = 'restrosuite-ads-contacts-template.csv';
          a.click();
        }
        toast('Template downloaded', 'fa-file-csv');
      };
    }
    const msg = document.getElementById('sa-ads-message');
    if (msg) {
      msg.oninput = () => {
        paintPreview();
        saveDraft();
      };
    }
    const pace = document.getElementById('sa-ads-pace');
    if (pace) {
      pace.onchange = saveDraft;
    }
    const send = document.getElementById('sa-ads-send');
    if (send) {send.onclick = () => startCampaign(false);}
    const pause = document.getElementById('sa-ads-pause');
    if (pause) {
      pause.onclick = () => {
        cancelFlag = true;
        setStatusLine('Stopping after current message…');
        toast('Will stop after current send', 'fa-pause');
      };
    }
    const test = document.getElementById('sa-ads-test');
    if (test) {test.onclick = () => startCampaign(true);}
    const hist = document.getElementById('sa-ads-refresh-hist');
    if (hist) {
      hist.onclick = async () => {
        await paintHistoryAsync();
        toast('History refreshed', 'fa-rotate');
      };
    }
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = parseContactsFromCsv(text);
      if (!rows.length) {
        toast('No valid phone numbers in file', 'fa-circle-exclamation');
        return;
      }
      mergeContacts(rows);
    };
    reader.onerror = () => toast('Could not read file', 'fa-circle-exclamation');
    reader.readAsText(file);
  }

  function paceMs() {
    const mode = (document.getElementById('sa-ads-pace') || {}).value || 'safe';
    if (mode === 'fast') {return 3000 + Math.floor(Math.random() * 3000);}
    if (mode === 'balanced') {return 5000 + Math.floor(Math.random() * 5000);}
    return 8000 + Math.floor(Math.random() * 7000); // safe
  }

  function sleep(ms) {
    return new Promise((r) => { setTimeout(r, ms); });
  }

  function last10(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    return d.length > 10 ? d.slice(-10) : d;
  }

  /** Platform line status (system tenant). Returns { ready, number, error } */
  async function fetchPlatformStatus() {
    try {
      if (!global.RS_API) {
        return { ready: false, number: null, error: 'API not configured' };
      }
      // Super-admin session is NOT a tenant session — use tenant-admin.
      // Tenant staff (if ever allowed) use tenant-data with via_platform.
      let res;
      if (isSuper() && typeof RS_API.admin === 'function') {
        res = await RS_API.admin({ action: 'gateway_status' });
      } else if (typeof RS_API.data === 'function') {
        res = await RS_API.data({
          operation: 'gateway_status',
          via_platform: true,
        });
      } else {
        return { ready: false, number: null, error: 'API not configured' };
      }
      const d = res && (res.status || res.platformReady != null ? res : res.data) || res || {};
      const number = d.platformNumber || d.number || d.phone || d.wa_number || null;
      const ready =
        d.platformReady === true ||
        d.canAutomate === true ||
        d.status === 'ready' ||
        d.live === true ||
        d.authenticated === true;
      return { ready: !!ready, number: number ? String(number).replace(/\D/g, '') : null, raw: d };
    } catch (e) {
      return { ready: false, number: null, error: (e && e.message) || 'Gateway status failed' };
    }
  }

  async function sendOne(phone, message) {
    if (!global.RS_API) {
      throw new Error('API not configured');
    }
    let res;
    // Super-admin WA Ads must go through tenant-admin (superadmin token).
    // tenant-data requires a tenant staff session and returns "Tenant session required."
    if (isSuper() && typeof RS_API.admin === 'function') {
      res = await RS_API.admin({
        action: 'gateway_send',
        phone: phone,
        message: message,
        // Prevent gateway bill-wrapper ("Here's your bill…") on marketing blasts
        kind: 'ad',
        purpose: 'marketing',
      });
    } else if (typeof RS_API.data === 'function') {
      res = await RS_API.data({
        operation: 'gateway_send',
        via_platform: true,
        phone: phone,
        message: message,
        kind: 'ad',
        purpose: 'marketing',
      });
    } else {
      throw new Error('API not configured');
    }
    // Accept common success shapes (edge wraps as { data: gatewayJson } or flat gatewayJson)
    const g = res && res.data && (res.data.status || res.data.ok != null) ? res.data : res;
    const ok =
      g &&
      (g.status === 'success' ||
        g.status === 'ok' ||
        g.ok === true ||
        g.sent === true ||
        g.delivered === true ||
        /initiat|queued|sent|deliver/i.test(String(g.message || '')));
    if (!ok) {
      const err =
        (g && (g.error || g.message)) ||
        (res && (res.error || res.message)) ||
        'Gateway did not accept send';
      throw new Error(String(err));
    }
    return res;
  }

  async function startCampaign(testOnly) {
    if (sending) {
      toast('A campaign is already running', 'fa-circle-info');
      return;
    }
    if (!isSuper()) {
      toast('Super-admin only', 'fa-lock');
      return;
    }
    const template = ((document.getElementById('sa-ads-message') || {}).value || '').trim();
    if (!template || template.length < 10) {
      toast('Write a message first (min 10 characters)', 'fa-circle-exclamation');
      return;
    }

    let list;
    // Pre-flight: platform gateway must be Ready
    setStatusLine('Checking platform WhatsApp…');
    const plat = await fetchPlatformStatus();
    if (plat.error && !plat.ready) {
      toast('Gateway check: ' + plat.error, 'fa-circle-exclamation');
    }
    if (!plat.ready) {
      const why =
        plat.error ||
        'Platform WhatsApp is not Ready. Open Super-Admin → Gateway, scan QR on the PC tray, wait until Ready.';
      toast(why, 'fa-circle-exclamation');
      setStatusLine('Blocked · platform line not ready');
      window.alert('Cannot send ads yet.\n\n' + why);
      return;
    }
    const platformLast10 = plat.number ? last10(plat.number) : '';
    setStatusLine(
      'Platform Ready' +
        (plat.number ? ' · +' + plat.number : '') +
        ' · human-send'
    );

    if (testOnly) {
      const phone = window.prompt(
        'Send ONE test to YOUR personal WhatsApp (with country code).\n\n' +
          'Do NOT use the gateway/platform number' +
          (platformLast10 ? ' (…' + platformLast10 + ')' : '') +
          ' — self-chat is blocked.\n\nExample: 9198XXXXXXXX'
      );
      const p = normalizePhone(phone);
      if (!p) {
        toast('Invalid test number', 'fa-circle-exclamation');
        return;
      }
      if (platformLast10 && last10(p) === platformLast10) {
        const msg =
          'That number is the same as the platform WhatsApp line (…' +
          platformLast10 +
          ').\n\nWhatsApp cannot deliver a message to itself.\n\nEnter your personal mobile instead.';
        toast('Self-chat blocked — use your personal number', 'fa-circle-exclamation');
        window.alert(msg);
        setStatusLine('Blocked · cannot test to platform line itself');
        return;
      }
      list = [{ name: 'Test', phone: p, status: 'pending', error: '', at: null }];
    } else {
      list = contacts.filter((c) => c.status === 'pending' || c.status === 'failed');
      if (!list.length) {
        toast('Add contacts first (or all already sent)', 'fa-circle-exclamation');
        return;
      }
      if (list.length > DAILY_HINT) {
        const ok = window.confirm(
          'You are about to send to ' +
            list.length +
            ' numbers.\n\nGateway daily limit is ~' +
            DAILY_HINT +
            ' messages per line (human-send safety).\nContinue? Prefer Safe pace.'
        );
        if (!ok) {return;}
      } else {
        const ok = window.confirm(
          'Send WhatsApp ads to ' +
            list.length +
            ' contacts via central platform number?\n\nHuman pacing is ON (gateway typing + gaps). Extra client delay: ' +
            ((document.getElementById('sa-ads-pace') || {}).value || 'safe') +
            '.'
        );
        if (!ok) {return;}
      }
    }

    sending = true;
    cancelFlag = false;
    currentCampaignId = 'camp_' + Date.now();
    const sendBtn = document.getElementById('sa-ads-send');
    const pauseBtn = document.getElementById('sa-ads-pause');
    if (sendBtn) {sendBtn.disabled = true;}
    if (pauseBtn) {pauseBtn.disabled = false;}

    const prog =
      global.RSProgress &&
      RSProgress.open({
        title: testOnly ? 'Sending test ad…' : 'Sending WhatsApp ads…',
        sub: 'Human-crafted pacing · central platform line',
        total: list.length,
        unit: 'messages',
      });
    const updateProgressFailure = function (message) {
      if (!prog) {return;}
      if (typeof prog.fail === 'function') {
        prog.fail(message);
      } else if (typeof prog.update === 'function') {
        prog.update({ sub: message });
      }
    };

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    setStatusLine('Sending… gateway human-send active');

    for (let i = 0; i < list.length; i++) {
      if (cancelFlag) {
        setStatusLine('Stopped · ' + sent + ' sent · ' + failed + ' failed · remaining not sent');
        break;
      }
      const c = list[i];
      // map back to contacts array entry
      const row = contacts.find((x) => x.phone === c.phone) || c;
      row.status = 'sending';
      paintTable();
      paintKpis();
      const body = personalize(template, row);
      if (prog) {
        prog.update({
          done: i,
          failed: failed,
          current: (row.name || '') + ' +' + row.phone,
          sub:
            'Human send ' +
            (i + 1) +
            ' of ' +
            list.length +
            ' · ' +
            (list.length - i) +
            ' remaining (gateway adds typing + gaps)',
        });
      }
      try {
        // Skip self-chat mid-campaign (platform line)
        if (platformLast10 && last10(row.phone) === platformLast10) {
          throw new Error(
            'Skipped: same as platform WhatsApp line (…' +
              platformLast10 +
              '). Cannot send to the gateway number itself.'
          );
        }
        await sendOne(row.phone, body);
        row.status = 'sent';
        row.error = '';
        row.at = new Date().toISOString();
        sent++;
      } catch (e) {
        const msg = (e && e.message) || 'Send failed';
        // Daily limit — stop campaign cleanly
        if (/daily.*limit/i.test(msg)) {
          row.status = 'failed';
          row.error = msg;
          failed++;
          setStatusLine('Stopped: ' + msg);
          updateProgressFailure(msg);
          cancelFlag = true;
        } else {
          row.status = 'failed';
          row.error = msg.slice(0, 200);
          failed++;
          if (testOnly) {
            setStatusLine('Test failed: ' + msg.slice(0, 140));
            updateProgressFailure(msg.slice(0, 160));
            try {
              window.alert('Test send failed:\n\n' + msg);
            } catch (_) { /* ignore */ }
          }
        }
      }
      paintTable();
      paintKpis();
      if (prog) {
        prog.update({
          done: i + 1,
          failed: failed,
          current: (row.name || '') + ' +' + row.phone,
          sub:
            sent +
            ' sent · ' +
            failed +
            ' failed · ' +
            Math.max(0, list.length - i - 1) +
            ' remaining',
        });
      }
      if (cancelFlag) {break;}
      // Client-side gap ON TOP of gateway humanSend delays (doesn't replace them)
      if (i < list.length - 1) {
        const wait = paceMs();
        setStatusLine(
          'Pacing ' +
            Math.round(wait / 1000) +
            's before next (gateway also applies human delays)…'
        );
        await sleep(wait);
      }
    }

    sending = false;
    if (sendBtn) {sendBtn.disabled = false;}
    if (pauseBtn) {pauseBtn.disabled = true;}

    // Finish the blocking overlay before campaign-history bookkeeping. A history
    // render/storage error must never leave a completed send stuck at 100%.
    if (prog) {
      const closeDelay = failed ? (sent ? 1400 : 1800) : (testOnly ? 650 : 1100);
      const progressRoot = document.getElementById('rs-progress-ops-root');
      try {
        if (failed) {
          updateProgressFailure(sent + ' sent · ' + failed + ' failed');
        } else if (typeof prog.succeed === 'function') {
          prog.succeed(
            sent + (testOnly ? ' test message sent' : ' messages handed to human-send engine')
          );
        } else if (typeof prog.update === 'function') {
          prog.update({
            done: list.length,
            failed: 0,
            sub: sent + (testOnly ? ' test message sent' : ' messages sent'),
          });
        }
      } catch (_) { /* completion UI must never block cleanup */ }
      // Schedule cleanup ourselves: legacy close() is immediate, while newer
      // implementations accept a delay. This works with both cached versions.
      setTimeout(function () {
        try {
          if (typeof prog.close === 'function') {prog.close();}
        } catch (_) { /* ignore stale progress implementation errors */ }
        if (progressRoot && progressRoot.isConnected) {progressRoot.remove();}
      }, closeDelay);
    }

    // Publish the final state before local/cloud history work. History is useful
    // but must not leave the primary send control looking active if it fails.
    setStatusLine(
      'Done · ' +
        sent +
        ' sent · ' +
        failed +
        ' failed · ' +
        statsOf().remaining +
        ' still pending'
    );
    toast(
      'Ads: ' + sent + ' sent · ' + failed + ' failed (human-paced)',
      failed ? 'fa-circle-exclamation' : 'fa-brands fa-whatsapp'
    );

    const camp = {
      id: currentCampaignId,
      label: testOnly ? 'Test send' : 'Ads blast',
      at: new Date().toLocaleString('en-IN'),
      total: list.length,
      sent: sent,
      failed: failed,
      skipped: skipped,
      messagePreview: template.slice(0, 120),
    };
    const hist = loadCampaigns();
    hist.unshift(camp);
    saveCampaigns(hist);
    paintHistory();
    // Platform-wide history (Supabase) — non-blocking
    try { persistCampaignToServer(camp); } catch (_) {}

  }

  function renderSaAds() {
    if (!isSuper()) {return;}
    renderShell();
  }

  function boot() {
    if (!document.getElementById('sa-ads-tab')) {return;}
    if (global.RS && typeof RS.addRenderer === 'function') {
      RS.addRenderer('sa-ads-tab', renderSaAds);
    }
    // If already on tab
    try {
      if (document.getElementById('sa-ads-tab')?.classList.contains('active')) {
        renderSaAds();
      }
    } catch (_) {}
  }

  global.RSSaAdsPortal = {
    render: renderSaAds,
    parseContactsFromText: parseContactsFromText,
    statsOf: statsOf,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('rs:ready', boot);
  document.addEventListener('rs:hydrated', function () {
    setTimeout(boot, 200);
  });
})(typeof window !== 'undefined' ? window : globalThis);
