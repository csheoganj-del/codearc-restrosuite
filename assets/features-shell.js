/* ============================================================
   RestroSuite -- App shell: global search, notifications, Settings
   ============================================================ */
(function(){
  'use strict';
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
    const safe = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

    /* ===================== GLOBAL SEARCH (pages · settings · menu · bills) ===================== */
    const searchWrap = $('.tb-search');
    const searchInput = searchWrap && searchWrap.querySelector('input');
    if (searchInput) {
      searchInput.placeholder = 'Search settings, menu, bills…';
      searchInput.setAttribute('aria-label', 'Search anything — settings, menu, pages, bills');
      searchInput.title = 'Search anything (Ctrl+K)';
      searchWrap.classList.add('tb-search-global');
      searchWrap.style.position = 'relative';

      const box = document.createElement('div');
      box.className = 'search-results';
      box.setAttribute('role', 'listbox');
      box.setAttribute('aria-label', 'Search results');
      searchWrap.appendChild(box);

      const PAGES = [
        ['pos-tab', 'Point of Sale', 'cash-register', 'billing cart pay'],
        ['floor-tab', 'Floor & Tables', 'chair', 'dine-in tables'],
        ['qr-orders-tab', 'QR Orders', 'qrcode', 'table order guest'],
        ['aggregator-tab', 'Online Orders', 'bowl-rice', 'swiggy zomato delivery'],
        ['kds-tab', 'Kitchen Display', 'fire-burner', 'kot cook'],
        ['bills-tab', 'Bills', 'file-invoice-dollar', 'history refund'],
        ['inventory-tab', 'Inventory', 'boxes-stacked', 'stock'],
        ['editor-tab', 'Menu Editor', 'pen-to-square', 'items prices'],
        ['customers-tab', 'Customers', 'address-book', 'crm'],
        ['reports-tab', 'Reports', 'chart-line', 'sales gstr'],
        ['employees-tab', 'Employees', 'users', 'staff login payroll'],
        ['growth-hub-tab', 'Growth Hub', 'rocket', 'offers campaigns'],
        ['settings-tab', 'Settings', 'gear', 'preferences'],
        ['tax-tab', 'Tax & GST', 'percent', 'tax invoice'],
      ];

      // Settings jump targets: section + optional skey/find text to scroll + highlight
      const SETTINGS = [
        { sec: 'profile', title: 'Outlet profile', sub: 'Name, address, phone, country', kw: 'profile outlet name address phone email gstin cuisine wifi qr', find: 'Identity' },
        { sec: 'tax', title: 'Taxes & pricing', sub: 'GST, tax, round-off, loyalty, promo', kw: 'tax gst calculate taxes service charge round-off hsn inclusive happy hour loyalty promo coupon', find: 'Tax engine' },
        { sec: 'printer', title: 'Printers & KOT', sub: 'Billing only, shift, print, drawer', kw: 'printer kot receipt thermal shift require open shift auto-print cash drawer paper billing only kitchen', find: 'Kitchen & billing' },
        { sec: 'gateway', title: 'WhatsApp', sub: 'Link number, send bill, alerts', kw: 'whatsapp gateway send bill after payment order ready promotional messages', find: 'Connection' },
        { sec: 'payments', title: 'Payments', sub: 'UPI / card settlement', kw: 'razorpay stripe upi payments bank', find: 'Card' },
        { sec: 'security', title: 'Security & PIN', sub: 'Admin PIN, pin gates', kw: 'pin security lock idle', find: 'Admin PIN' },
        { sec: 'team', title: 'Team & roles', sub: 'Staff permissions, refunds PIN', kw: 'team cashier edit prices require pin refunds lock reports staff', find: 'Cashier permissions' },
        { sec: 'plan', title: 'Plan & billing', sub: 'Subscription plan', kw: 'plan upgrade subscription', find: 'workspace plan' },
        { sec: 'danger', title: 'Danger zone', sub: 'Reset outlet data', kw: 'danger reset wipe delete data', find: 'Reset operational' },
        // Direct feature shortcuts → open pane + highlight exact row
        { sec: 'printer', title: 'Require open shift', sub: 'Settings · Printers', kw: 'shift open float z-report', icon: 'fa-unlock', skey: 'set_require_open_shift', find: 'Require open shift' },
        { sec: 'printer', title: 'Operating mode / Billing only', sub: 'Settings · Printers', kw: 'billing only kitchen printer full ops', icon: 'fa-sliders', skey: 'set_operating_mode', find: 'Operating mode' },
        { sec: 'printer', title: 'Auto-print receipt', sub: 'Settings · Printers', kw: 'auto print receipt thermal', icon: 'fa-print', skey: 'set_auto_print_receipt', find: 'Auto-print receipt' },
        { sec: 'printer', title: 'Auto-print KOT', sub: 'Settings · Printers', kw: 'auto print kot kitchen', icon: 'fa-receipt', skey: 'set_auto_print_kot', find: 'Auto-print KOT' },
        { sec: 'printer', title: 'Open cash drawer on cash', sub: 'Settings · Printers', kw: 'cash drawer pulse', icon: 'fa-cash-register', skey: 'set_open_cash_drawer_on_cash', find: 'Open cash drawer' },
        { sec: 'tax', title: 'Calculate taxes / GST', sub: 'Settings · Taxes', kw: 'tax gst calculate', icon: 'fa-percent', skey: 'set_calculate_taxes', find: 'Calculate taxes' },
        { sec: 'tax', title: 'Service charge', sub: 'Settings · Taxes', kw: 'service charge', icon: 'fa-receipt', skey: 'set_service_charge', find: 'Service charge' },
        { sec: 'tax', title: 'Round-off totals', sub: 'Settings · Taxes', kw: 'round off', icon: 'fa-coins', skey: 'set_round_off_totals', find: 'Round-off' },
        { sec: 'tax', title: 'Show HSN codes', sub: 'Settings · Taxes', kw: 'hsn sac invoice', icon: 'fa-barcode', skey: 'set_show_hsn_codes', find: 'Show HSN' },
        { sec: 'tax', title: 'Loyalty program', sub: 'Settings · Taxes', kw: 'loyalty points', icon: 'fa-star', skey: 'set_loyalty_program', find: 'Loyalty program' },
        { sec: 'tax', title: 'POS promo codes', sub: 'Settings · Taxes', kw: 'promo coupon offer code', icon: 'fa-tag', skey: 'set_pos_promo_codes', find: 'POS promo' },
        { sec: 'tax', title: 'Happy hour', sub: 'Settings · Taxes', kw: 'happy hour discount', icon: 'fa-clock', skey: 'set_happy_hour', find: 'Happy hour' },
        { sec: 'gateway', title: 'Send bill after payment', sub: 'Settings · WhatsApp', kw: 'whatsapp auto bill send', icon: 'fa-whatsapp', skey: 'set_send_bill_after_payment', find: 'Send bill after payment' },
        { sec: 'gateway', title: 'Order ready alerts', sub: 'Settings · WhatsApp', kw: 'order ready message', icon: 'fa-bell', skey: 'set_order_ready_alerts', find: 'Order ready' },
        { sec: 'gateway', title: 'Promotional messages', sub: 'Settings · WhatsApp', kw: 'promotional campaign broadcast', icon: 'fa-bullhorn', skey: 'set_promotional_messages', find: 'Promotional messages' },
        { sec: 'team', title: 'Require PIN for refunds', sub: 'Settings · Team', kw: 'pin refund void', icon: 'fa-key', skey: 'set_require_pin_for_refunds', find: 'Require PIN for refunds' },
        { sec: 'team', title: 'Cashier can edit prices', sub: 'Settings · Team', kw: 'price edit cashier override', icon: 'fa-indian-rupee-sign', skey: 'set_cashier_can_edit_prices', find: 'Cashier can edit prices' },
        { sec: 'team', title: 'Lock reports for staff', sub: 'Settings · Team', kw: 'lock reports staff', icon: 'fa-lock', skey: 'set_lock_reports_for_staff', find: 'Lock reports for staff' },
      ];

      function clearSearchHighlight() {
        document.querySelectorAll('.rs-search-hit').forEach((el) => {
          el.classList.remove('rs-search-hit');
        });
      }

      function highlightSettingsTarget(opts) {
        opts = opts || {};
        const skey = opts.skey || '';
        const find = String(opts.find || opts.title || '').trim().toLowerCase();
        const root = document.getElementById('set-body') || document.getElementById('settings-tab');
        if (!root) return false;

        clearSearchHighlight();

        let target = null;
        if (skey) {
          const ctrl = root.querySelector('[data-skey="' + skey.replace(/"/g, '') + '"]');
          if (ctrl) {
            target =
              ctrl.closest('.set-row') ||
              ctrl.closest('.set-field') ||
              ctrl.closest('.set-block') ||
              ctrl;
          }
        }
        if (!target && find) {
          // Match toggle title (.st), field label (.fl), or block heading (h4)
          const nodes = root.querySelectorAll('.set-row, .set-field, .set-block, .set-block-head, h4');
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const text = (n.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (text.includes(find) || find.split(/\s+/).every((w) => w.length < 2 || text.includes(w))) {
              target =
                n.classList && n.classList.contains('set-block-head')
                  ? n.closest('.set-block') || n
                  : n;
              // Prefer the tightest set-row when possible
              if (n.classList && n.classList.contains('set-row')) {
                target = n;
                break;
              }
              if (n.classList && n.classList.contains('set-field')) {
                target = n;
                break;
              }
            }
          }
        }
        if (!target) return false;

        target.classList.add('rs-search-hit');
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {
          try {
            target.scrollIntoView(true);
          } catch (__) {}
        }
        // Focus interactive control when present
        try {
          const focusEl =
            target.querySelector('input, select, textarea, button, .toggle') || target;
          if (focusEl && typeof focusEl.focus === 'function') {
            setTimeout(() => {
              try {
                focusEl.focus({ preventScroll: true });
              } catch (_) {
                focusEl.focus();
              }
            }, 280);
          }
        } catch (_) {}

        // Pulse then clear highlight
        setTimeout(() => {
          if (target && target.classList) target.classList.remove('rs-search-hit');
        }, 4200);
        return true;
      }

      function openSettingsSection(sec, highlight) {
        highlight = highlight || {};
        window.__rsOpenSettingsSection = sec || 'profile';
        window.__rsSettingsHighlight = highlight;
        return Promise.resolve(RS.activateTab('settings-tab')).then(() => {
          let tries = 0;
          const go = () => {
            const b = document.querySelector('.set-nav button[data-s="' + sec + '"]');
            if (b) {
              b.click();
              // Wait for pane render, then scroll + highlight
              let hTries = 0;
              const tryHighlight = () => {
                const ok = highlightSettingsTarget(window.__rsSettingsHighlight || highlight);
                if (ok || ++hTries > 20) {
                  window.__rsSettingsHighlight = null;
                  return;
                }
                setTimeout(tryHighlight, 80);
              };
              setTimeout(tryHighlight, 60);
              return;
            }
            if (++tries < 25) setTimeout(go, 70);
          };
          setTimeout(go, 50);
        });
      }
      window.RS_openSettingsSection = openSettingsSection;
      window.RS_highlightSettingsTarget = highlightSettingsTarget;
      if (RS) {
        RS.openSettingsSection = openSettingsSection;
        RS.highlightSettingsTarget = highlightSettingsTarget;
      }

      function match(hay, t) {
        return String(hay || '').toLowerCase().includes(t);
      }

      let activeIdx = -1;
      function items() {
        return $$('.sr-item', box);
      }
      function setActive(i) {
        const list = items();
        list.forEach((el, n) => el.classList.toggle('sel', n === i));
        activeIdx = i;
        if (list[i]) list[i].scrollIntoView({ block: 'nearest' });
      }
      function runPick(el) {
        if (!el) return;
        const kind = el.dataset.kind || 'tab';
        const go = el.dataset.go || '';
        const sec = el.dataset.sec || '';
        const q = el.dataset.q || '';
        const skey = el.dataset.skey || '';
        const find = el.dataset.find || (el.querySelector('.si-t') && el.querySelector('.si-t').textContent) || '';
        box.classList.remove('show');
        searchInput.value = '';
        activeIdx = -1;
        if (kind === 'settings' || sec) {
          openSettingsSection(sec || 'profile', { skey: skey, find: find, title: find });
          return;
        }
        if (kind === 'menu') {
          RS.activateTab('pos-tab');
          setTimeout(() => {
            const posIn = document.getElementById('pos-search-input');
            if (posIn) {
              posIn.value = q || '';
              posIn.dispatchEvent(new Event('input', { bubbles: true }));
              posIn.focus();
              // Soft highlight menu grid if present
              try {
                const cards = document.querySelectorAll('#pos-tab .menu-card, #pos-tab .pos-item, #pos-tab [data-item-id]');
                cards.forEach((c) => c.classList.remove('rs-search-hit'));
                const needle = String(q || '').toLowerCase();
                for (const c of cards) {
                  if ((c.textContent || '').toLowerCase().includes(needle)) {
                    c.classList.add('rs-search-hit');
                    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => c.classList.remove('rs-search-hit'), 3500);
                    break;
                  }
                }
              } catch (_) {}
            }
          }, 120);
          return;
        }
        if (go) RS.activateTab(go);
      }

      function run(q) {
        const t = q.trim().toLowerCase();
        if (!t) {
          box.classList.remove('show');
          box.innerHTML = '';
          activeIdx = -1;
          return;
        }

        const menu = (RS.MENU || [])
          .filter((m) => match(m.name, t) || match(m.cat, t) || match(m.code, t) || match(m.itemCode, t))
          .slice(0, 5);
        const bills = (RS.BILLS || [])
          .filter(
            (b) =>
              match(b.no, t) ||
              match(b.table, t) ||
              match(b.customerName, t) ||
              match(b.customerPhone, t)
          )
          .slice(0, 4);
        const inv = (RS.INVENTORY || [])
          .filter((i) => match(i.name, t) || match(i.cat, t))
          .slice(0, 3);
        const team = (RS.EMPLOYEES || [])
          .filter((e) => match(e.name, t) || match(e.role, t) || match(e.email, t))
          .slice(0, 3);
        const cust = (RS.CUSTOMERS || [])
          .filter((c) => match(c.name, t) || match(c.phone, t))
          .slice(0, 3);
        const pages = PAGES.filter(
          (p) => match(p[1], t) || match(p[3], t) || match(p[0], t)
        ).slice(0, 6);
        const settingsHits = SETTINGS.filter(
          (s) => match(s.title, t) || match(s.sub, t) || match(s.kw, t)
        ).slice(0, 8);

        let html = '';
        if (settingsHits.length) {
          html +=
            '<div class="sr-group">Settings</div>' +
            settingsHits
              .map(
                (s) =>
                  `<div class="sr-item" role="option" data-kind="settings" data-sec="${safe(s.sec)}" data-skey="${safe(s.skey || '')}" data-find="${safe(s.find || s.title)}">` +
                  `<span class="si-ic"><i class="fa-solid ${s.icon || 'fa-gear'}"></i></span>` +
                  `<div><div class="si-t">${safe(s.title)}</div><div class="si-s">${safe(s.sub)}</div></div>` +
                  `<span class="si-meta">Settings</span></div>`
              )
              .join('');
        }
        if (pages.length) {
          html +=
            '<div class="sr-group">Go to</div>' +
            pages
              .map(
                (p) =>
                  `<div class="sr-item" role="option" data-kind="tab" data-go="${p[0]}">` +
                  `<span class="si-ic"><i class="fa-solid fa-${p[2]}"></i></span>` +
                  `<div><div class="si-t">${safe(p[1])}</div></div>` +
                  `<span class="si-meta">Open</span></div>`
              )
              .join('');
        }
        if (menu.length) {
          html +=
            '<div class="sr-group">Menu</div>' +
            menu
              .map(
                (m) =>
                  `<div class="sr-item" role="option" data-kind="menu" data-go="pos-tab" data-q="${safe(m.name)}">` +
                  `<span class="si-ic"><i class="fa-solid fa-utensils"></i></span>` +
                  `<div><div class="si-t">${safe(m.name)}</div><div class="si-s">${safe(m.cat || '')}</div></div>` +
                  `<span class="si-meta">${rs(m.price)}</span></div>`
              )
              .join('');
        }
        if (bills.length) {
          html +=
            '<div class="sr-group">Bills</div>' +
            bills
              .map(
                (b) =>
                  `<div class="sr-item" role="option" data-kind="tab" data-go="bills-tab">` +
                  `<span class="si-ic"><i class="fa-solid fa-receipt"></i></span>` +
                  `<div><div class="si-t">${safe(b.no)}</div><div class="si-s">${safe(b.table || '')} · ${safe(b.pay || '')}</div></div>` +
                  `<span class="si-meta">${rs(b.amount != null ? b.amount : b.total)}</span></div>`
              )
              .join('');
        }
        if (inv.length) {
          html +=
            '<div class="sr-group">Inventory</div>' +
            inv
              .map(
                (i) =>
                  `<div class="sr-item" role="option" data-kind="tab" data-go="inventory-tab">` +
                  `<span class="si-ic"><i class="fa-solid fa-boxes-stacked"></i></span>` +
                  `<div><div class="si-t">${safe(i.name)}</div><div class="si-s">${safe(i.cat || '')} · stock ${safe(i.stock)}</div></div></div>`
              )
              .join('');
        }
        if (team.length) {
          html +=
            '<div class="sr-group">Team</div>' +
            team
              .map(
                (e) =>
                  `<div class="sr-item" role="option" data-kind="tab" data-go="employees-tab">` +
                  `<span class="si-ic"><i class="fa-solid fa-user"></i></span>` +
                  `<div><div class="si-t">${safe(e.name)}</div><div class="si-s">${safe(e.role || '')}</div></div></div>`
              )
              .join('');
        }
        if (cust.length) {
          html +=
            '<div class="sr-group">Customers</div>' +
            cust
              .map(
                (c) =>
                  `<div class="sr-item" role="option" data-kind="tab" data-go="customers-tab">` +
                  `<span class="si-ic"><i class="fa-solid fa-address-book"></i></span>` +
                  `<div><div class="si-t">${safe(c.name)}</div><div class="si-s">${safe(c.phone || '')}</div></div></div>`
              )
              .join('');
        }

        if (!html) {
          html =
            '<div class="sr-empty" style="padding:18px 16px;text-align:center;color:var(--text-mute);font-size:13px">' +
            'No results for <b>' +
            safe(q) +
            '</b><br><span style="font-size:12px">Try “shift”, “tax”, “printer”, “whatsapp”, or a menu name</span></div>';
        } else {
          html +=
            '<div class="sr-group" style="border-top:1px solid var(--stroke-2);margin-top:4px">Tip</div>' +
            '<div style="padding:6px 16px 12px;font-size:11.5px;color:var(--text-mute)">↑↓ navigate · Enter open · Esc close · <kbd style="font-size:10px;padding:1px 5px;border:1px solid var(--stroke-2);border-radius:4px">Ctrl</kbd>+<kbd style="font-size:10px;padding:1px 5px;border:1px solid var(--stroke-2);border-radius:4px">K</kbd> focus search</div>';
        }

        box.innerHTML = html;
        box.classList.add('show');
        activeIdx = -1;
        $$('.sr-item', box).forEach((el) => {
          el.onclick = () => runPick(el);
        });
      }

      searchInput.addEventListener('input', (e) => run(e.target.value));
      searchInput.addEventListener('focus', (e) => {
        if (e.target.value) run(e.target.value);
        else {
          box.innerHTML =
            '<div class="sr-group">Quick</div>' +
            [
              ['printer', 'Require open shift', 'fa-unlock', 'set_require_open_shift', 'Require open shift'],
              ['tax', 'Calculate taxes', 'fa-percent', 'set_calculate_taxes', 'Calculate taxes'],
              ['gateway', 'Send bill after payment', 'fa-whatsapp', 'set_send_bill_after_payment', 'Send bill after payment'],
              ['printer', 'Operating mode', 'fa-print', 'set_operating_mode', 'Operating mode'],
            ]
              .map(
                ([sec, title, ic, skey, find]) =>
                  `<div class="sr-item" data-kind="settings" data-sec="${sec}" data-skey="${skey}" data-find="${find}"><span class="si-ic"><i class="fa-solid ${ic}"></i></span><div><div class="si-t">${title}</div><div class="si-s">Settings</div></div><span class="si-meta">Open</span></div>`
              )
              .join('');
          box.classList.add('show');
          $$('.sr-item', box).forEach((el) => {
            el.onclick = () => runPick(el);
          });
        }
      });
      searchInput.addEventListener('keydown', (e) => {
        const list = items();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!list.length) return;
          setActive(activeIdx < list.length - 1 ? activeIdx + 1 : 0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!list.length) return;
          setActive(activeIdx > 0 ? activeIdx - 1 : list.length - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (activeIdx >= 0 && list[activeIdx]) runPick(list[activeIdx]);
          else if (list[0]) runPick(list[0]);
        } else if (e.key === 'Escape') {
          box.classList.remove('show');
          searchInput.blur();
        }
      });
      document.addEventListener('click', (e) => {
        if (!searchWrap.contains(e.target)) box.classList.remove('show');
      });
      // Ctrl+K / Cmd+K — focus global search from anywhere
      document.addEventListener('keydown', (e) => {
        const isK = (e.key || '').toLowerCase() === 'k';
        if ((e.ctrlKey || e.metaKey) && isK) {
          const tag = (e.target && e.target.tagName) || '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) {
            if (e.target === searchInput) return;
          }
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      });
    }

    /* ===================== NOTIFICATIONS ===================== */
    const bell =
      document.getElementById('tb-notif-btn') ||
      $('.tb-icon-btn[aria-label="Notifications"]');
    if (bell) {
      let NOTIFS = [];
      // Dismissed = permanently removed from the panel list (not just "read" styling)
      const dismissedKey = 'rs:notif-dismissed';
      const readKey = 'rs:notif-read'; // legacy; still written for older clients
      let notifLoading = false;
      let notifReloadQueued = false;
      let notifCloudUnavailable = false;
      const panel = document.createElement('div');
      panel.className = 'notif-panel';
      panel.id = 'rs-notif-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Notifications');
      panel.setAttribute('aria-modal', 'false');

      function loadIdSet(key) {
        try {
          const raw = JSON.parse(localStorage.getItem(key) || '[]');
          return new Set(Array.isArray(raw) ? raw.map(String) : []);
        } catch (e) {
          return new Set();
        }
      }
      function saveIdSet(key, set) {
        try {
          // Cap so localStorage never grows forever
          const arr = [...set].slice(-400);
          localStorage.setItem(key, JSON.stringify(arr));
        } catch (e) {}
      }
      function dismissedSet() {
        return loadIdSet(dismissedKey);
      }
      function markDismissed(ids) {
        const set = dismissedSet();
        const read = loadIdSet(readKey);
        (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
          if (id == null || id === '') return;
          const k = String(id);
          set.add(k);
          read.add(k);
        });
        saveIdSet(dismissedKey, set);
        saveIdSet(readKey, read);
      }
      function relTime(v) {
        const t = v ? new Date(v).getTime() : 0;
        if (!t || Number.isNaN(t)) return '';
        const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + ' min ago';
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return hrs + ' hr ago';
        return new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      }
      function iconFor(type) {
        if (type === 'warning') return ['fa-triangle-exclamation', 'var(--red-tint)', 'var(--red)'];
        if (type === 'success') return ['fa-circle-check', 'var(--green-tint)', 'var(--green)'];
        if (type === 'billing') return ['fa-receipt', 'var(--amber-tint)', 'var(--amber)'];
        if (type === 'order') return ['fa-bowl-rice', 'var(--orange-tint)', 'var(--orange)'];
        if (type === 'system') return ['fa-cloud-arrow-down', 'var(--violet-tint)', 'var(--violet-soft)'];
        if (type === 'waiter' || type === 'waiter_call') return ['fa-bell-concierge', 'var(--orange-tint)', 'var(--orange)'];
        return ['fa-bell', 'var(--orange-tint)', 'var(--orange)'];
      }
      function actionLabel(n) {
        const t = String(n.type || '').toLowerCase();
        if (t === 'waiter' || t === 'waiter_call') return 'Open floor';
        if (t === 'order') return 'Open orders';
        if (t === 'billing') return 'Open bills';
        if (t === 'warning' && String(n.id || '').startsWith('low-stock')) return 'Open inventory';
        if (t === 'system' || String(n.id || '').startsWith('system-update')) return 'Apply update';
        if (t === 'warning') return 'View';
        return 'Open';
      }
      function positionPanel() {
        try {
          const r = bell.getBoundingClientRect();
          const top = Math.max(8, r.bottom + 8);
          const right = Math.max(8, window.innerWidth - r.right);
          panel.style.top = top + 'px';
          panel.style.right = right + 'px';
          panel.style.left = 'auto';
          panel.style.zIndex = '2147483000';
        } catch (_) {}
      }
      function findNotif(id) {
        const key = String(id == null ? '' : id);
        return NOTIFS.find((x) => String(x.id) === key) || null;
      }
      /** Remove one item from the in-memory list + persist dismiss */
      function dismissNotif(n) {
        if (!n || n.id == null) return false;
        const key = String(n.id);
        markDismissed(key);
        const before = NOTIFS.length;
        NOTIFS = NOTIFS.filter((x) => String(x.id) !== key);
        // Best-effort cloud flag
        if (
          window.RS_DB &&
          !key.startsWith('low-stock-') &&
          !key.startsWith('pending-order-') &&
          !key.startsWith('refund-') &&
          key !== 'cloud-sync-warning' &&
          !key.startsWith('system-update')
        ) {
          try {
            RS_DB.put('notifications', key, { ...n, isRead: true, dismissed: true }).catch(() => {});
          } catch (_) {}
        }
        return before !== NOTIFS.length;
      }
      function markAllRead() {
        const count = NOTIFS.length;
        if (!count) {
          RS.toast('Inbox is empty', 'fa-circle-check');
          draw();
          updateDot();
          return;
        }
        markDismissed(NOTIFS.map((n) => n.id));
        NOTIFS = [];
        draw();
        updateDot();
        RS.toast(count === 1 ? '1 notification cleared' : count + ' notifications cleared', 'fa-check-double');
      }
      function openFromNotif(n) {
        if (!n) return;
        const id = String(n.id || '');
        const type = String(n.type || '').toLowerCase();
        // Remove from list immediately so "view" never leaves a ghost row
        dismissNotif(n);
        draw();
        updateDot();
        closePanel();

        if (id.startsWith('system-update') || type === 'system') {
          if (typeof window.RS_SHOW_UPDATE_DIALOG === 'function') {
            window.RS_SHOW_UPDATE_DIALOG();
          } else {
            RS.toast(n.message || 'System update available', 'fa-cloud-arrow-down');
          }
          return;
        }
        if (type === 'waiter' || type === 'waiter_call' || /waiter|table/i.test(n.title || '')) {
          if (RS.activateTab) RS.activateTab('floor-tab');
          RS.toast(n.title || 'Opening floor', 'fa-bell-concierge');
          return;
        }
        if (type === 'order' || id.startsWith('pending-order-')) {
          if (RS.activateTab) RS.activateTab('aggregator-tab');
          RS.toast(n.title || 'Opening online orders', 'fa-bowl-rice');
          return;
        }
        if (type === 'billing' || id.startsWith('refund-')) {
          if (RS.activateTab) RS.activateTab('bills-tab');
          RS.toast(n.title || 'Opening bills', 'fa-receipt');
          return;
        }
        if (id.startsWith('low-stock-') || (type === 'warning' && /stock/i.test(n.title || ''))) {
          if (RS.activateTab) RS.activateTab('inventory-tab');
          RS.toast(n.title || 'Opening inventory', 'fa-boxes-stacked');
          return;
        }
        if (id === 'cloud-sync-warning') {
          RS.toast(n.message || 'Cloud sync issue — data is safe locally', 'fa-cloud');
          return;
        }
        RS.toast(n.title || 'Notification opened', 'fa-bell');
      }
      async function loadNotifications() {
        if (notifLoading) {
          notifReloadQueued = true;
          return;
        }
        notifLoading = true;
        try {
          const live = [];
          if (Array.isArray(RS.INVENTORY)) {
            RS.INVENTORY.filter((i) => Number(i.stock) < Number(i.min))
              .slice(0, 4)
              .forEach((i) => {
                live.push({
                  id: 'low-stock-' + (i.id || i.name),
                  type: 'warning',
                  title: `${i.name} is low on stock`,
                  message: `${i.stock || 0} ${i.unit || 'unit'} left, minimum ${i.min || 0}`,
                  timestamp: '',
                });
              });
          }
          if (Array.isArray(RS.QR_ORDERS)) {
            RS.QR_ORDERS.filter((o) => String(o.status || '').toLowerCase() === 'pending')
              .slice(0, 4)
              .forEach((o) => {
                const id = 'pending-order-' + (o.id || o.orderId || o.table);
                live.push({
                  id,
                  type: 'order',
                  title: `New order${
                    o.table
                      ? ' · ' + (String(o.table).match(/^\d+$/) ? 'Table ' + o.table : o.table)
                      : ''
                  }`.trim(),
                  message: `${o.table || 'Table'} - ${rs(o.total || 0)}`,
                  timestamp: o.time || o.dateTime || '',
                });
              });
          }
          if (Array.isArray(RS.BILLS)) {
            RS.BILLS.filter((b) => String(b.status || '').toLowerCase() === 'refunded')
              .slice(0, 2)
              .forEach((b) => {
                const id = 'refund-' + (b.id || b.no);
                live.push({
                  id,
                  type: 'billing',
                  title: `Refund completed ${b.no || ''}`.trim(),
                  message: `${rs(b.amount || 0)} refunded`,
                  timestamp: b.time || '',
                });
              });
          }
          if (window.RS_LAST_CLOUD_ERROR) {
            live.push({
              id: 'cloud-sync-warning',
              type: 'warning',
              title: 'Cloud sync needs attention',
              message:
                window.RS_LAST_CLOUD_ERROR.message ||
                'Latest change is saved locally until sync recovers.',
              timestamp: window.RS_LAST_CLOUD_ERROR.time,
            });
          }
          if (window.RS_APP_UPDATE) {
            const notifId =
              'system-update-' +
              (window.RS_APP_UPDATE.signature
                ? window.RS_APP_UPDATE.signature.substring(0, 8)
                : 'latest');
            const timestamp =
              window.RS_APP_UPDATE.detectedAt || window.RS_APP_UPDATE.releaseInfo?.date || '';
            const msg = window.RS_APP_UPDATE.isPatchOnly
              ? 'System stability hotfix — tap to apply.'
              : `Version ${window.RS_APP_UPDATE.releaseInfo?.version || 'latest'} — tap to apply.`;
            live.push({
              id: notifId,
              type: 'system',
              title: 'System update is ready',
              message: msg,
              timestamp,
            });
          }
          let saved = [];
          if (window.RS_DB) {
            if (RS_DB.isCloud && RS_DB.listCloud && !notifCloudUnavailable) {
              try {
                saved = await RS_DB.listCloud('notifications');
                if (RS_DB.writeLocal) await RS_DB.writeLocal('notifications', saved || []);
              } catch (e) {
                notifCloudUnavailable = true;
                saved = RS_DB.listLocal ? await RS_DB.listLocal('notifications') : [];
              }
            } else {
              saved = RS_DB.listLocal ? await RS_DB.listLocal('notifications') : [];
            }
          }
          const gone = dismissedSet();
          const seen = new Set();
          const mapped = [];
          [...(saved || []), ...live].forEach((n) => {
            if (!n || n.id == null) return;
            const key = String(n.id);
            if (seen.has(key)) return;
            seen.add(key);
            // Dismissed items never reappear (until storage cleared)
            if (gone.has(key) || n.dismissed || n.isDismissed) return;
            const [ic, bg, c] = iconFor(n.type);
            mapped.push({
              ...n,
              id: key,
              ic,
              bg,
              c,
              unread: true, // anything still in the inbox is actionable
              time: relTime(n.timestamp || n.createdAt || n.created_at),
              cta: actionLabel(n),
            });
          });
          // Newest first when we have timestamps
          mapped.sort((a, b) => {
            const ta = new Date(a.timestamp || a.createdAt || a.created_at || 0).getTime() || 0;
            const tb = new Date(b.timestamp || b.createdAt || b.created_at || 0).getTime() || 0;
            return tb - ta;
          });
          NOTIFS = mapped.slice(0, 40);
          draw();
          updateDot();
        } catch (err) {
          console.warn('[notifications]', err);
          draw();
        } finally {
          notifLoading = false;
          if (notifReloadQueued) {
            notifReloadQueued = false;
            setTimeout(loadNotifications, 0);
          }
        }
      }
      function draw() {
        const count = NOTIFS.length;
        const list = NOTIFS;
        panel.innerHTML = `
          <div class="notif-h">
            <div class="notif-h-title">
              <h4>Notifications</h4>
              ${
                count
                  ? `<span class="pill pill-orange notif-count">${count}</span>`
                  : `<span class="notif-count-muted">Inbox clear</span>`
              }
            </div>
            <button type="button" class="btn btn-ghost btn-sm notif-mark-all" id="notif-mark-all-btn" data-action="mark-all" ${
              count ? '' : 'disabled'
            } title="${count ? 'Clear all notifications' : 'Nothing to clear'}">
              <i class="fa-solid fa-check-double" aria-hidden="true"></i>
              <span>Mark all read</span>
            </button>
          </div>
          <div class="notif-list" role="list">
            ${
              list.length
                ? list
                    .map((n) => {
                      const idAttr = encodeURIComponent(String(n.id));
                      return `<button type="button" class="notif-item unread" role="listitem" data-action="open-item" data-id="${idAttr}" title="${safe(
                        n.cta || 'Open'
                      )}">
                        <div class="notif-ic" style="background:${n.bg};color:${n.c}" aria-hidden="true"><i class="fa-solid ${
                          n.ic
                        }"></i></div>
                        <div class="notif-body">
                          <div class="nt">${safe(n.title)}</div>
                          <div class="nd">${safe(n.message)}</div>
                          <div class="notif-meta">
                            <span class="ntime">${safe(n.time || '')}</span>
                            <span class="notif-cta">${safe(n.cta || 'Open')} <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>
                          </div>
                        </div>
                        <span class="notif-unread-dot" aria-hidden="true"></span>
                      </button>`;
                    })
                    .join('')
                : `<div class="notif-empty">
                    <i class="fa-regular fa-bell" aria-hidden="true"></i>
                    <strong>All clear</strong>
                    <span>Waiter calls, new QR orders, low stock, and updates show up here.</span>
                  </div>`
            }
          </div>`;
      }
      function updateDot() {
        const d = bell.querySelector('.dot-notif');
        const n = NOTIFS.length;
        if (d) d.style.display = n ? '' : 'none';
        bell.setAttribute('aria-label', n ? `Notifications (${n})` : 'Notifications');
      }
      function openPanel() {
        positionPanel();
        panel.classList.add('show');
        panel.setAttribute('aria-hidden', 'false');
        bell.setAttribute('aria-expanded', 'true');
        draw();
        loadNotifications();
      }
      function closePanel() {
        panel.classList.remove('show');
        panel.setAttribute('aria-hidden', 'true');
        bell.setAttribute('aria-expanded', 'false');
      }
      function togglePanel(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (panel.classList.contains('show')) closePanel();
        else openPanel();
      }

      let lastActionAt = 0;
      let lastActionKey = '';
      function handlePanelAction(e) {
        if (!panel.classList.contains('show')) return;
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
        const target = e.target;
        const inPanel =
          panel.contains(target) ||
          path.includes(panel) ||
          (target && target.closest && target.closest('#rs-notif-panel'));
        if (!inPanel) return;

        const markAllBtn =
          (target && target.closest && target.closest('[data-action="mark-all"]')) ||
          path.find((el) => el && el.getAttribute && el.getAttribute('data-action') === 'mark-all');
        if (markAllBtn) {
          e.preventDefault();
          e.stopPropagation();
          // Debounce double-firing from capture + bubble / click + pointer
          const now = Date.now();
          if (lastActionKey === 'mark-all' && now - lastActionAt < 400) return;
          lastActionKey = 'mark-all';
          lastActionAt = now;
          markAllRead();
          return;
        }

        const itemEl =
          (target && target.closest && target.closest('[data-action="open-item"]')) ||
          path.find((el) => el && el.getAttribute && el.getAttribute('data-action') === 'open-item');
        if (itemEl) {
          e.preventDefault();
          e.stopPropagation();
          let id = itemEl.getAttribute('data-id') || '';
          try {
            id = decodeURIComponent(id);
          } catch (_) {}
          const now = Date.now();
          const actionKey = 'open:' + id;
          if (lastActionKey === actionKey && now - lastActionAt < 400) return;
          lastActionKey = actionKey;
          lastActionAt = now;
          const targetNotif = findNotif(id);
          if (targetNotif) openFromNotif(targetNotif);
          else {
            markDismissed(id);
            NOTIFS = NOTIFS.filter((x) => String(x.id) !== String(id));
            draw();
            updateDot();
            RS.toast('Notification cleared', 'fa-check');
          }
        }
      }

      // Capture-phase on panel so parent page handlers cannot steal the click
      panel.addEventListener('click', handlePanelAction, true);

      if (!document.body.contains(panel)) document.body.appendChild(panel);
      panel.setAttribute('aria-hidden', 'true');
      bell.setAttribute('aria-expanded', 'false');
      bell.setAttribute('aria-haspopup', 'dialog');
      draw();
      loadNotifications();

      bell.addEventListener('click', togglePanel);
      bell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') togglePanel(e);
      });
      document.addEventListener('click', (e) => {
        if (!panel.classList.contains('show')) return;
        if (panel.contains(e.target) || bell.contains(e.target)) return;
        // Don't close if click was on mark-all / item (already handled)
        closePanel();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('show')) {
          closePanel();
          try {
            bell.focus();
          } catch (_) {}
        }
      });
      window.addEventListener('resize', () => {
        if (panel.classList.contains('show')) positionPanel();
      });
      document.addEventListener('rs:hydrated', loadNotifications);
      document.addEventListener('rs:pending_orders_synced', loadNotifications);
      document.addEventListener('rs:collection_synced', loadNotifications);
      window.addEventListener('rs:cloud-fallback', loadNotifications);
      document.addEventListener('rs:app_update_available', loadNotifications);
      document.addEventListener('rs:render-inventory', loadNotifications);
      window.RS_openNotifications = openPanel;
    }

    /* ===================== SETTINGS ===================== */
    // Grouped sub-nav: [id, label, icon, groupLabel]
    const SET_NAV = [
      ['profile','Outlet profile','fa-store','Outlet'],
      ['tax','Taxes & pricing','fa-percent','Outlet'],
      ['printer','Printers & KOT','fa-print','Operations'],
      ['gateway','WhatsApp','fa-whatsapp','Operations'],
      ['payments','Payments','fa-indian-rupee-sign','Operations'],
      ['security','Security & PIN','fa-shield-halved','Access'],
      ['team','Team & roles','fa-user-shield','Access'],
      ['plan','Plan & billing','fa-crown','Account'],
      ['danger','Danger zone','fa-triangle-exclamation','Account'],
    ];
    const SET_PANE_META = {
      profile: { title: 'Outlet profile', sub: 'Name, address, country, and guest QR card details' },
      tax: { title: 'Taxes & pricing', sub: 'Tax rates, service charge, happy hour, loyalty & promo codes' },
      printer: { title: 'Printers & KOT', sub: 'Operating mode, receipt paper, kitchen tickets, cash drawer' },
      gateway: { title: 'WhatsApp', sub: 'Connect your restaurant number and bill preferences' },
      payments: { title: 'Payments', sub: 'Card / UPI settlement to your bank account' },
      security: { title: 'Security & PIN', sub: 'Admin PIN and which actions require manager approval' },
      team: { title: 'Team & roles', sub: 'Staff permissions and cashier restrictions' },
      plan: { title: 'Plan & billing', sub: 'Your workspace plan, limits, and how to upgrade' },
      danger: { title: 'Danger zone', sub: 'Irreversible actions for this outlet' },
    };
    const skey = s => 'set_'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    function field(label, val, ph){ return `<div class="set-field"><label class="fl">${label}</label><input class="form-input" data-skey="${skey(label)}" value="${val||''}" placeholder="${ph||''}"></div>`; }
    function sel(label, opts, cur){ return `<div class="set-field"><label class="fl">${label}</label><select class="form-input" data-skey="${skey(label)}">${opts.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('')}</select></div>`; }
    function toggle(t,d,on){ return `<div class="set-row"><div class="si"><div class="st">${t}</div><div class="sd">${d}</div></div><label class="toggle"><input type="checkbox" data-skey="${skey(t)}" ${on?'checked':''}><span></span></label></div>`; }
    function setBlock(title, sub, html){
      return `<section class="set-block"><header class="set-block-head"><h4>${title}</h4>${sub?`<p>${sub}</p>`:''}</header><div class="set-block-body">${html}</div></section>`;
    }
    // Country & currency helpers -- populated from shared RS_COUNTRIES data
    function countrySelect(cur) {
      const countries = window.RS_COUNTRIES || [];
      if (!countries.length) return `<div class="set-field"><label class="fl">Country</label><input class="form-input" id="set-country" data-skey="set_country" value="${cur||'India'}" placeholder="Outlet country"></div>`;
      const flag = window.RS_countryFlag || (code => '🌐');
      const opts = countries.map(c => `<option value="${c.name}" ${c.name===(cur||'India')?'selected':''}>${flag(c.code)} ${c.name} (+${c.dial})</option>`).join('');
      return `<div class="set-field"><label class="fl">Country</label><select class="form-input" id="set-country" data-skey="set_country">${opts}</select></div>`;
    }
    function currencySelect(cur) {
      const currencies = window.RS_getCurrencies ? window.RS_getCurrencies() : [];
      const defaults = ['INR (₹)','EUR (€)','USD ($)','GBP (£)','AED (د.إ)','SAR (ر.س)','SGD ($)','AUD ($)','CAD ($)','NZD ($)','ZAR (R)'];
      const opts = (currencies.length ? currencies.map(c => c.currency) : defaults)
        .map(c => `<option ${c===(cur||'INR (₹)')?'selected':''}>${c}</option>`).join('');
      return `<div class="set-field"><label class="fl">Currency</label><select class="form-input" id="set-currency" data-skey="set_currency">${opts}</select></div>`;
    }
    const sessionMeta = (window.RS_API && RS_API.session && RS_API.session()) || {};
    const defaultOutletName = sessionMeta.tenant_name || sessionMeta.business_name || String(sessionMeta.tenant_slug || sessionStorage.getItem('tenant_slug') || 'Outlet').replace(/[-_]+/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
    const defaultOutletCode = sessionMeta.tenant_slug || sessionMeta.outlet_id || sessionStorage.getItem('tenant_slug') || '';
    // Business type is assigned at registration (outlet_type) — not editable in Settings
    const BIZ_TYPE_LABELS = {
      restaurant: 'Restaurant / Café / Food',
      retail: 'Retail store',
      salon: 'Salon / Spa',
      clinic: 'Clinic / Hospital',
    };
    function resolveLockedBusinessType(store) {
      const st = store || {};
      const sess = (window.RS_API && RS_API.session && RS_API.session()) || {};
      const raw = String(
        sess.outlet_type ||
        sess.business_type ||
        st.set_business_type ||
        (window.RS_SETTINGS && RS_SETTINGS.set_business_type) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('rs:business_type')) ||
        'restaurant'
      ).toLowerCase().trim();
      const key = BIZ_TYPE_LABELS[raw] ? raw : 'restaurant';
      return { key, label: BIZ_TYPE_LABELS[key] };
    }
    const PANES = {
      profile:
        setBlock('Identity', 'How this outlet appears on bills, QR menus, and the dashboard',
          `<div class="form-grid-2">${field('Business name',defaultOutletName)}${field('Outlet code',defaultOutletCode)}</div>
          <div class="set-field" style="margin-top:12px">
            <label class="fl">Business type <span class="set-chip">Locked</span></label>
            <div class="set-locked-field" id="set-business-type-display" aria-readonly="true">
              <i class="fa-solid fa-lock set-locked-ic" aria-hidden="true"></i>
              <span class="set-locked-label" id="set-business-type-label">Restaurant / Café / Food</span>
            </div>
            <input type="hidden" data-skey="set_business_type" id="set-business-type" value="restaurant">
            <p class="set-hint">Assigned when this outlet was registered. It cannot be changed here — contact RestroSuite support if you need a different vertical.</p>
          </div>`) +
        setBlock('Contact & location', 'Printed on receipts and digital bills',
          `${field('Address','','Street, area, city')}
          <div class="form-grid-2" style="margin-top:12px">${field('Phone','','Outlet phone')}${field('Email','','Outlet email')}</div>
          <div class="form-grid-2" style="margin-top:12px">${field('GSTIN','','Tax ID if enabled')}${sel('Cuisine',['North Indian','South Indian','Multi-cuisine','Cafe'],'Multi-cuisine')}</div>
          <div class="form-grid-2" style="margin-top:12px" id="set-country-currency-row"></div>`) +
        setBlock('Guest QR cards', 'Printed on each table tent. Dual workflow: guest scans to order OR call waiter — staff can also take/amend the same table order until kitchen starts prep.',
          `<div class="form-grid-2">${field('Wifi name','','e.g. Cafe-Guest')}${field('Wifi password','','Guest network password')}</div>
          <div style="margin-top:12px">${field('Guest welcome','','This table only · Order food or call waiter')}</div>
          <p class="set-hint" style="margin-top:10px">Each QR is for <b>that table only</b>. Waiters can scan the same code (or open QR Orders → Amend) to edit the shared bill.</p>`),
      tax:
        setBlock('Tax engine', 'How tax is calculated on cart and invoices',
          `${toggle('Calculate taxes','Enable tax calculations on cart and bills',false)}
          <div class="form-grid-2" style="margin-top:12px">
            ${field('Invoice prefix','INV-')}
            ${field('Tax label','GST','e.g. GST, VAT, Sales Tax')}
          </div>
          <div class="form-grid-2" style="margin-top:12px">
            ${field('Tax rate (%)','5','Tax rate percentage')}
            <div></div>
          </div>
          ${toggle('Service charge','Add service charge on dine-in orders',false)}
          <div class="form-grid-2" style="margin-top:10px">${field('Service charge pct','5','e.g. 5 or 10')}<div></div></div>
          ${toggle('Round-off totals','Round bill total to nearest currency unit',true)}
          ${toggle('Show HSN codes','Print HSN/SAC codes on GST invoice (tax shops only)',false)}
          ${toggle('Inclusive pricing','Menu prices already include tax',false)}`) +
        setBlock('Happy hour', 'Time-window menu discount on POS — leave OFF until you run happy hour',
          `${toggle('Happy hour','Apply time-window menu discount on POS',false)}
          <div class="form-grid-2" style="margin-top:12px">
            ${field('Happy hour start','17:00','HH:MM')}
            ${field('Happy hour end','20:00','HH:MM')}
          </div>
          <div class="form-grid-2" style="margin-top:10px">
            ${field('Happy hour pct','15','Percent off menu prices')}
            <div></div>
          </div>
          <p class="set-hint">Menu cards show an HH badge. Optional per-item happyHourPrice overrides %.</p>`) +
        setBlock('Loyalty', 'Points at checkout — leave OFF for simple cafés',
          `${toggle('Loyalty program','Earn & redeem points on CRM customers at checkout',false)}
          <div class="form-grid-2" style="margin-top:12px">
            ${field('Loyalty earn rate','100','Currency spent per 1 point')}
            ${field('Loyalty point value','1','Currency value of 1 redeemed point')}
          </div>
          <p class="set-hint">Gold earns 2×, VIP 3×. Tiers: Silver → Gold at ₹5k spend → VIP at ₹10k.</p>`) +
        setBlock('POS promo codes', 'Coupon codes on cart — leave OFF until you run offers',
          `${toggle('POS promo codes','Apply coupon / offer codes on the POS cart',false)}
          <div class="form-grid-2" style="margin-top:12px">
            ${field('Demo promo code','WELCOME10','Fallback code when no offer matches')}
            ${field('Demo promo pct','10','Percent off for demo code')}
          </div>
          <p class="set-hint">Looks up active offers by code first, then falls back to the demo code.</p>`),
      printer:
        setBlock('Kitchen &amp; billing style', 'How this outlet runs — pick once, everything else follows',
          `${sel('Operating mode',[
            'Full ops (KDS + kitchen)',
            'Kitchen printer only',
            'Billing only'
          ],'Billing only')}
          <div class="set-hint" style="margin-top:10px;line-height:1.45">
            <b>Full ops</b> — Kitchen Display and/or KOT print; waiters fire tickets to kitchen.<br>
            <b>Kitchen printer only</b> — No KDS screen; kitchen cooks from thermal KOT slips only.<br>
            <b>Billing only</b> — Add items to table/cart and print the bill. Nothing goes to kitchen.
          </div>
          <p class="set-hint" style="margin-top:8px">Waiters can still open tables and add items in every mode. In <b>Billing only</b> they never fire kitchen tickets.</p>`) +
        setBlock('Printer hardware', 'Desktop app or Android bridge detects devices; browser uses the system print dialog',
          `<div class="form-grid-2">
            ${field('Preferred printer name','','e.g. Counter 80mm — receipt / bill printer')}
            ${field('Kitchen printer name','','e.g. Kitchen 80mm — blank = same as receipt')}
          </div>
          <div class="form-grid-2" style="margin-top:12px">
            ${sel('Paper size',['58 mm','80 mm'],'80 mm')}
            ${field('Kitchen station label','Main kitchen','Printed on KOT header')}
          </div>
          <p class="set-hint" style="margin-top:10px">Use two names when counter and kitchen have separate thermals. Leave kitchen blank to use the receipt printer.</p>`) +
        setBlock('Shift (optional)', 'Most small cafés leave this OFF and just bill + print',
          `${toggle('Require open shift','When ON, staff must open a shift before Print & Pay, Hold, refunds, and cash drawer. When OFF (default), billing works without shift — open Shift only if you want float and Z-report.',false)}
          <p class="set-hint" style="margin-top:8px"><b>OFF (recommended for simple outlets):</b> no shift dialog blocking pay.<br>
          <b>ON:</b> orange Shift button → opening float → end-of-day Z-report. Use for multi-cashier cash control.</p>`) +
        setBlock('Auto-print & drawer', 'Turn ON only when hardware is connected',
          `${toggle('Auto-print receipt','Print automatically after payment when desktop/Android printer bridge is connected',false)}
          ${toggle('Auto-print KOT','Print kitchen ticket when staff fires KOT (use with kitchen printer mode)',false)}
          ${toggle('Open cash drawer on cash','Pulse cash drawer after cash payment (needs drawer cable)',false)}
          <div class="form-grid-2" style="margin-top:12px">${sel('KOT copies',['1','2','3'],'1')}${sel('WhatsApp bill PDF mode',['Exact preview','Fast thermal'],'Exact preview')}</div>
          <p class="set-hint" style="margin-top:8px">KOT re-fires only print <b>new / cancelled lines</b> (ADD / VOID slips). Exact preview matches the settled bill screen.</p>`) +
        setBlock('Sounds &amp; alerts', 'New QR orders, waiter calls, and kitchen chimes',
          `<div class="set-row" style="border:0;padding:0 0 8px;align-items:center;gap:12px">
            <div class="si" style="flex:1"><div class="st">Alert sounds</div><div class="sd" id="set-sound-status">Chimes for new QR orders and “call waiter”</div></div>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-toggle-alert-sound"><i class="fa-solid fa-volume-high"></i> Sound on</button>
          </div>
          <div class="set-actions-row" style="margin-top:4px">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-test-alert-sound"><i class="fa-solid fa-bell"></i> Test chime</button>
          </div>
          <p class="set-hint">Some browsers mute audio until you tap the page once. Test chime unlocks sound on this device.</p>`),
      gateway:
        setBlock('Connection', 'Send bills and order-ready messages from your restaurant WhatsApp',
          `<div id="outlet-gateway-status-container" class="set-gateway-status">
            <div class="set-row" style="margin:0;border:0;padding:0"><div class="si"><div class="st">Connection</div><div class="sd">Checking…</div></div><span class="pill" style="padding:5px 12px;background:rgba(107,114,128,0.1);color:#6B7280"><i class="fa-solid fa-spinner fa-spin"></i> …</span></div>
          </div>
          <div class="set-actions-row">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-wa-test-send"><i class="fa-solid fa-paper-plane"></i> Send test</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-wa-refresh-status"><i class="fa-solid fa-rotate"></i> Refresh</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-gateway-troubleshoot-reset"><i class="fa-solid fa-qrcode"></i> New QR</button>
          </div>
          <p class="set-hint"><i class="fa-solid fa-bolt"></i> <b>Your number (recommended):</b> scan QR once — bills send from <b>your</b> WhatsApp with no Meta API fees. Lazy mode: session wakes only when sending (low server RAM). First send after idle may take a few seconds.</p>`) +
        setBlock('Bill preferences', 'WhatsApp extras — leave OFF until your number is linked',
          `${toggle('Send bill after payment','Auto WhatsApp the bill PDF after payment (needs linked WhatsApp + customer phone)',false)}
          <div class="form-grid-2" style="margin-top:12px">${sel('Bill format',['Simple text','PDF receipt (recommended)'],'PDF receipt (recommended)')}<div></div></div>
          ${toggle('Order ready alerts','Message customer when order is ready',false)}
          ${toggle('Promotional messages','Allow offer campaigns (use sparingly)',false)}
          <div class="set-field" style="margin-top:12px"><label class="fl">Message with the bill</label><textarea class="form-input" rows="2" data-skey="set_bill_message">Thanks for dining with us. Your bill is attached.</textarea></div>`) +
        setBlock('Owner reports', 'Daily sales, stock alerts, and P&amp;L PDFs to your number',
          `<div class="set-row" style="border:0;padding:0"><div class="si"><div class="st">Configure owner WhatsApp reports</div><div class="sd">Sales digests, low-stock alerts, weekly/monthly P&amp;L</div></div><button type="button" class="btn btn-primary btn-sm" id="btn-owner-wa-reports"><i class="fa-brands fa-whatsapp"></i> Configure</button></div>`) +
        setBlock('Recent activity', 'Gateway events for this outlet',
          `<div class="set-log-head"><span>Activity log</span><button type="button" class="btn btn-ghost btn-sm" id="btn-refresh-client-logs"><i class="fa-solid fa-arrows-rotate"></i></button></div>
          <div id="client-gateway-logs" class="set-log-box"><div class="set-log-empty">No activity yet</div></div>`),
      team:
        setBlock('Staff directory', 'Roles, roster, and payroll live under Employees',
          `<div class="set-row" style="border:0;padding:0"><div class="si"><div class="st">Open team directory</div><div class="sd">Add staff, set roles, shifts, and PINs</div></div><button type="button" class="btn btn-primary btn-sm" id="set-team-go"><i class="fa-solid fa-users"></i> Manage team</button></div>`) +
        setBlock('Cashier permissions', 'What floor staff can do without a manager',
          `${toggle('Require PIN for refunds','Manager PIN needed to issue refunds',true)}
          ${toggle('Cashier can edit prices','Allow price overrides at POS',false)}
          ${toggle('Lock reports for staff','Only admins can view sales reports',true)}`),
      plan: setBlock('Your workspace plan', 'What you are on today, limits, and upgrade options',
          `<div id="rs-plan-container"><div class="set-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading your plan…</div></div>`),
      payments: setBlock('Card &amp; UPI settlement', 'Optional — auto bank settlement when Razorpay / Stripe is enabled',
          `<div id="rzp-route-container"><div class="set-loading"><i class="fa-solid fa-spinner fa-spin"></i> Checking payment status…</div></div>`),
      security: `<div id="rs-security-panel" class="set-security-host"></div>`,
      danger:
        setBlock('Reset operational data', 'Permanent. Account login and settings are kept; sales data is not.',
          `<div class="set-danger-card">
            <div class="set-danger-title"><i class="fa-solid fa-triangle-exclamation"></i> Wipe bills, menu, inventory, customers &amp; staff records</div>
            <p>This permanently deletes operational data for this outlet. Credentials and settings stay. This cannot be undone.</p>
            <button type="button" class="btn set-danger-btn" id="btn-client-reset-data"><i class="fa-solid fa-trash-can"></i> Reset outlet data</button>
          </div>`),
    };
    // -- Security & PIN panel --------------------------------------------------
    function initSecurityPanel(body) {
      const container = body.querySelector('#rs-security-panel');
      if (!container) return;

      const hasPIN = window.RSPinModal && RSPinModal.isConfigured();
      const st = Object.assign({}, window.RS_SETTINGS || {}, (typeof SET_STORE !== 'undefined' ? SET_STORE : {}));
      // PIN gates are opt-in (simple cafés leave them OFF)
      const gateOn = (k) => {
        if (typeof window.RS_featureOn === 'function') return window.RS_featureOn(k, st, false);
        return st[k] === true || st[k] === 'true' || st[k] === 1 || st[k] === '1';
      };
      const gateVal = (k, d) => (st[k] != null && st[k] !== '' ? st[k] : d);

      // -- Sections: PIN management + Protected operations list -------------
      container.innerHTML = `
        ${setBlock('Admin PIN', 'Required for refunds, voids, high discounts, and data reset',
          `<div class="set-pin-status">
            <div class="set-pin-status-main">
              <div class="set-pin-icon ${hasPIN?'is-on':'is-off'}"><i class="fa-solid ${hasPIN?'fa-lock':'fa-lock-open'}"></i></div>
              <div>
                <div class="st">${hasPIN?'Admin PIN is active':'No Admin PIN set'}</div>
                <div class="sd">${hasPIN?'Protected actions require this PIN to proceed.':'Set a PIN to restrict refunds, deletions &amp; sensitive settings.'}</div>
              </div>
            </div>
            <div class="set-pin-actions">
              ${hasPIN
                ? `<button type="button" id="sec-change-pin" class="btn btn-ghost btn-sm"><i class="fa-solid fa-key"></i> Change PIN</button>`
                : `<button type="button" id="sec-set-pin" class="btn btn-primary btn-sm"><i class="fa-solid fa-shield-halved"></i> Set PIN</button>`
              }
            </div>
          </div>
          ${hasPIN?`
          <div class="set-pin-footer">
            <button type="button" id="sec-remove-pin" class="set-link-danger"><i class="fa-solid fa-trash-can"></i> Remove PIN</button>
            <span class="set-sep">·</span>
            <span class="sd">Forgotten PIN resets need a server-verified code from the account owner.</span>
          </div>` : ''}`)}
        ${setBlock('Always PIN-protected', 'These always require admin PIN when a PIN is set',
          `<div class="set-prot-list">${[
            ['fa-trash-can','Delete Bill','Permanently remove a completed bill from records'],
            ['fa-ban','Void / Refund','Void a paid bill and audit the reason'],
            ['fa-percent','High discount','Discounts above the threshold (default 10%)'],
            ['fa-lock','Close shift','Z-report close when PIN is configured'],
            ['fa-triangle-exclamation','Data Reset','Danger Zone operations always require PIN'],
          ].map(([icon,op,desc])=>`
            <div class="set-prot-item">
              <div class="set-prot-ic"><i class="fa-solid ${icon}"></i></div>
              <div class="set-prot-text"><div class="st">${op}</div><div class="sd">${desc}</div></div>
              <span class="set-chip set-chip-warn">PIN required</span>
            </div>
          `).join('')}</div>`)}
        ${setBlock('Optional manager gates', 'Toggle off to allow cashiers without a PIN. Save after changing.',
          `${toggle('Pin gate due','Require PIN for Due / credit payments',gateOn('set_pin_gate_due'))}
          ${toggle('Pin gate clear cart','Require PIN to clear a non-empty cart',gateOn('set_pin_gate_clear_cart'))}
          ${toggle('Pin gate loyalty','Require PIN when redeeming large loyalty points',gateOn('set_pin_gate_loyalty'))}
          ${toggle('Pin gate cash move','Require PIN for pay-out and safe drop from the drawer',gateOn('set_pin_gate_cash_move'))}
          <div class="form-grid-2" style="margin-top:12px">
            ${field('Pin discount threshold',String(gateVal('set_pin_discount_threshold','10')),'% above which discount needs PIN')}
            ${field('Pin loyalty threshold',String(gateVal('set_pin_loyalty_threshold','100')),'Points at/above which redeem needs PIN')}
          </div>
          <div class="form-grid-2" style="margin-top:12px">
            ${field('Idle lock minutes',String(gateVal('set_idle_lock_minutes','5')),'Lock screen after N minutes idle')}
            <div></div>
          </div>`)}
        <div class="set-tip-banner"><strong>Tips:</strong> Share the 4-digit PIN only with managers. Forgotten PIN resets are verified by the backend. Attempts are limited to 3 before a 30-second lockout.</div>
      `;

      // -- Bind buttons ------------------------------------------------------
      container.querySelector('#sec-set-pin')?.addEventListener('click', async () => {
        if (!window.RSPinModal) return;
        const ok = await RSPinModal.setup();
        if (ok) { RS.toast('Admin PIN set successfully','fa-shield-halved'); initSecurityPanel(body); }
      });

      container.querySelector('#sec-change-pin')?.addEventListener('click', async () => {
        if (!window.RSPinModal) return;
        const ok = await RSPinModal.change();
        if (ok) { RS.toast('Admin PIN updated','fa-key'); initSecurityPanel(body); }
      });

      container.querySelector('#sec-remove-pin')?.addEventListener('click', async () => {
        if (!window.RSPinModal) return;
        // Require current PIN first
        const verified = await RSPinModal.request('Confirm PIN removal');
        if (!verified) return;
        if (!confirm('Remove admin PIN? All protected actions will be accessible without verification.')) return;
        if (window.RS_SETTINGS) delete window.RS_SETTINGS.admin_pin_hash;
        if (window.RS && RS.getSettings && RS.saveSettings) {
          const s = await RS.getSettings().catch(()=>({})) || {};
          delete s.admin_pin_hash;
          await RS.saveSettings(s).catch(()=>{});
        }
        RS.toast('Admin PIN removed','fa-lock-open');
        initSecurityPanel(body);
      });
    }

    // -- Plan & billing panel (tenant self-serve + graceful offline catalogue) -
    async function initPlanPanel(body) {
      const container = body.querySelector('#rs-plan-container');
      if (!container) return;

      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
      const fmtDate = (iso) => {
        if (!iso) return 'Managed by RestroSuite';
        try {
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return 'Managed by RestroSuite';
          return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return 'Managed by RestroSuite'; }
      };
      const money = (amt, cur) => {
        const n = Number(amt) || 0;
        if (n <= 0) return 'Included';
        const sym = cur === 'INR' ? '₹' : (cur === 'EUR' ? '€' : (cur === 'USD' ? '$' : (cur ? cur + ' ' : '')));
        return `${sym}${n.toLocaleString()}`;
      };
      const STATUS_STYLE = {
        active: ['#22c55e', 'Active'],
        trialing: ['#3b82f6', 'Trial'],
        past_due: ['#f59e0b', 'Payment due'],
        canceled: ['#ef4444', 'Cancelled'],
        cancelled: ['#ef4444', 'Cancelled'],
      };
      const SUPPORT_EMAIL = 'support@codearc.co.in';
      const FEATURES = {
        starter: ['POS + bills', 'QR orders', 'Kitchen display', 'Up to 5 staff', '300 orders / month', 'Standard support'],
        growth: ['Everything in Starter', 'Reports & analytics', 'CRM / customers', 'Up to 15 staff', '8,000 orders / month', 'Priority support'],
        enterprise: ['Everything in Growth', 'Multi-outlet ready', 'Up to 75 staff', 'High order volume', 'Dedicated support', 'Custom rollout help'],
      };
      // Standard Checkout prices (INR/mo) when SaaS catalogue has no razorpay_plan_id yet
      const FALLBACK_PLANS = [
        { plan_code: 'starter', name: 'Starter', price_monthly: 0, currency: 'INR', max_staff: 5, monthly_order_limit: 300, support_level: 'standard', checkout_available: false },
        { plan_code: 'growth', name: 'Growth', price_monthly: 999, currency: 'INR', max_staff: 15, monthly_order_limit: 8000, support_level: 'priority', checkout_available: true, standard_checkout: true },
        { plan_code: 'enterprise', name: 'Enterprise', price_monthly: 2499, currency: 'INR', max_staff: 75, monthly_order_limit: 100000, support_level: 'dedicated', checkout_available: true, standard_checkout: true },
      ];

      const sess = (window.RS_API && RS_API.session && RS_API.session()) || {};
      const localCurrent = {
        plan_code: sess.plan_code || '',
        plan_name: sess.plan_name || '',
        subscription_status: sess.subscription_status || 'active',
        subscription_current_period_end: sess.subscription_current_period_end || null,
        plan_limits: sess.plan_limits || {},
      };

      let remoteOk = false;
      let data = null;
      let loadNote = '';
      try {
        if (window.RS_API && typeof RS_API.getPlans === 'function') {
          data = await RS_API.getPlans();
          remoteOk = !!(data && (Array.isArray(data.plans) || data.current));
        }
      } catch (e) {
        remoteOk = false;
        loadNote = 'Live catalogue is temporarily unavailable. Showing your workspace plan from this session.';
      }

      const current = Object.assign({}, localCurrent, (data && data.current) || {});
      let plans = (data && Array.isArray(data.plans) && data.plans.length) ? data.plans.slice() : FALLBACK_PLANS.slice();
      // Ensure current plan always appears in the list
      const curCode = String(current.plan_code || localCurrent.plan_code || 'starter').toLowerCase() || 'starter';
      if (!plans.some(p => String(p.plan_code).toLowerCase() === curCode)) {
        const fb = FALLBACK_PLANS.find(p => p.plan_code === curCode) || {
          plan_code: curCode,
          name: current.plan_name || curCode,
          price_monthly: 0,
          currency: 'INR',
          max_staff: (current.plan_limits && current.plan_limits.max_staff) || '—',
          monthly_order_limit: (current.plan_limits && current.plan_limits.monthly_order_limit) || 0,
          support_level: 'standard',
          checkout_available: false,
        };
        plans = [fb].concat(plans);
      }

      const st = STATUS_STYLE[String(current.subscription_status || 'active').toLowerCase()] || STATUS_STYLE.active;
      const sColor = st[0], sLabel = st[1];
      const curPlan = plans.find(p => String(p.plan_code).toLowerCase() === curCode)
        || { name: current.plan_name || curCode, price_monthly: 0, currency: 'INR', max_staff: localCurrent.plan_limits.max_staff, monthly_order_limit: localCurrent.plan_limits.monthly_order_limit, support_level: 'standard' };
      const displayName = current.plan_name || curPlan.name || curCode;
      const renews = current.subscription_current_period_end;
      const maxStaff = curPlan.max_staff != null ? curPlan.max_staff : (localCurrent.plan_limits.max_staff || '—');
      const orderLim = curPlan.monthly_order_limit != null ? curPlan.monthly_order_limit : (localCurrent.plan_limits.monthly_order_limit || 0);
      const anyCheckout = plans.some(p => p.checkout_available && Number(p.price_monthly) > 0);
      const priceLabel = (p) => {
        if (Number(p.price_monthly) > 0) return `${money(p.price_monthly, p.currency || 'INR')}<span style="font-size:12px;color:var(--text-soft);font-weight:600"> / mo</span>`;
        if (p.checkout_available) return 'Included';
        return '<span style="font-size:15px;font-weight:700;color:var(--text-soft)">Talk to us</span>';
      };

      const banner = loadNote
        ? `<div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;margin-bottom:16px;border-radius:var(--r-sm);background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.18);font-size:12.5px;line-height:1.55;color:var(--text)">
            <i class="fa-solid fa-circle-info" style="color:#3b82f6;margin-top:2px"></i>
            <div style="flex:1">${esc(loadNote)} Your POS keeps working as normal.</div>
            <button type="button" class="btn btn-ghost btn-sm" id="rs-plan-retry" style="flex-shrink:0"><i class="fa-solid fa-rotate"></i> Retry</button>
          </div>`
        : '';

      const header = `
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
          <div style="flex:1.2;min-width:220px;border:1.5px solid var(--orange);border-radius:var(--r-md);padding:18px;background:var(--orange-tint)">
            <div style="font-weight:800;font-size:12px;color:var(--orange);text-transform:uppercase;letter-spacing:.06em">Current plan</div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:26px;margin:6px 0">${esc(displayName)}</div>
            <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${sColor}">
              <span style="width:7px;height:7px;border-radius:50%;background:${sColor};display:inline-block"></span>${esc(sLabel)}
            </div>
          </div>
          <div style="flex:1;min-width:180px;border:1px solid var(--stroke-2);border-radius:var(--r-md);padding:18px;background:var(--glass)">
            <div style="font-weight:800;font-size:12px;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em">${renews ? 'Renews on' : 'Billing'}</div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:${renews ? '22px' : '16px'};margin:8px 0;line-height:1.25">${esc(fmtDate(renews))}</div>
            <div style="font-size:12px;color:var(--text-soft)">${Number(curPlan.price_monthly) > 0 ? `${money(curPlan.price_monthly, curPlan.currency)} / month` : 'Plan assigned by RestroSuite'}</div>
          </div>
          <div style="flex:1;min-width:180px;border:1px solid var(--stroke-2);border-radius:var(--r-md);padding:18px;background:var(--glass)">
            <div style="font-weight:800;font-size:12px;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em">Workspace limits</div>
            <div style="margin-top:10px;font-size:13px;line-height:1.7;color:var(--text)">
              <div><i class="fa-solid fa-users" style="width:16px;color:var(--text-soft)"></i> <strong>${esc(maxStaff)}</strong> staff seats</div>
              <div><i class="fa-solid fa-receipt" style="width:16px;color:var(--text-soft)"></i> <strong>${esc((Number(orderLim) || 0).toLocaleString() || '—')}</strong> orders / month</div>
              <div><i class="fa-solid fa-headset" style="width:16px;color:var(--text-soft)"></i> ${esc(curPlan.support_level || 'standard')} support</div>
            </div>
          </div>
        </div>`;

      const included = FEATURES[curCode] || FEATURES.starter;
      const includedBlock = `
        <div style="margin-bottom:20px;border:1px solid var(--stroke-2);border-radius:var(--r-md);padding:14px 16px;background:var(--panel)">
          <div style="font-weight:800;font-size:12px;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Included with ${esc(displayName)}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 14px">
            ${included.map(f => `<div style="font-size:12.5px;color:var(--text);display:flex;gap:8px;align-items:flex-start"><i class="fa-solid fa-circle-check" style="color:#22c55e;margin-top:2px"></i><span>${esc(f)}</span></div>`).join('')}
          </div>
        </div>`;

      // Merge fallback prices when remote plans are free / missing checkout
      plans = plans.map((p) => {
        const code = String(p.plan_code || '').toLowerCase();
        const fb = FALLBACK_PLANS.find((x) => x.plan_code === code);
        if (!fb) return p;
        const price = Number(p.price_monthly) > 0 ? Number(p.price_monthly) : Number(fb.price_monthly) || 0;
        const canStd = price > 0 && (p.checkout_available || fb.standard_checkout || fb.checkout_available);
        return Object.assign({}, p, {
          price_monthly: price,
          currency: p.currency || fb.currency || 'INR',
          checkout_available: !!(p.checkout_available || canStd),
          standard_checkout: !!(p.standard_checkout || fb.standard_checkout || (canStd && !p.razorpay_plan_id)),
        });
      });

      const cards = plans.map(p => {
        const code = String(p.plan_code || '').toLowerCase();
        const isCurrent = code === curCode;
        const priceMo = Number(p.price_monthly) || 0;
        const canCheckout = priceMo > 0 && !isCurrent && code !== 'starter';
        const feats = FEATURES[code] || [
          `Up to ${p.max_staff != null ? p.max_staff : '—'} staff`,
          `${(Number(p.monthly_order_limit) || 0).toLocaleString()} orders/mo`,
          `${p.support_level || 'standard'} support`,
        ];
        let cta;
        if (isCurrent) {
          cta = `<button type="button" class="btn btn-ghost btn-sm" disabled style="width:100%;opacity:.75"><i class="fa-solid fa-check"></i> Your plan</button>`;
        } else if (canCheckout) {
          cta = `<button type="button" class="btn btn-primary btn-sm rs-upgrade-btn" data-plan="${esc(p.plan_code)}" data-plan-name="${esc(p.name)}" data-price="${priceMo}" data-currency="${esc(p.currency || 'INR')}" style="width:100%"><i class="fa-solid fa-lock"></i> Pay ${esc(money(priceMo, p.currency || 'INR'))}/mo · ${esc(p.name)}</button>`;
        } else {
          cta = `<button type="button" class="btn btn-ghost btn-sm rs-contact-btn" data-plan="${esc(p.plan_code)}" data-plan-name="${esc(p.name)}" style="width:100%"><i class="fa-solid fa-headset"></i> Request ${esc(p.name)}</button>`;
        }
        return `
          <div style="flex:1;min-width:200px;max-width:320px;border:1.5px solid ${isCurrent ? 'var(--orange)' : 'var(--stroke-2)'};border-radius:var(--r-md);padding:16px;background:var(--panel);display:flex;flex-direction:column;gap:8px;box-shadow:${isCurrent ? '0 0 0 1px color-mix(in srgb,var(--orange) 25%,transparent)' : 'none'}">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="font-weight:800;font-size:15px">${esc(p.name)}</div>
              ${isCurrent ? '<span class="set-chip set-chip-warn" style="font-size:10px">Current</span>' : ''}
            </div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:22px;min-height:32px">${priceLabel(p)}</div>
            <ul style="margin:0;padding:0;list-style:none;font-size:11.5px;color:var(--text-soft);line-height:1.65;flex:1">
              ${feats.slice(0, 5).map(f => `<li style="display:flex;gap:6px"><i class="fa-solid fa-check" style="color:var(--orange);margin-top:3px;font-size:10px"></i><span>${esc(f)}</span></li>`).join('')}
            </ul>
            <div style="padding-top:6px">${cta}</div>
          </div>`;
      }).join('');

      const footerNote = anyCheckout
        ? 'Secure online checkout is available when configured for your region. Subscriptions renew automatically while billing is current.'
        : 'Plan changes are managed by RestroSuite. Online self-serve checkout is not required — email us and we will update your workspace.';

      const helpRow = `
        <div style="margin-top:18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid var(--stroke-2);border-radius:var(--r-md);background:var(--glass)">
          <div style="min-width:200px">
            <div style="font-weight:700;font-size:13px">Need a plan change or invoice?</div>
            <div style="font-size:12px;color:var(--text-soft);margin-top:3px;line-height:1.5">We handle upgrades, renewals, and billing questions for your outlet.</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <a class="btn btn-primary btn-sm" href="mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Plan upgrade — ' + (sess.tenant_name || sess.tenant_slug || 'RestroSuite'))}"><i class="fa-solid fa-envelope"></i> Email support</a>
            <button type="button" class="btn btn-ghost btn-sm" id="rs-plan-copy-id"><i class="fa-solid fa-copy"></i> Copy outlet ID</button>
          </div>
        </div>
        <div style="margin-top:14px;padding:14px 16px;border:1px dashed color-mix(in srgb,var(--orange) 35%,var(--stroke));border-radius:var(--r-md);background:color-mix(in srgb,var(--orange) 6%,var(--panel))">
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
            <div style="min-width:200px;flex:1">
              <div style="font-weight:800;font-size:13px"><i class="fa-solid fa-shield-halved" style="color:var(--orange);margin-right:6px"></i>Razorpay Standard Checkout</div>
              <div style="font-size:12px;color:var(--text-soft);margin-top:4px;line-height:1.5">Secure one-time payment (test mode). Order is created on the server; signature is verified before marking success.</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <label style="font-size:11px;color:var(--text-soft);font-weight:700">₹
                <input type="number" id="rs-rzp-amount" min="1" step="1" value="1" style="width:72px;margin-left:4px;padding:7px 8px;border-radius:8px;border:1px solid var(--stroke);background:var(--panel);color:var(--text)">
              </label>
              <button type="button" class="btn btn-primary btn-sm" id="rs-rzp-pay-btn"><i class="fa-solid fa-lock"></i> Pay with Razorpay</button>
              <a class="btn btn-ghost btn-sm" href="pay.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open pay page</a>
            </div>
          </div>
        </div>
        <p style="font-size:11.5px;color:var(--text-soft);margin-top:12px;line-height:1.6">${esc(footerNote)}</p>`;

      container.innerHTML = banner + header + includedBlock +
        `<div style="font-weight:800;font-size:12px;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Compare plans</div>
         <div style="display:flex;gap:12px;flex-wrap:wrap">${cards}</div>` + helpRow;

      container.querySelector('#rs-plan-retry')?.addEventListener('click', () => {
        container.innerHTML = `<div class="set-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading your plan…</div>`;
        initPlanPanel(body);
      });

      container.querySelector('#rs-plan-copy-id')?.addEventListener('click', async () => {
        const id = sess.tenant_slug || sess.tenant_id || '';
        if (!id) { RS.toast('Outlet ID not available on this session.', 'fa-circle-info'); return; }
        try {
          await navigator.clipboard.writeText(String(id));
          RS.toast('Outlet ID copied', 'fa-copy');
        } catch (_) {
          RS.toast(String(id), 'fa-circle-info');
        }
      });

      const runStandardPlanCheckout = async (planCode, planName, priceInr) => {
        const api = await ensureRazorpayHelper();
        const rupees = Math.max(1, Number(priceInr) || 1);
        const result = await api.payRupees(rupees, {
          name: 'RestroSuite',
          description: (planName || planCode) + ' · monthly',
          purpose: 'plan',
          prefillName: sess.display_name || sess.username || '',
          prefillEmail: sess.email || '',
          prefillContact: sess.phone || '',
          notes: {
            purpose: 'plan',
            plan_code: planCode || '',
            plan_name: planName || '',
            tenant: sess.tenant_slug || sess.tenant_id || '',
            tenant_name: sess.tenant_name || '',
          },
          meta: {
            plan_code: planCode || '',
            tenant: sess.tenant_slug || sess.tenant_id || '',
          },
        });
        if (result && result.cancelled) {
          RS.toast('Payment cancelled', 'fa-circle-info');
          return null;
        }
        if (result && result.verified) {
          try {
            // Optimistic local plan marker until admin/webhook activates entitlements
            sessionStorage.setItem('rs_plan_code', planCode || '');
            sessionStorage.setItem('rs_plan_name', planName || planCode || '');
            sessionStorage.setItem('rs_subscription_status', 'active');
            sessionStorage.setItem(
              'rs_last_plan_payment',
              JSON.stringify({
                plan_code: planCode,
                payment_id: result.payment_id,
                order_id: result.order_id,
                at: new Date().toISOString(),
              })
            );
          } catch (_) {}
          RS.toast(
            'Paid · ' + (planName || planCode) + ' · ' + (result.payment_id || 'ok'),
            'fa-circle-check'
          );
          setTimeout(() => initPlanPanel(body), 600);
          return result;
        }
        throw new Error('Payment not verified');
      };

      container.querySelectorAll('.rs-upgrade-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const plan = btn.getAttribute('data-plan');
          const planName = btn.getAttribute('data-plan-name') || plan;
          const price = Number(btn.getAttribute('data-price')) || 0;
          btn.disabled = true;
          const orig = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Starting checkout…';
          try {
            // Prefer legacy subscription short_url when configured
            if (window.RS_API && typeof RS_API.subscribe === 'function') {
              try {
                const res = await RS_API.subscribe(plan);
                if (res && res.short_url) {
                  window.open(res.short_url, '_blank', 'noopener');
                  RS.toast('Complete payment in the new tab to activate your plan.', 'fa-arrow-up-right-from-square');
                  return;
                }
              } catch (subErr) {
                // Fall through to Standard Checkout
                console.warn('[plan] subscription checkout unavailable', subErr);
              }
            }
            if (price > 0) {
              await runStandardPlanCheckout(plan, planName, price);
            } else {
              throw new Error('No price configured for this plan. Email support to upgrade.');
            }
          } catch (e) {
            RS.toast((e && e.message) || 'Could not start checkout. Email support to upgrade.', 'fa-headset');
          } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
          }
        });
      });

      // Razorpay Standard Checkout (one-time pay) — server create-order + verify-payment
      const ensureRazorpayHelper = () => new Promise((resolve, reject) => {
        if (window.RSRazorpay && typeof RSRazorpay.openCheckout === 'function') {
          resolve(window.RSRazorpay);
          return;
        }
        const existing = document.querySelector('script[data-rs-razorpay]');
        if (existing) {
          existing.addEventListener('load', () => {
            window.RSRazorpay ? resolve(window.RSRazorpay) : reject(new Error('Razorpay helper failed to load'));
          });
          existing.addEventListener('error', () => reject(new Error('Could not load Razorpay helper')));
          return;
        }
        const s = document.createElement('script');
        s.src = 'assets/razorpay-checkout.js';
        s.async = true;
        s.dataset.rsRazorpay = '1';
        s.onload = () => {
          window.RSRazorpay ? resolve(window.RSRazorpay) : reject(new Error('Razorpay helper failed to load'));
        };
        s.onerror = () => reject(new Error('Could not load Razorpay helper'));
        document.head.appendChild(s);
      });

      container.querySelector('#rs-rzp-pay-btn')?.addEventListener('click', async () => {
        const btn = container.querySelector('#rs-rzp-pay-btn');
        const amtEl = container.querySelector('#rs-rzp-amount');
        const rupees = Math.max(1, Number(amtEl && amtEl.value) || 1);
        const orig = btn ? btn.innerHTML : '';
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Opening…';
        }
        try {
          const api = await ensureRazorpayHelper();
          const result = await api.payRupees(rupees, {
            name: 'RestroSuite',
            description: 'Plan / workspace payment · ₹' + rupees,
            purpose: 'plan',
            prefillName: sess.display_name || sess.username || '',
            prefillEmail: sess.email || '',
            prefillContact: sess.phone || '',
            notes: {
              purpose: 'plan',
              tenant: sess.tenant_slug || sess.tenant_id || '',
              source: 'settings_plan_quick_pay',
            },
            meta: { tenant: sess.tenant_slug || sess.tenant_id || '' },
          });
          if (result && result.cancelled) {
            RS.toast('Payment cancelled', 'fa-circle-info');
          } else if (result && result.verified) {
            RS.toast(
              'Payment verified · ' + (result.payment_id || 'success'),
              'fa-circle-check'
            );
          } else {
            RS.toast('Payment not confirmed', 'fa-circle-exclamation');
          }
        } catch (e) {
          RS.toast((e && e.message) || 'Payment failed', 'fa-circle-exclamation');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = orig;
          }
        }
      });

      container.querySelectorAll('.rs-contact-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const planName = btn.getAttribute('data-plan-name') || btn.getAttribute('data-plan') || 'a new plan';
          const subject = encodeURIComponent(`Request ${planName} plan — ${sess.tenant_name || sess.tenant_slug || 'outlet'}`);
          const bodyTxt = encodeURIComponent(
            `Hi RestroSuite,\n\nPlease upgrade our workspace.\n\nOutlet: ${sess.tenant_name || ''}\nSlug: ${sess.tenant_slug || ''}\nRequested plan: ${planName}\n\nThank you.`
          );
          window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${bodyTxt}`;
          RS.toast('Opening email to request this plan…', 'fa-envelope');
        });
      });

      // Quiet success path marker for support / diagnostics
      try { container.dataset.planSource = remoteOk ? 'live' : 'session-fallback'; } catch (_) {}
    }

    // -- Razorpay Route onboarding panel --------------------------------------
    async function initRazorpayRoutePanel(body) {
      const container = body.querySelector('#rzp-route-container');
      if (!container) return;

      const country = (window.RS_SETTINGS && RS_SETTINGS.set_country) || 'India';
      const isStripe = (country.toLowerCase() === 'ireland' || country.toLowerCase() === 'ie' || country.toLowerCase() !== 'india');

      function pill(text, color) {
        return `<span class="pill" style="padding:5px 12px;background:rgba(${color},0.12);color:rgb(${color})"><span class="dot" style="background:rgb(${color})"></span>${text}</span>`;
      }

      /** Calm empty / not-ready state — not a scary red error. */
      function renderNotEnabled(opts) {
        const title = opts.title || 'Online settlement';
        const provider = opts.provider || 'Razorpay';
        const detail = opts.detail || '';
        const isAuth = !!opts.needSignIn;
        container.innerHTML = `
          <div class="set-row" style="margin-bottom:14px">
            <div class="si">
              <div class="st">${title}</div>
              <div class="sd">Guest card / UPI auto-settlement to your bank (optional)</div>
            </div>
            ${pill(isAuth ? 'Sign in required' : 'Not enabled yet', isAuth ? '239, 68, 68' : '107, 114, 128')}
          </div>
          <div style="background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:14px 16px;font-size:13px;line-height:1.7;color:var(--text);">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <i class="fa-solid ${isAuth ? 'fa-lock' : 'fa-circle-info'}" style="color:var(--orange);margin-top:3px"></i>
              <div>
                <div style="font-weight:700;margin-bottom:6px">${isAuth
                  ? 'Please sign in again to check settlement status.'
                  : `${provider} settlement is not set up for this outlet yet.`}</div>
                <div style="color:var(--text-soft);font-size:12.5px">
                  ${detail || (isAuth
                    ? 'Log out and sign back in, then return to this page.'
                    : `You do not need this to run the restaurant. Take payments as usual with <strong>Cash</strong> and <strong>UPI at the counter</strong>. When ${provider} is enabled for your workspace, bank settlement for online card/UPI can be connected here.`)}
                </div>
                ${opts.hint ? `<div style="margin-top:10px;font-size:12px;color:var(--text-soft)">${opts.hint}</div>` : ''}
              </div>
            </div>
          </div>
          ${opts.retry ? `<div style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" id="btn-pay-status-retry"><i class="fa-solid fa-rotate"></i> Try again</button></div>` : ''}
        `;
        if (opts.retry) {
          container.querySelector('#btn-pay-status-retry')?.addEventListener('click', () => {
            container.innerHTML = `<div class="set-loading"><i class="fa-solid fa-spinner fa-spin"></i> Checking payment status…</div>`;
            initRazorpayRoutePanel(body);
          });
        }
      }

      function renderSoftError(msg) {
        renderNotEnabled({
          title: isStripe ? 'Stripe Connect' : 'Razorpay Route',
          provider: isStripe ? 'Stripe' : 'Razorpay',
          detail: msg || 'We could not check settlement status right now. Your POS cash and counter UPI still work normally.',
          hint: 'If this keeps happening after a refresh, contact RestroSuite support — no action is required to keep selling.',
          retry: true,
        });
      }

      const supabaseUrl = window.__SUPABASE_URL__ || '';
      const supabaseKey = window.__SUPABASE_ANON_KEY__ || '';
      const session = window.RS_API && RS_API.session && RS_API.session();
      const token   = session && (session.access_token || session.token);
      if (!supabaseUrl || !token) {
        renderNotEnabled({ needSignIn: true, title: isStripe ? 'Stripe Connect' : 'Razorpay Route', provider: isStripe ? 'Stripe' : 'Razorpay' });
        return;
      }

      if (isStripe) {
        // --- STRIPE CONNECT EXPRESS PATH ---
        let status = null;
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/stripe-connect`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'apikey':        supabaseKey,
              'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({ action: 'get_account' }),
          });
          status = await res.json().catch(() => ({}));
          if (!res.ok || status.error) {
            // Platform not ready / not applied — calm message, not a hard failure
            renderNotEnabled({
              title: 'Stripe Connect',
              provider: 'Stripe',
              detail: 'Card settlement via Stripe is not enabled for this workspace yet. Counter payments (cash / card terminal) still work as usual.',
              hint: 'RestroSuite has not finished Stripe onboarding for this account. You can keep operating without this step.',
              retry: true,
            });
            return;
          }
        } catch(e) {
          renderSoftError('Could not reach settlement services. Check your connection and try again when convenient.');
          return;
        }

        if (status.stripe_enabled && status.stripe_kyc_status === 'active') {
          container.innerHTML = `
            <div class="set-row" style="margin-bottom:16px">
              <div class="si"><div class="st">Stripe Connect</div><div class="sd">Dine-in QR card payments go directly to your Stripe account.</div></div>
              ${pill('Connected & Active', '16, 185, 129')}
            </div>
            <div style="background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:14px 16px;font-size:13px;line-height:1.8;">
              <div><span style="color:var(--text-soft)">Stripe Account ID:</span> <strong>${status.stripe_account_id || '--'}</strong></div>
              <div><span style="color:var(--text-soft)">Settlement:</span> <strong>Directly to your registered bank account via Stripe</strong></div>
              <div><span style="color:var(--text-soft)">Customer payment methods:</span> <strong>Credit/Debit Cards · Apple Pay · Google Pay</strong></div>
            </div>
            <p style="font-size:11.5px;color:var(--text-soft);margin-top:10px;">To update your bank details or KYC, click "Onboard/Manage" to visit Stripe Dashboard.</p>
            <div style="margin-top:14px;">
              <button class="btn btn-primary" id="btn-stripe-manage"><i class="fa-solid fa-arrow-up-right-from-square"></i> Manage Stripe Account</button>
            </div>
          `;
          container.querySelector('#btn-stripe-manage').onclick = async function() {
            const btn = this;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Getting link...';
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/stripe-connect`, {
                method: 'POST',
                headers: {
                  'Content-Type':  'application/json',
                  'apikey':        supabaseKey,
                  'Authorization': 'Bearer ' + token,
                },
                body: JSON.stringify({ action: 'onboard_account', country: 'IE' }),
              });
              const data = await res.json();
              if (data.onboarding_url) {
                window.location.href = data.onboarding_url;
              } else {
                toast('Failed to get dashboard link: ' + (data.error || 'unknown error'), 'fa-circle-exclamation');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Manage Stripe Account';
              }
            } catch (err) {
              toast('Connection failed', 'fa-circle-exclamation');
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Manage Stripe Account';
            }
          };
          return;
        }

        // -- Setup in progress / pending --
        if (status.stripe_account_id) {
          container.innerHTML = `
            <div class="set-row" style="margin-bottom:16px">
              <div class="si"><div class="st">Stripe Connect</div><div class="sd">Stripe account created but onboarding is incomplete.</div></div>
              ${pill('Incomplete Setup', '234, 179, 8')}
            </div>
            <div style="background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:14px 16px;font-size:13px;line-height:1.6;margin-bottom:14px;">
              <div><span style="color:var(--text-soft)">Stripe Account ID:</span> <strong>${status.stripe_account_id}</strong></div>
              <p style="color:var(--text-soft);margin-top:6px;">Please complete the Stripe Express onboarding verification to start accepting card payments from customers.</p>
            </div>
            <button class="btn btn-primary" id="btn-stripe-resume"><i class="fa-brands fa-stripe"></i> Complete Stripe Setup</button>
          `;
          container.querySelector('#btn-stripe-resume').onclick = async function() {
            const btn = this;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Redirecting...';
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/stripe-connect`, {
                method: 'POST',
                headers: {
                  'Content-Type':  'application/json',
                  'apikey':        supabaseKey,
                  'Authorization': 'Bearer ' + token,
                },
                body: JSON.stringify({ action: 'onboard_account', country: 'IE' }),
              });
              const data = await res.json();
              if (data.onboarding_url) {
                window.location.href = data.onboarding_url;
              } else {
                toast('Error: ' + (data.error || 'onboarding failed'), 'fa-circle-exclamation');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-brands fa-stripe"></i> Complete Stripe Setup';
              }
            } catch (err) {
              toast('Connection failed', 'fa-circle-exclamation');
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-brands fa-stripe"></i> Complete Stripe Setup';
            }
          };
          return;
        }

        // -- Not connected / not enabled on this outlet --
        renderNotEnabled({
          title: 'Stripe Connect',
          provider: 'Stripe',
          detail: 'Card settlement via Stripe is not connected for this outlet yet. You can keep taking payments at the counter as usual.',
          hint: 'When RestroSuite enables Stripe for your workspace, you will connect your bank account from this page.',
        });
        return;
      }

      // --- RAZORPAY COMPATIBILITY PATH (India) ---
      let status = null;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/razorpay-route`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        supabaseKey,
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify({ action: 'get_account' }),
        });
        status = await res.json().catch(() => ({}));
        if (!res.ok || status.error) {
          // Platform has not applied / keys missing / auth not ready — calm UX
          renderNotEnabled({
            title: 'Razorpay Route',
            provider: 'Razorpay',
            detail: 'Razorpay settlement is not set up for this workspace yet. You do not need to apply or enter bank details here right now.',
            hint: 'Keep using Cash and counter UPI in POS. When RestroSuite enables Razorpay Route, online card/UPI can settle straight to your bank from this page.',
            retry: true,
          });
          return;
        }
      } catch(e) {
        renderSoftError('Could not reach settlement services. Check your connection and try again when convenient.');
        return;
      }

      // -- Already activated ----------------------------------------------------
      if (status.razorpay_route_enabled && status.razorpay_kyc_status === 'activated') {
        container.innerHTML = `
          <div class="set-row" style="margin-bottom:16px">
            <div class="si"><div class="st">Razorpay Route</div><div class="sd">Customer payments go directly to your bank account via Razorpay.</div></div>
            ${pill('Active', '16, 185, 129')}
          </div>
          <div style="background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:14px 16px;font-size:13px;line-height:1.8;">
            <div><span style="color:var(--text-soft)">Linked account:</span> <strong>${status.razorpay_account_id || '--'}</strong></div>
            <div><span style="color:var(--text-soft)">Settlement:</span> <strong>T+2 business days to your registered bank</strong></div>
            <div><span style="color:var(--text-soft)">Customer payment methods:</span> <strong>UPI · Cards · Netbanking · Wallets</strong></div>
          </div>
          <p style="font-size:11.5px;color:var(--text-soft);margin-top:10px;">To change bank account or KYC details, contact Razorpay support directly with account ID above.</p>
        `;
        return;
      }

      // -- KYC submitted, waiting for Razorpay approval -------------------------
      if (status.razorpay_account_id && status.razorpay_kyc_status === 'pending') {
        container.innerHTML = `
          <div class="set-row" style="margin-bottom:16px">
            <div class="si"><div class="st">Razorpay Route</div><div class="sd">KYC submitted and under review by Razorpay.</div></div>
            ${pill('Pending KYC', '234, 179, 8')}
          </div>
          <div style="background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:14px 16px;font-size:13px;">
            <div style="margin-bottom:8px"><span style="color:var(--text-soft)">Linked account ID:</span> <strong>${status.razorpay_account_id}</strong></div>
            <p style="color:var(--text-soft);line-height:1.6;margin:0;">Razorpay typically approves within 1-2 business days. RestroSuite will automatically enable Route payments the moment your account is activated. No action needed from you.</p>
          </div>
        `;
        return;
      }

      // -- Not set up yet (platform has not enabled Razorpay for this outlet) ---
      renderNotEnabled({
        title: 'Razorpay Route',
        provider: 'Razorpay',
        detail: 'Razorpay settlement is not connected for this outlet yet. No bank or PAN details are required from you right now.',
        hint: 'POS Cash and counter UPI work as normal. When RestroSuite enables Razorpay Route, you can link settlement from this page.',
      });
    }

    function settingsRole(){
      const meta = (window.RS_API && RS_API.session && RS_API.session()) || {};
      return String(meta.role || sessionStorage.getItem('logged_in_role') || 'owner').toLowerCase().trim();
    }
    function renderSettings(){
      const sec = $('#settings-tab');
      // -- Role gate (audit finding #2): Settings was reachable by every role,
      // including the Danger Zone data-wipe and Plan & Billing. Only the
      // outlet owner/admin gets the full screen; managers get an operational
      // subset; every other staff role is blocked entirely.
      const role = settingsRole();
      const isOwnerAdmin = ['owner','admin','superadmin','super_admin'].includes(role);
      const isManager = role === 'manager';
      if (!isOwnerAdmin && !isManager) {
        sec.innerHTML = `<div class="panel panel-pad" style="text-align:center;padding:48px 24px">
          <i class="fa-solid fa-lock" style="font-size:40px;color:var(--text-mute);margin-bottom:14px;display:block"></i>
          <h3 style="margin:0 0 6px">Settings is restricted</h3>
          <div style="font-size:13.5px;color:var(--text-soft)">Your role does not have access to outlet settings. Ask the outlet owner or a manager if something needs changing.</div>
        </div>`;
        return;
      }
      const NAV = SET_NAV.filter(s => isOwnerAdmin || !['plan','danger'].includes(s[0]));
      // Build grouped side-nav: Outlet · Operations · Access · Account
      let navHtml = '';
      let lastGroup = '';
      NAV.forEach((s, i) => {
        const group = s[3] || '';
        if (group && group !== lastGroup) {
          navHtml += `<div class="set-nav-group">${group}</div>`;
          lastGroup = group;
        }
        navHtml += `<button type="button" class="${i===0?'active':''}" data-s="${s[0]}" title="${s[1]}"><i class="fa-solid ${s[2]}"></i><span>${s[1]}</span></button>`;
      });
      sec.innerHTML = `<div class="set-page">
        <header class="set-page-head">
          <div class="set-page-titles">
            <h2 class="set-page-title">Settings</h2>
            <p class="set-page-sub">Outlet profile, taxes, printers, WhatsApp, payments, security, and account</p>
          </div>
        </header>
        <div class="set-layout">
          <nav class="set-nav" aria-label="Settings sections">${navHtml}</nav>
          <div class="set-main panel">
            <header class="set-pane-head">
              <div>
                <h3 id="set-pane-title" class="set-pane-title">Outlet profile</h3>
                <p id="set-pane-sub" class="set-pane-sub">Name, address, country, and guest QR card details</p>
              </div>
            </header>
            <div id="set-body" class="set-body"></div>
            <footer class="set-save-bar">
              <span class="set-save-hint" id="set-save-hint">Toggles apply instantly · Save also syncs to cloud</span>
              <div class="set-save-actions">
                <button type="button" class="btn btn-ghost" id="set-cancel">Discard</button>
                <button type="button" class="btn btn-primary" id="set-save"><i class="fa-solid fa-circle-check"></i> Save changes</button>
              </div>
            </footer>
          </div>
        </div>
      </div>`;
      const body = $('#set-body');
      let SET_STORE = {};
      let outletGatewayInterval = null;
      async function requestFreshQr(tenantId, btn) {
        if (window.__rsGatewayReady) {
          if (!confirm('WhatsApp is already connected.\n\nGet a new QR code? This unlinks the current number until you scan again.')) {
            return;
          }
        }
        if (btn) {
          btn.disabled = true;
          const prev = btn.innerHTML;
          btn.dataset.prevHtml = prev;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Getting QR…';
        }
        try {
          await RS_API.data({ operation: 'gateway_reset', tenantId: tenantId });
          if (window.RS && RS.toast) RS.toast('Preparing a new QR code…', 'fa-qrcode');
        } catch (e) {
          if (window.RS && RS.toast) RS.toast('Could not start QR. Please try again.', 'fa-circle-exclamation');
        }
        if (outletGatewayInterval) {
          clearInterval(outletGatewayInterval);
          outletGatewayInterval = setInterval(pollOutletGateway, 2500);
        }
        setTimeout(() => {
          pollOutletGateway();
          if (btn) {
            btn.disabled = false;
            if (btn.dataset.prevHtml) btn.innerHTML = btn.dataset.prevHtml;
          }
        }, 2800);
      }

      function wireFreshQrButtons(container, tenantId) {
        if (!container) return;
        container.querySelectorAll('[data-wa-fresh-qr]').forEach((btn) => {
          if (btn.dataset.bound === '1') return;
          btn.dataset.bound = '1';
          btn.onclick = () => requestFreshQr(tenantId, btn);
        });
      }

      // Number tip lives once in the static settings layout (not repeated in status states)
      const WA_NUM_TIP = '';

      async function pollOutletGateway() {
        const container = body.querySelector('#outlet-gateway-status-container');
        if (!container) {
          stopOutletGatewayPolling();
          return;
        }
        const sessionMeta = (window.RS_API && RS_API.session && RS_API.session()) || {};
        const tenantId = sessionMeta.tenant_id || sessionStorage.getItem('tenant_id') || sessionStorage.getItem('tenant_slug') || 'local-demo';
        
        // 1. Poll Gateway Status
        try {
          const res = await RS_API.data({ operation: 'gateway_status', tenantId: tenantId });
          if (!res || res.error) {
            container.innerHTML = `<div style="border:1px solid var(--stroke);border-radius:14px;padding:20px;text-align:center;background:var(--panel)">
              <div class="set-row" style="margin:0 0 14px;text-align:left"><div class="si"><div class="st">Connection</div><div class="sd" style="color:#ef4444">Could not check status</div></div><span class="pill pill-red" style="padding:5px 12px">Offline</span></div>
              <button type="button" class="btn btn-primary" data-wa-fresh-qr><i class="fa-solid fa-qrcode"></i> Get QR code</button>
            </div>`;
            wireFreshQrButtons(container, tenantId);
          } else if (res.status === 'ready') {
            container.innerHTML = `<div style="border:1px solid color-mix(in srgb,#22c55e 35%,var(--stroke));border-radius:14px;padding:16px 18px;background:color-mix(in srgb,#22c55e 6%,var(--panel))">
              <div class="set-row" style="margin:0 0 12px"><div class="si"><div class="st">Connection</div><div class="sd">Bills send from <b>your</b> WhatsApp automatically</div></div><span class="pill pill-green" style="padding:5px 12px"><span class="dot dot-live"></span> Your number</span></div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                <div style="font-size:14px;color:var(--text)">Linked: <strong>+${res.number || '—'}</strong></div>
                <button type="button" class="btn btn-ghost btn-sm" id="btn-outlet-gateway-logout" style="color:#ef4444"><i class="fa-solid fa-power-off"></i> Unlink</button>
              </div>
            </div>`;
            const logoutBtn = container.querySelector('#btn-outlet-gateway-logout');
            if (logoutBtn) {
              logoutBtn.onclick = async () => {
                if (!confirm('Unlink WhatsApp from this outlet? You will need to scan a new QR code to connect again.')) return;
                logoutBtn.disabled = true;
                logoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Unlinking…';
                try {
                  await RS_API.data({ operation: 'gateway_logout', tenantId: tenantId });
                  pollOutletGateway();
                  if (typeof window.updateTopbarWhatsAppStatus === 'function') window.updateTopbarWhatsAppStatus();
                } catch (err) {
                  console.error(err);
                  RS.toast('Could not unlink WhatsApp. Please try again.', 'fa-circle-exclamation');
                  logoutBtn.disabled = false;
                  logoutBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Unlink';
                }
              };
            }
          } else if (res.status === 'linked' || (res.linked && !res.live && res.sendMode === 'own')) {
            // Lazy own-number: linked, cold in RAM — wakes on first bill
            container.innerHTML = `<div style="border:1px solid color-mix(in srgb,#22c55e 35%,var(--stroke));border-radius:14px;padding:16px 18px;background:color-mix(in srgb,#22c55e 6%,var(--panel))">
              <div class="set-row" style="margin:0 0 12px"><div class="si"><div class="st">Your WhatsApp</div><div class="sd">Linked — auto-connects when you send a bill (saves server RAM)</div></div><span class="pill pill-green" style="padding:5px 12px"><span class="dot dot-live"></span> Linked</span></div>
              <p style="margin:0 0 12px;font-size:12.5px;color:var(--text-soft);line-height:1.45">Bills send from <b>your</b> number. First send after idle may take a few seconds while we wake the session.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-ghost btn-sm" data-wa-fresh-qr><i class="fa-solid fa-qrcode"></i> Re-scan QR</button>
                <button type="button" class="btn btn-ghost btn-sm" id="btn-outlet-gateway-logout" style="color:#ef4444"><i class="fa-solid fa-power-off"></i> Unlink</button>
              </div>
            </div>`;
            wireFreshQrButtons(container, tenantId);
            const logoutBtn = container.querySelector('#btn-outlet-gateway-logout');
            if (logoutBtn) {
              logoutBtn.onclick = async () => {
                if (!confirm('Unlink WhatsApp from this outlet?')) return;
                logoutBtn.disabled = true;
                try {
                  await RS_API.data({ operation: 'gateway_logout', tenantId: tenantId });
                  pollOutletGateway();
                  if (typeof window.updateTopbarWhatsAppStatus === 'function') window.updateTopbarWhatsAppStatus();
                } catch (err) {
                  RS.toast('Could not unlink. Try again.', 'fa-circle-exclamation');
                  logoutBtn.disabled = false;
                }
              };
            }
          } else if (res.canAutomate || res.platformReady || res.sendMode === 'platform') {
            // Platform automation — blue (not green): central line, own number not linked
            const pn = res.platformNumber ? ('+' + res.platformNumber) : 'platform line';
            container.innerHTML = `<div style="border:1px solid color-mix(in srgb,#0ea5e9 40%,var(--stroke));border-radius:14px;padding:16px 18px;background:color-mix(in srgb,#0ea5e9 8%,var(--panel))">
              <div class="set-row" style="margin:0 0 12px"><div class="si"><div class="st">Automation</div><div class="sd">Bills send from <b>central</b> WhatsApp (${pn}) until you link yours</div></div><span class="pill" style="padding:5px 12px;background:rgba(14,165,233,.14);color:#0284c7;border:1px solid rgba(14,165,233,.35)"><span class="dot" style="background:#0ea5e9"></span> Platform</span></div>
              <p style="margin:0 0 12px;font-size:12.5px;color:var(--text-soft);line-height:1.45"><b>Green</b> top-bar icon = your restaurant number linked. <b>Blue</b> = central line only. Scan QR once to use your own WhatsApp.</p>
              <button type="button" class="btn btn-primary btn-sm" data-wa-fresh-qr><i class="fa-solid fa-qrcode"></i> Link my WhatsApp</button>
            </div>`;
            wireFreshQrButtons(container, tenantId);
          } else if (res.status === 'qr') {
            if (res.qr) {
              if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 3000); }
              const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
                || !!(window.RS_ANDROID || window.RS_NATIVE_APP)
                || (window.matchMedia && window.matchMedia('(max-width: 820px)').matches);
              const mobileHint = isMobile
                ? `<div style="margin:0 0 10px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,#f59e0b 12%,var(--panel));border:1px solid color-mix(in srgb,#f59e0b 30%,var(--stroke));font-size:12.5px;color:var(--text);line-height:1.5;text-align:left;max-width:340px">
                    <b>Using a phone for RestroSuite?</b> You cannot scan this QR with the same phone’s camera easily.
                    <br>• Best: open <b>Settings → WhatsApp</b> on a <b>tablet / PC / second screen</b>, then on <b>this phone</b> open WhatsApp → <b>Linked devices → Link a device</b> and scan.
                    <br>• Or open this page on another device and scan with your WhatsApp phone.
                  </div>`
                : '';
              container.innerHTML = `<div style="border:1px solid var(--stroke);border-radius:14px;padding:18px;background:var(--panel)">
                <div class="set-row" style="margin:0 0 14px"><div class="si"><div class="st">Connection</div><div class="sd">Scan with WhatsApp (not the RestroSuite camera)</div></div><span class="pill pill-amber" style="padding:5px 12px">Scan QR</span></div>
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
                  ${mobileHint}
                  <img src="${res.qr}" alt="WhatsApp QR" style="width:min(220px,70vw);height:auto;aspect-ratio:1;border-radius:10px;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.12);background:#fff"/>
                  <ol style="margin:0;padding-left:18px;font-size:12.5px;color:var(--text-soft);line-height:1.65;text-align:left;max-width:320px">
                    <li>On your <b>phone</b>, open the <b>WhatsApp</b> app</li>
                    <li>Tap <b>⋮ / Settings → Linked devices → Link a device</b></li>
                    <li>Point WhatsApp at <b>this QR</b> (shown on PC/tablet screen)</li>
                    <li>Wait until status turns <b>Linked</b> (green)</li>
                  </ol>
                  <p style="margin:0;font-size:11.5px;color:var(--text-mute);max-width:320px;line-height:1.45">This is <b>not</b> the table-order scanner. Table QR uses the camera button on Floor. WhatsApp link uses the <b>WhatsApp app’s</b> scanner only.</p>
                  <button type="button" class="btn btn-ghost btn-sm" data-wa-fresh-qr><i class="fa-solid fa-rotate-right"></i> New QR</button>
                </div>
              </div>`;
              wireFreshQrButtons(container, tenantId);
            } else {
              container.innerHTML = `<div style="border:1px solid var(--stroke);border-radius:14px;padding:22px;text-align:center;background:var(--panel)">
                <div style="font-size:13px;color:var(--text-soft);margin-bottom:12px"><i class="fa-solid fa-spinner fa-spin"></i> Preparing QR code…</div>
                <button type="button" class="btn btn-ghost btn-sm" data-wa-fresh-qr>Taking long? Try again</button>
              </div>`;
              wireFreshQrButtons(container, tenantId);
            }
          } else if (res.status === 'syncing' || res.status === 'authenticated') {
            if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 2000); }
            container.innerHTML = `<div style="border:1px solid color-mix(in srgb,#eab308 40%,var(--stroke));border-radius:14px;padding:28px 20px;text-align:center;background:var(--panel)">
              <div style="font-size:22px;color:#eab308;margin-bottom:10px"><i class="fa-solid fa-spinner fa-spin"></i></div>
              <div style="font-weight:800;font-size:15px;color:var(--text);margin-bottom:6px">Almost ready…</div>
              <div style="font-size:12.5px;color:var(--text-soft);margin-bottom:14px">Finishing setup — usually a few seconds.</div>
              <button type="button" class="btn btn-ghost btn-sm" data-wa-fresh-qr>Taking long? New QR</button>
            </div>`;
            wireFreshQrButtons(container, tenantId);
          } else if (res.status === 'auth_failure') {
            container.innerHTML = `<div style="border:1px solid color-mix(in srgb,#ef4444 35%,var(--stroke));border-radius:14px;padding:24px 20px;text-align:center;background:var(--panel)">
              <div style="font-weight:800;font-size:15px;color:var(--text);margin-bottom:6px">Could not link</div>
              <div style="font-size:12.5px;color:var(--text-soft);margin-bottom:14px">QR may have expired. Try a new code.</div>
              <button type="button" class="btn btn-primary btn-sm" data-wa-fresh-qr><i class="fa-solid fa-qrcode"></i> Get QR code</button>
            </div>`;
            wireFreshQrButtons(container, tenantId);
          } else if (res.status === 'connecting' || res.status === 'starting') {
            if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 2000); }
            container.innerHTML = `<div style="border:1px solid var(--stroke);border-radius:14px;padding:28px 20px;text-align:center;background:var(--panel)">
              <div style="font-size:22px;color:var(--text-mute);margin-bottom:10px"><i class="fa-solid fa-spinner fa-spin"></i></div>
              <div style="font-weight:800;font-size:15px;color:var(--text);margin-bottom:6px">Starting…</div>
              <div style="font-size:12.5px;color:var(--text-soft);margin-bottom:14px">QR will appear here in a moment.</div>
              <button type="button" class="btn btn-ghost btn-sm" data-wa-fresh-qr>Stuck? Try again</button>
            </div>`;
            wireFreshQrButtons(container, tenantId);
          } else {
            container.innerHTML = `<div style="border:1px solid var(--stroke);border-radius:14px;padding:28px 20px;text-align:center;background:var(--panel)">
              <div style="width:48px;height:48px;margin:0 auto 12px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,#25d366 12%,var(--panel));color:#25d366;font-size:22px"><i class="fa-brands fa-whatsapp"></i></div>
              <div style="font-weight:800;font-size:15px;color:var(--text);margin-bottom:6px">Connect WhatsApp</div>
              <div style="font-size:12.5px;color:var(--text-soft);line-height:1.5;max-width:340px;margin:0 auto 16px">
                Tap below to show a QR. On your <b>phone’s WhatsApp app</b>: Settings → <b>Linked devices → Link a device</b>, then scan this screen.
                <br><span style="color:var(--text-mute)">Best on a PC/tablet screen while you scan with the phone. Gateway must be online.</span>
              </div>
              <button type="button" class="btn btn-primary" data-wa-fresh-qr><i class="fa-solid fa-qrcode"></i> Get QR code</button>
            </div>`;
            wireFreshQrButtons(container, tenantId);
          }
        } catch (e) {
          console.warn('Failed to poll outlet gateway status:', e);
          container.innerHTML = `<div style="border:1px solid var(--stroke);border-radius:14px;padding:22px;text-align:center;background:var(--panel)">
            <div style="font-size:13px;color:#ef4444;margin-bottom:12px">Could not reach WhatsApp right now.</div>
            <button type="button" class="btn btn-primary btn-sm" data-wa-fresh-qr><i class="fa-solid fa-qrcode"></i> Get QR code</button>
          </div>`;
          wireFreshQrButtons(container, tenantId);
        }

        // 2. Poll Gateway Activity Logs securely (for this tenant only)
        const logsContainer = body.querySelector('#client-gateway-logs');
        if (logsContainer) {
          try {
            const logsRes = await RS_API.data({ operation: 'gateway_logs', tenantId: tenantId });
            if (logsRes && logsRes.logs) {
              const logs = logsRes.logs.slice(0, 15);
              if (logs.length === 0) {
                logsContainer.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--text-mute);">No recent WhatsApp activity yet.</div>';
              } else {
                logsContainer.innerHTML = logs.map(log => {
                  const logDate = log.created_at ? new Date(log.created_at) : new Date();
                  const timeStr = logDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                  const msg = log.details?.message || log.details?.error || 'Update';
                  const cls = log.status === 'ok' ? 'color:#22c55e' : (log.status === 'warning' ? 'color:#eab308' : 'color:#ef4444');
                  const label = String(log.event || 'update').replace(/_/g, ' ');
                  return `<div style="margin-bottom: 6px;"><span style="color:var(--text-mute);margin-right:8px;">${timeStr}</span><span style="${cls}">${label}</span> — ${String(msg).slice(0, 120)}</div>`;
                }).join('');
              }
            } else {
              logsContainer.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--text-mute);">Activity is unavailable right now.</div>';
            }
          } catch (e) {
            logsContainer.innerHTML = `<div style="text-align: center; padding: 12px; color: #ef4444;">Could not load activity. Please try again.</div>`;
          }
        }

        // 3. Wire Refresh Button Click
        const refreshBtn = body.querySelector('#btn-refresh-client-logs');
        if (refreshBtn && !refreshBtn.dataset.listenerBound) {
          refreshBtn.dataset.listenerBound = 'true';
          refreshBtn.onclick = () => {
            const icon = refreshBtn.querySelector('i');
            if (icon) icon.classList.add('fa-spin');
            pollOutletGateway().then(() => {
              if (icon) {
                setTimeout(() => icon.classList.remove('fa-spin'), 600);
              }
            });
          };
        }

        // 3b. Test send + status refresh (cockpit)
        const waRefresh = body.querySelector('#btn-wa-refresh-status');
        if (waRefresh && !waRefresh.dataset.listenerBound) {
          waRefresh.dataset.listenerBound = 'true';
          waRefresh.onclick = async () => {
            waRefresh.disabled = true;
            try {
              await pollOutletGateway();
              if (window.updateTopbarWhatsAppStatus) await window.updateTopbarWhatsAppStatus();
              RS.toast('Connection updated', 'fa-rotate');
            } catch (e) {
              RS.toast('Could not refresh. Please try again.', 'fa-circle-exclamation');
            } finally {
              waRefresh.disabled = false;
            }
          };
        }
        const ownerRep = body.querySelector('#btn-owner-wa-reports');
        if (ownerRep && !ownerRep._rsWired) {
          ownerRep._rsWired = true;
          ownerRep.onclick = () => {
            if (window.RSOwnerReports && typeof RSOwnerReports.openSettingsModal === 'function') {
              RSOwnerReports.openSettingsModal();
            } else {
              RS.toast('Owner reports module loading…', 'fa-circle-info');
            }
          };
        }
        const waTest = body.querySelector('#btn-wa-test-send');
        if (waTest && !waTest.dataset.listenerBound) {
          waTest.dataset.listenerBound = 'true';
          waTest.onclick = async () => {
            const linked = window.__rsGatewayNumber || '';
            const phone = window.prompt(
              'Send a test message to this number (with country code, e.g. 9198…):',
              linked || ''
            );
            if (phone == null) return;
            const digits = String(phone).replace(/\D/g, '');
            if (digits.length < 10) {
              RS.toast('Please enter a full mobile number with country code', 'fa-circle-exclamation');
              return;
            }
            waTest.disabled = true;
            waTest.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
            try {
              const outlet =
                sessionStorage.getItem('tenant_name') ||
                sessionMeta.tenant_name ||
                'your restaurant';
              await RS_API.data({
                operation: 'gateway_send',
                phone: digits,
                message:
                  'Test from ' +
                  outlet +
                  ' · ' +
                  new Date().toLocaleTimeString() +
                  '. If you received this, bill WhatsApp is working.',
                tenantId: tenantId,
              });
              window.__rsGatewayReady = true;
              RS.toast('Test message sent', 'fa-circle-check');
              if (window.updateTopbarWhatsAppStatus) window.updateTopbarWhatsAppStatus();
            } catch (err) {
              console.error(err);
              RS.toast('Test could not be sent. Make sure WhatsApp is connected.', 'fa-circle-exclamation');
            } finally {
              waTest.disabled = false;
              waTest.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send test';
            }
          };
        }

        // 4. New QR / force refresh
        const troubleshootBtn = body.querySelector('#btn-gateway-troubleshoot-reset');
        if (troubleshootBtn && !troubleshootBtn.dataset.listenerBound) {
          troubleshootBtn.dataset.listenerBound = 'true';
          troubleshootBtn.onclick = () => {
            if (!confirm('Get a new QR code?\n\nYou will scan it again from your phone (WhatsApp → Linked devices).')) return;
            requestFreshQr(tenantId, troubleshootBtn);
          };
        }
      }
      function startOutletGatewayPolling() {
        if (outletGatewayInterval) clearInterval(outletGatewayInterval);
        pollOutletGateway();
        outletGatewayInterval = setInterval(pollOutletGateway, 5000);
      }
      function stopOutletGatewayPolling() {
        if (outletGatewayInterval) {
          clearInterval(outletGatewayInterval);
          outletGatewayInterval = null;
        }
      }

      function applyStore(){
        // Ensure operating mode select has a value when only legacy POS-only was saved
        try {
          if (window.RSOpsMode && typeof RSOpsMode.normalizeStore === 'function') {
            RSOpsMode.normalizeStore(SET_STORE);
          } else if (SET_STORE.set_pos_only_mode && !SET_STORE.set_operating_mode) {
            SET_STORE.set_operating_mode = 'Billing only';
          }
        } catch (e) {}
        $$('[data-skey]', body).forEach(el=>{ const k=el.dataset.skey; if(!(k in SET_STORE))return; if(el.type==='checkbox') el.checked=!!SET_STORE[k]; else el.value=SET_STORE[k]; });
      }
      function collect(){ $$('[data-skey]', body).forEach(el=>{ SET_STORE[el.dataset.skey] = el.type==='checkbox'?el.checked:el.value; }); }

      /** Push one control into live settings + refresh UI (no page reload). */
      function applyControlLive(el) {
        if (!el || !el.dataset || !el.dataset.skey) return;
        const k = el.dataset.skey;
        SET_STORE[k] = el.type === 'checkbox' ? !!el.checked : el.value;
        if (k === 'set_send_bill_after_payment') {
          SET_STORE.set_auto_send_receipts = !!SET_STORE[k];
        }
        try {
          if (window.RSOpsMode && typeof RSOpsMode.normalizeStore === 'function') {
            RSOpsMode.normalizeStore(SET_STORE);
          } else {
            const raw = String(SET_STORE.set_operating_mode || '').toLowerCase();
            SET_STORE.set_pos_only_mode = raw.indexOf('billing') >= 0;
          }
        } catch (_) {}
        window.RS_SETTINGS = Object.assign({}, window.RS_SETTINGS || {}, SET_STORE);
        if (typeof window.RS_applySettingsLive === 'function') {
          window.RS_applySettingsLive(SET_STORE, { source: 'toggle', keys: [k], saved: false });
        } else {
          try { if (window.RSOps && RSOps.refresh) RSOps.refresh(); } catch (_) {}
          try { if (window.RS_applyOpsModeUI) window.RS_applyOpsModeUI(); } catch (_) {}
          try { if (window.RS && RS.renderCart) RS.renderCart(); if (window.RS && RS.renderPOS) RS.renderPOS(); } catch (_) {}
        }
        // Persist in background so hard refresh keeps the value (debounced)
        scheduleSettingsAutosave();
      }

      let _setSaveTimer = null;
      function scheduleSettingsAutosave() {
        if (_setSaveTimer) clearTimeout(_setSaveTimer);
        _setSaveTimer = setTimeout(async () => {
          _setSaveTimer = null;
          try {
            collect();
            if ('set_send_bill_after_payment' in SET_STORE) {
              SET_STORE.set_auto_send_receipts = !!SET_STORE.set_send_bill_after_payment;
            }
            const lockedBiz = resolveLockedBusinessType(SET_STORE);
            SET_STORE['set_business_type'] = lockedBiz.key;
            try {
              if (window.RSOpsMode && typeof RSOpsMode.normalizeStore === 'function') {
                RSOpsMode.normalizeStore(SET_STORE);
              }
            } catch (_) {}
            if (RS.saveSettings) await RS.saveSettings(SET_STORE);
            window.RS_SETTINGS = SET_STORE;
            const hint = document.getElementById('set-save-hint');
            if (hint) {
              hint.textContent = 'Applied live · saved';
              setTimeout(() => {
                if (hint) hint.textContent = 'Toggles apply instantly · Save also syncs to cloud';
              }, 2000);
            }
          } catch (e) {
            console.warn('[settings] autosave', e);
          }
        }, 450);
      }

      function wireLiveSettingsControls() {
        $$('[data-skey]', body).forEach((el) => {
          if (el.dataset.rsLiveWired === '1') return;
          el.dataset.rsLiveWired = '1';
          const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'change';
          el.addEventListener(evt, () => applyControlLive(el));
          // Text fields: apply on blur so we don't thrash while typing
          if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio') {
            el.addEventListener('blur', () => applyControlLive(el));
          }
          if (el.tagName === 'TEXTAREA') {
            el.addEventListener('blur', () => applyControlLive(el));
          }
        });
      }
      function show(key){
        // Never render a section this role's nav doesn't include (e.g. a
        // manager deep-linking to Danger Zone via the WhatsApp pill handler)
        if (!NAV.some(s => s[0] === key)) key = 'profile';
        if(body.querySelector('[data-skey]')) collect();
        const meta = SET_PANE_META[key] || { title: key, sub: '' };
        const titleEl = sec.querySelector('#set-pane-title');
        const subEl = sec.querySelector('#set-pane-sub');
        if (titleEl) titleEl.textContent = meta.title;
        if (subEl) subEl.textContent = meta.sub || '';
        body.innerHTML = `<div class="set-pane active" data-pane="${key}">${PANES[key] || ''}</div>`;
        // Hide sticky save on panes that are mostly live/action (still works if shown)
        const saveBar = sec.querySelector('.set-save-bar');
        if (saveBar) {
          const hideSave = key === 'plan' || key === 'danger';
          saveBar.classList.toggle('is-muted', hideSave);
          const hint = sec.querySelector('#set-save-hint');
          if (hint) {
            if (key === 'danger') hint.textContent = 'Destructive actions below — not saved as settings';
            else if (key === 'plan') hint.textContent = 'Plan changes are handled by RestroSuite support';
            else if (key === 'gateway') hint.textContent = 'Connection is live · toggles apply instantly';
            else hint.textContent = 'Toggles apply instantly · Save also syncs to cloud';
          }
        }
        if (key === 'gateway') {
          startOutletGatewayPolling();
        } else {
          stopOutletGatewayPolling();
        }
        if (key === 'security') {
          try { initSecurityPanel(body); } catch (e) { console.warn('security panel', e); }
        }
        if (key === 'payments') {
          try { initRazorpayRoutePanel(body); } catch (e) { console.warn('payments panel', e); }
        }
        if (key === 'plan') { try { initPlanPanel(body); } catch (e) { console.warn('plan panel', e); } }
        // If profile pane: inject country/currency selects dynamically using stored values
        if (key === 'profile') {
          // Lock business type to registration / session value (never a free dropdown)
          const biz = resolveLockedBusinessType(SET_STORE);
          SET_STORE['set_business_type'] = biz.key;
          const bizHidden = body.querySelector('#set-business-type, [data-skey="set_business_type"]');
          const bizLabel = body.querySelector('#set-business-type-label');
          if (bizHidden) bizHidden.value = biz.key;
          if (bizLabel) bizLabel.textContent = biz.label;

          const row = body.querySelector('#set-country-currency-row');
          if (row) {
            const curCountry  = SET_STORE['set_country']  || 'India';
            const curCurrency = SET_STORE['set_currency'] || 'INR (₹)';
            row.innerHTML = countrySelect(curCountry) + currencySelect(curCurrency);
            
            // Helper to update GSTIN label and placeholder dynamically based on country tax label
            const updateGstinLabels = (countryName) => {
              const gstinLabel = body.querySelector('[data-skey="set_gstin"]')?.parentNode?.querySelector('.fl');
              const gstinInput = body.querySelector('[data-skey="set_gstin"]');
              if (gstinLabel && gstinInput) {
                const taxInfo = window.RS_getCountryTaxInfo && window.RS_getCountryTaxInfo(countryName);
                const label = taxInfo ? taxInfo.label : 'GST';
                if (label === 'GST') {
                  gstinLabel.textContent = 'GSTIN';
                  gstinInput.placeholder = 'GSTIN if enabled';
                } else if (label === 'VAT') {
                  gstinLabel.textContent = 'VAT Number';
                  gstinInput.placeholder = 'VAT Number if enabled';
                } else {
                  gstinLabel.textContent = 'Tax ID / EIN';
                  gstinInput.placeholder = 'Tax ID if enabled';
                }
              }
            };

            updateGstinLabels(curCountry);

            // Country -> currency + phone-prefix + tax auto-link
            const countrySel  = body.querySelector('#set-country');
            const currencySel = body.querySelector('#set-currency');
            if (countrySel && currencySel) {
              countrySel.addEventListener('change', () => {
                // Extract real country name (strip flag + dial suffix added to option text)
                const rawVal = countrySel.value;
                const entry = window.RS_getCountryByName && window.RS_getCountryByName(rawVal);
                if (entry && entry.currency) {
                  currencySel.value = entry.currency;
                  // Force-refresh the custom dropdown trigger label
                  const cdTrigger = currencySel.closest('div')?.querySelector('.dropdown-trigger-label');
                  if (cdTrigger) cdTrigger.textContent = entry.currency;
                  currencySel.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (entry && entry.dial) {
                  // Update outlet phone prefix in settings
                  const phoneInput = body.querySelector('[data-skey="set_phone"]');
                  if (phoneInput) {
                    let rawPhone = phoneInput.value.replace(/^\+\d{1,4}\s*/, '').trim();
                    phoneInput.value = `+${entry.dial} ${rawPhone}`;
                    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  // Update cart customer phone prefix picker if it exists
                  const cartPhonePicker = document.querySelector('#cust-input-phone');
                  if (cartPhonePicker && cartPhonePicker.dataset.phonePrefixBuilt) {
                    const pflag = cartPhonePicker.parentElement?.querySelector('.pflag');
                    const pdial = cartPhonePicker.parentElement?.querySelector('.pdial');
                    if (pflag) pflag.textContent = window.RS_countryFlag ? window.RS_countryFlag(entry.code) : '';
                    if (pdial) pdial.textContent = `+${entry.dial}`;
                  }
                }
                const taxInfo = window.RS_getCountryTaxInfo && window.RS_getCountryTaxInfo(rawVal);
                if (taxInfo) {
                  SET_STORE['set_tax_label'] = taxInfo.label;
                  SET_STORE['set_tax_rate_percent'] = taxInfo.rate;
                }
                updateGstinLabels(rawVal);
              });
            }
          }
        }
        applyStore();

        // Localize tax pane dynamically after loading values
        if (key === 'tax') {
          const curCountry = SET_STORE['set_country'] || 'India';
          const taxLabel = SET_STORE['set_tax_label'] || 'GST';
          const isIndiaGst = (taxLabel.toUpperCase() === 'GST') && 
            (curCountry.toLowerCase() === 'india' || curCountry.trim() === '');
          
          const hsnInput = body.querySelector('[data-skey="set_show_hsn_codes"]');
          const hsnRow = hsnInput?.closest('.set-row');
          if (hsnRow) {
            hsnRow.style.display = isIndiaGst ? 'flex' : 'none';
          }
          
          const incInput = body.querySelector('[data-skey="set_inclusive_pricing"]');
          const incDesc = incInput?.closest('.set-row')?.querySelector('.sd');
          if (incDesc) {
            incDesc.textContent = `Menu prices include ${taxLabel}`;
          }

          const taxLabelInput = body.querySelector('[data-skey="set_tax_label"]');
          if (taxLabelInput) {
            taxLabelInput.addEventListener('input', () => {
              const label = taxLabelInput.value || 'Tax';
              if (incDesc) incDesc.textContent = `Menu prices include ${label}`;
              const checkIndiaGst = (label.toUpperCase() === 'GST') && 
                (curCountry.toLowerCase() === 'india' || curCountry.trim() === '');
              if (hsnRow) hsnRow.style.display = checkIndiaGst ? 'flex' : 'none';
            });
          }
        }
        // Upgrade all native selects to custom dropdown widgets for visual consistency
        if (typeof window.RS_wrapAllSelects === 'function') {
          window.RS_wrapAllSelects(body, ['set-country', 'set-currency']);
        }
        // Mount phone prefix picker on the outlet phone field in profile settings
        if (key === 'profile' && window.RS_buildPhonePrefix) {
          const outletPhoneEl = body.querySelector('[data-skey="set_phone"]');
          if (outletPhoneEl && !outletPhoneEl.dataset.phonePrefixBuilt) {
            const settings2 = window.RS_SETTINGS || {};
            let initCode = 'IN';
            if (settings2.set_country && window.RS_getCountryByName) {
              const e2 = window.RS_getCountryByName(settings2.set_country);
              if (e2) initCode = e2.code;
            }
            window.RS_buildPhonePrefix(outletPhoneEl, initCode);
          }
        }
        $$('.set-nav button',sec).forEach(b=>b.classList.toggle('active', b.dataset.s===key));
        const tg=$('#set-team-go'); if(tg) tg.onclick=()=>RS.activateTab('employees-tab');
        // Sounds & alerts (Settings → Printers)
        (function wireAlertSoundControls() {
          const MUTE_KEY = 'rs_service_alert_mute';
          const toggleBtn = body.querySelector('#btn-toggle-alert-sound');
          const testBtn = body.querySelector('#btn-test-alert-sound');
          const statusEl = body.querySelector('#set-sound-status');
          if (!toggleBtn && !testBtn) return;
          function isMuted() {
            try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
          }
          function paint() {
            const muted = isMuted();
            if (toggleBtn) {
              toggleBtn.innerHTML = muted
                ? '<i class="fa-solid fa-volume-xmark"></i> Muted'
                : '<i class="fa-solid fa-volume-high"></i> Sound on';
            }
            if (statusEl) {
              statusEl.textContent = muted
                ? 'Muted on this device — waiter call & QR order chimes off'
                : 'Chimes for new QR orders and “call waiter”';
            }
          }
          paint();
          if (toggleBtn && !toggleBtn.dataset.rsSoundBound) {
            toggleBtn.dataset.rsSoundBound = '1';
            toggleBtn.onclick = () => {
              try {
                localStorage.setItem(MUTE_KEY, isMuted() ? '0' : '1');
              } catch (_) {}
              paint();
              RS.toast(isMuted() ? 'Alert sounds muted' : 'Alert sounds on', isMuted() ? 'fa-volume-xmark' : 'fa-volume-high');
            };
          }
          if (testBtn && !testBtn.dataset.rsSoundBound) {
            testBtn.dataset.rsSoundBound = '1';
            testBtn.onclick = () => {
              try {
                // Unlock + play same family of tones as floor chime
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) {
                  RS.toast('Audio not supported in this browser', 'fa-circle-exclamation');
                  return;
                }
                if (!window.__rsAlertAudioCtx) window.__rsAlertAudioCtx = new Ctx();
                const ctx = window.__rsAlertAudioCtx;
                if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                if (isMuted()) {
                  RS.toast('Sounds are muted — turn Sound on first', 'fa-volume-xmark');
                  return;
                }
                [[880, 0], [1174.7, 0.12], [1396.9, 0.24]].forEach(([freq, delay]) => {
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.type = 'sine';
                  osc.frequency.value = freq;
                  const t0 = ctx.currentTime + delay;
                  gain.gain.setValueAtTime(0.0001, t0);
                  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
                  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
                  osc.connect(gain).connect(ctx.destination);
                  osc.start(t0);
                  osc.stop(t0 + 0.32);
                });
                RS.toast('Test chime played', 'fa-bell');
              } catch (e) {
                RS.toast('Could not play chime', 'fa-circle-exclamation');
              }
            };
          }
        })();
        const btnReset = $('#btn-client-reset-data');
        if(btnReset) {
          btnReset.onclick = async () => {
            // Defense in depth: even if this pane is somehow rendered for a
            // non-admin role, refuse to run the destructive reset.
            if (!['owner','admin','superadmin','super_admin'].includes(settingsRole())) {
              RS.toast('Only the outlet owner can reset outlet data.', 'fa-lock');
              return;
            }
            if(!confirm("⚠️ RESET OUTLET DATA?\n\nThis will PERMANENTLY DELETE all of your operational data (bills, menu, inventory, employees, customers, drafts, etc.).\n\nThis action cannot be undone! Proceed?")) return;
            btnReset.disabled = true;
            btnReset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
            try {
              const collections = ['bills', 'menu', 'inventory', 'customers', 'employees', 'drafts', 'pending_orders', 'shifts', 'shift_events', 'attendance', 'leave_requests', 'reservations', 'offers', 'vendors', 'purchase_orders', 'support_tickets'];
              for (const c of collections) {
                const list = await RS_DB.list(c);
                for (const item of list) {
                  const id = (c === 'shifts') ? item.shiftId : (c === 'shift_events') ? item.eventId : item.id;
                  if (id != null) {
                    await RS_DB.del(c, id);
                  }
                }
              }
              RS.toast('All operational data reset successfully!', 'fa-circle-check');
              setTimeout(() => {
                window.location.reload();
              }, 1200);
            } catch(err) {
              console.error(err);
              RS.toast('Error resetting data: ' + err.message, 'fa-circle-exclamation');
              btnReset.disabled = false;
              btnReset.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset Outlet Data';
            }
          };
        }
        // Instant apply: toggles/selects update the live app without hard refresh
        try { wireLiveSettingsControls(); } catch (e) { console.warn('live settings wire', e); }
      }
      $$('.set-nav button',sec).forEach(b=> b.onclick=()=>show(b.dataset.s));
      $('#set-save').onclick=async ()=>{ 
        collect();
        // Business type is registration-locked — never let a stale/hidden field flip the vertical
        const lockedBiz = resolveLockedBusinessType(SET_STORE);
        SET_STORE['set_business_type'] = lockedBiz.key;
        // Keep WhatsApp auto-send alias in sync with the UI toggle
        if ('set_send_bill_after_payment' in SET_STORE) {
          SET_STORE.set_auto_send_receipts = !!SET_STORE.set_send_bill_after_payment;
        }
        try {
          // Normalize operating mode (migrates legacy POS-only toggle)
          try {
            if (window.RSOpsMode && typeof RSOpsMode.normalizeStore === 'function') {
              RSOpsMode.normalizeStore(SET_STORE);
            } else {
              const raw = String(SET_STORE.set_operating_mode || '').toLowerCase();
              SET_STORE.set_pos_only_mode = raw.indexOf('billing') >= 0;
            }
          } catch (e) {}
          await (RS.saveSettings?RS.saveSettings(SET_STORE):Promise.resolve());
          // Live apply entire store (shift bar, ops mode, cart, tabs) — no page refresh
          if (typeof window.RS_applySettingsLive === 'function') {
            window.RS_applySettingsLive(SET_STORE, { source: 'save', saved: true });
          } else {
            window.RS_SETTINGS = SET_STORE;
            try { if (window.RSOps && RSOps.refresh) RSOps.refresh(); } catch (_) {}
            try { if (window.RS_applyOpsModeUI) window.RS_applyOpsModeUI(); } catch (_) {}
            try { if (window.RS && RS.renderPOS) RS.renderPOS(); if (window.RS && RS.renderCart) RS.renderCart(); } catch (_) {}
          }
          const isCloud = RS.dbMode && RS.dbMode()==='cloud' && navigator.onLine && !window.__OFFLINE_CONFIG__ && !window.RS_LAST_CLOUD_ERROR;
          if(isCloud){
            RS.toast('Saved · applied live','fa-circle-check');
          } else {
            RS.toast('Saved locally · applied live (cloud when online)','fa-circle-check');
          }
          if(window.RS_SAAS){ RS_SAAS.refresh(); RS_SAAS.applyToUI(); }
          try{
            if(window.RS_SYNC && RS_SYNC.syncPendingOrders) RS_SYNC.syncPendingOrders({ forceCloud: true });
          } catch(e){}
          const hint = document.getElementById('set-save-hint');
          if (hint) hint.textContent = 'Applied live · no refresh needed';
        } catch(err) {
          console.error(err);
          RS.toast('Failed to save settings: ' + err.message, 'fa-circle-exclamation');
        }
      };
      $('#set-cancel').onclick=()=>show('profile');
      Promise.resolve(RS.getSettings?RS.getSettings():null).then(saved=>{
        // Plug-and-play defaults for missing keys (simple café first)
        if (typeof window.RS_applyFeatureDefaults === 'function') {
          SET_STORE = window.RS_applyFeatureDefaults(saved || {});
        } else {
          SET_STORE = saved || {};
        }
        try { window.RS_SETTINGS = Object.assign({}, window.RS_SETTINGS || {}, SET_STORE); } catch (_) {}
        const deep = String(window.__rsOpenSettingsSection || '').trim();
        window.__rsOpenSettingsSection = '';
        show(deep && NAV.some(s => s[0] === deep) ? deep : 'profile');
      });
    }
    RS.titles['settings-tab']=['Settings','Outlet · operations · access · account'];
    RS.addRenderer('settings-tab', renderSettings);
    const openSet = $('#open-settings'); if(openSet) openSet.addEventListener('click', ()=>RS.activateTab('settings-tab'));

    /* ===================== DB MODE BADGE + SESSION ===================== */
    (function(){
      const pill = document.getElementById('db-mode-pill');
      const ALL_STATES = ['cloud','syncing','local-only','offline','sync-error','superadmin-cloud'];

      // Count of in-flight cloud writes — hold Syncing until all settle
      let activeSyncCount = 0;
      let syncDoneTimer   = null;
      let errorClearTimer = null;

      function setState(state, title, detail) {
        if (!pill) return;
        // Pill is screen-reader / offline-lock only — no chrome
        ALL_STATES.forEach(s => pill.classList.remove(s));
        if (state) pill.classList.add(state);
        document.body.classList.toggle('rs-offline-lock', ['local-only', 'offline', 'sync-error'].includes(state));
        pill.setAttribute('data-cloud-state', state || '');
        pill.setAttribute('data-cloud-detail', detail || '');
        pill.setAttribute('title', title || '');
        pill.textContent = detail || state || '';
      }

      function updatePill() {
        if (!pill) return;
        const isCloud  = window.RS_DB && window.RS_DB.isCloud;
        const isOnline = navigator.onLine;
        const session = window.RS_API && RS_API.session ? RS_API.session() : null;
        const isSuperAdmin = session && session.role === 'superadmin';
        const cloudFallbackActive = window.__OFFLINE_CONFIG__ || !!window.RS_LAST_CLOUD_ERROR;

        if (!isSuperAdmin && (!isOnline || cloudFallbackActive)) {
          const title = !isOnline
            ? 'Offline — changes save on this device and sync when you reconnect.'
            : 'Cloud temporarily unavailable — saved on this device, will retry.';
          setState('local-only', title, 'Local only');
          return;
        }

        if (!isOnline) {
          setState('offline',
            'You are offline — changes save on this device and sync when you reconnect.',
            'Offline'
          );
          return;
        }
        if (isSuperAdmin) {
          setState('superadmin-cloud',
            'Platform admin connected to cloud controls.',
            'Admin'
          );
          return;
        }
        if (!isCloud) {
          setState('local-only',
            'Local mode — data stays in this browser until you use cloud login.',
            'Local only'
          );
          return;
        }
        const err = window.RS_LAST_CLOUD_ERROR;
        if (err && (Date.now() - err.time < 30000)) {
          setState('sync-error',
            `Last sync failed: ${err.message}. Saved locally; will retry.`,
            'Sync error'
          );
          clearTimeout(errorClearTimer);
          errorClearTimer = setTimeout(() => { window.RS_LAST_CLOUD_ERROR = null; updatePill(); }, 30000 - (Date.now() - err.time));
          return;
        }
        setState('cloud', 'Data is syncing to the cloud.', 'Connected');
      }

      function showSyncing() {
        if (!pill || !navigator.onLine || !(window.RS_DB && window.RS_DB.isCloud)) return;
        setState('syncing', 'Syncing to cloud…', 'Syncing…');
      }

      // ── Sync-event listeners (fired by db.js guard()) ─────────────────
      window.addEventListener('rs:sync-start', () => {
        activeSyncCount++;
        clearTimeout(syncDoneTimer);
        showSyncing();
      });

      window.addEventListener('rs:sync-done', () => {
        activeSyncCount = Math.max(0, activeSyncCount - 1);
        if (activeSyncCount === 0) {
          clearTimeout(syncDoneTimer);
          syncDoneTimer = setTimeout(updatePill, 400); // min 400 ms flash
        }
      });

      window.addEventListener('rs:cloud-fallback', () => {
        clearTimeout(syncDoneTimer);
        syncDoneTimer = setTimeout(updatePill, 400);
      });

      // All queued offline writes successfully drained — clear any error badge
      window.addEventListener('rs:sync-queue-drained', () => {
        window.RS_LAST_CLOUD_ERROR = null;
        clearTimeout(errorClearTimer);
        updatePill();
      });

      // ── Network change listeners ───────────────────────────────────────
      window.addEventListener('offline', updatePill);
      window.addEventListener('online',  () => setTimeout(updatePill, 1200)); // wait for drain to kick off

      // ── Data hydration ─────────────────────────────────────────────────
      document.addEventListener('rs:hydrated', updatePill);

      // Initial render
      updatePill();

      // ── Reflect signed-in user on sidebar pill ────────────────────────
      if(window.RS_DB && RS_DB.session){ Promise.resolve(RS_DB.session()).then(s=>{ if(!s)return; const meta=(s.user&&(s.user.user_metadata||s.user.meta))||s||{}; const un=document.querySelector('.user-pill .un'), ur=document.querySelector('.user-pill .ur'), av=document.querySelector('.user-pill .avatar'); const name=meta.display_name||meta.name||meta.username||s.username||'Outlet User'; const outlet=s.tenant_name||meta.outlet||s.tenant_slug||'Outlet'; const role=s.role||meta.role||'Admin'; const properName=String(name).replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); if(un) un.textContent=properName; if(av) av.textContent=properName.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'RS'; if(ur) { if(role==='superadmin') { ur.textContent='SaaS Super-Admin'; } else { ur.textContent=String(outlet).replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())+' · '+(String(role).charAt(0).toUpperCase()+String(role).slice(1)); } } }); }

      // Sign-out: single path via RS_REQUEST_LOGOUT (dashboard.html) — no second confirm.
      const logout = document.querySelector('.sb-foot-btn.logout');
      if (logout) {
        logout.removeAttribute('onclick');
        // Capture handler in dashboard.html owns the click; keep a safe fallback only.
        if (typeof window.RS_REQUEST_LOGOUT !== 'function') {
          logout.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.RS_SHOW_OFFLINE_LOGOUT_LOCK) window.RS_SHOW_OFFLINE_LOGOUT_LOCK();
          });
        }
      }
    })();

    /* ===================== MOBILE "MORE" SHEET ===================== */
    const moreBtn = $('#mnav-more');
    if(moreBtn){
      const MORE = [
        ['pos-tab','POS / Sell','cash-register'],
        ['bills-tab','Bills','file-invoice-dollar'],
        ['floor-tab','Floor & Tables','chair'],
        ['qr-orders-tab','QR Orders','qrcode'],
        ['kds-tab','Kitchen Display','fire-burner'],
        ['aggregator-tab','Online Orders','bowl-rice'],
        ['tokens-tab','Token Display','bullhorn'],
        ['inventory-tab','Inventory','boxes-stacked'],
        ['editor-tab','Menu Editor','pen-to-square'],
        ['customers-tab','Customers','address-book'],
        ['reports-tab','Reports','chart-line'],
        ['tax-tab','Tax & GST','file-invoice'],
        ['employees-tab','Employees','users'],
        ['analytics-tab','Advanced Analytics','chart-mixed'],
        ['growth-hub-tab','Growth Hub','rocket'],
        ['settings-tab','Settings','gear'],
        ['logout','Sign Out','right-from-bracket']
      ];
      moreBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        // Kill legacy MORE SECTIONS sheet if any other code tried to open it
        const legacy = document.getElementById('mobile-more-sheet');
        if (legacy) {
          legacy.style.display = 'none';
          legacy.setAttribute('hidden', '');
          legacy.setAttribute('aria-hidden', 'true');
        }
        // Filter the sheet by the signed-in staff role's allowed tabs so
        // restricted roles can't even see (let alone open) forbidden screens.
        // Fail closed: empty allowedTabs for staff ≠ full menu (was a privilege leak).
        const roleInfo = window.RS_ROLE || {};
        const rRole = String(roleInfo.staffRole || sessionStorage.getItem('logged_in_role') || '').toLowerCase();
        const unrestricted = !rRole || ['owner', 'admin', 'superadmin', 'brand_admin'].includes(rRole);
        let allowed = null;
        if (unrestricted && roleInfo.allowedTabs == null) {
          allowed = null; // full MORE
        } else if (Array.isArray(roleInfo.allowedTabs)) {
          allowed = roleInfo.allowedTabs.slice();
          if (rRole === 'manager') allowed.push('settings-tab');
          allowed.push('logout');
        } else if (!unrestricted) {
          allowed = ['pos-tab', 'logout'];
        }
        const VISIBLE = allowed ? MORE.filter(m => allowed.includes(m[0])) : MORE;
        RSModal.open({ title:'All sections', icon:'fa-grip', size:'sm',
          body:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${VISIBLE.map(m=>{
            const bgClass = m[0] === 'logout' ? 'bg-r' : 'bg-o';
            return `<button class="hub-card" data-go="${m[0]}" style="text-align:left;cursor:pointer;border:1px solid var(--stroke);background:var(--panel)"><div class="hub-ic ${bgClass}" style="width:38px;height:38px;font-size:15px"><i class="fa-solid fa-${m[2]}"></i></div><h4 style="font-size:14px;margin-top:10px">${m[1]}</h4></button>`;
          }).join('')}</div>`,
          onMount(modal, close){
            // Keep legacy sheet suppressed while this modal is open
            if (legacy) legacy.style.display = 'none';
            $$('[data-go]',modal).forEach(b=> b.onclick=()=>{
              if(b.dataset.go === 'logout') {
                // Capture handler + RS_REQUEST_LOGOUT show one in-app modal
                close();
                if (typeof window.RS_REQUEST_LOGOUT === 'function') window.RS_REQUEST_LOGOUT();
                else if (window.RS_SHOW_OFFLINE_LOGOUT_LOCK) window.RS_SHOW_OFFLINE_LOGOUT_LOCK();
              } else {
                close();
                if (legacy) legacy.style.display = 'none';
                RS.activateTab(b.dataset.go);
              }
            });
          }
        });
      });
    }
    
    // wa-linked = green (own restaurant number)
    // wa-platform = blue (central/platform line only — outlet not linked)
    const WA_BADGE_STATES = ['wa-linked', 'wa-platform', 'wa-syncing', 'wa-qr', 'wa-offline', 'wa-auth-failure', 'wa-starting'];
    function setTopbarWhatsAppBadge(state, label, tooltip, pulse) {
      const pills = document.querySelectorAll('.js-wa-status-pill, #tb-wa-status-btn');
      if (!pills.length) return;

      const spinning = !!(pulse || state === 'wa-starting' || state === 'wa-syncing' || state === 'wa-qr');

      // Always-visible top-bar icon only (no ⋯ menu duplicate)
      const icon = document.getElementById('tb-wa-icon');
      const lab = document.getElementById('tb-wa-label');
      if (icon) {
        icon.className =
          'fa-brands fa-whatsapp tb-wa-icon' + (spinning ? ' fa-spin' : '');
        icon.style.display = 'inline-block';
        icon.setAttribute('aria-hidden', 'true');
      }
      if (lab) {
        const short =
          state === 'wa-linked' ? (label && String(label).indexOf('+') === 0 ? label : 'On')
          : state === 'wa-platform' ? (label && String(label).indexOf('+') === 0 ? label : 'Hub')
          : state === 'wa-offline' || state === 'wa-auth-failure' ? 'Off'
          : state === 'wa-qr' ? 'Scan'
          : '…';
        lab.textContent = short;
      }

      pills.forEach((pillEl) => {
        WA_BADGE_STATES.forEach((cls) => pillEl.classList.remove(cls));
        pillEl.classList.add(state);
        pillEl.style.cssText = '';
        pillEl.setAttribute('data-tooltip', tooltip || '');
        pillEl.title = tooltip || label || 'Bill WhatsApp';
        pillEl.setAttribute('aria-label', 'Bill WhatsApp: ' + (label || state));
        pillEl.setAttribute('data-wa-mode', state === 'wa-linked' ? 'own' : state === 'wa-platform' ? 'platform' : state);
      });
      window.__rsWaBadge = { state, label, tooltip };
    }

    function isSuperAdminSession() {
      const meta = (window.RS_API && RS_API.session && RS_API.session()) || {};
      const role = String(meta.role || sessionStorage.getItem('logged_in_role') || '')
        .toLowerCase()
        .trim();
      return role === 'superadmin' || role === 'super_admin';
    }

    /**
     * Open the right place to link / manage WhatsApp.
     * Super-admin shell only allows super-admin-tab + gateway-monitor-tab
     * (settings-tab is CSS-hidden and activateTab remaps it away).
     * Outlet roles go to Settings → WhatsApp.
     */
    function openWhatsAppSettings() {
      window.__rsOpenSettingsSection = 'gateway';
      if (isSuperAdminSession()) {
        if (window.RS && typeof RS.activateTab === 'function') {
          return Promise.resolve(RS.activateTab('gateway-monitor-tab')).then(() => {
            try {
              const panel = document.getElementById('gateway-monitor-tab');
              if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
              const resetBtn = document.getElementById('btn-saas-gateway-reset');
              if (resetBtn) {
                resetBtn.classList.add('rs-pulse-hint');
                setTimeout(() => resetBtn.classList.remove('rs-pulse-hint'), 2400);
              }
            } catch (_) {}
            if (window.RS && RS.toast) {
              RS.toast('Gateway Monitor — link WhatsApp with Reset / scan QR', 'fa-whatsapp');
            }
          });
        }
        return Promise.resolve();
      }
      if (window.RS && typeof RS.activateTab === 'function') {
        return Promise.resolve(RS.activateTab('settings-tab')).then(() => {
          let tries = 0;
          const goGateway = () => {
            const b = document.querySelector('.set-nav button[data-s="gateway"]');
            if (b) {
              b.click();
              return;
            }
            if (++tries < 20) setTimeout(goGateway, 80);
          };
          setTimeout(goGateway, 60);
        });
      }
      return Promise.resolve();
    }
    window.openWhatsAppSettings = openWhatsAppSettings;
    if (window.RS) window.RS.openWhatsAppSettings = openWhatsAppSettings;

    function openWhatsAppStatusPanel() {
      const st = window.__rsGatewayLastStatus || 'unknown';
      const ready = window.__rsGatewayReady === true;
      const num = window.__rsGatewayNumber || '';
      const tip = (window.__rsWaBadge && window.__rsWaBadge.tooltip) || '';
      const superAdmin = isSuperAdminSession();
      const stHuman =
        ready ? 'Connected'
          : st === 'qr' ? 'Scan QR to connect'
          : (st === 'syncing' || st === 'authenticated') ? 'Almost ready'
          : (st === 'connecting' || st === 'starting') ? 'Starting…'
          : (st === 'disconnected' || st === 'offline' || st === 'close' || st === 'closed' || !st || st === 'unknown')
            ? 'Not connected'
            : 'Not connected';
      const statusLine = ready
        ? `<span style="color:var(--green);font-weight:800">Connected</span>${num ? ' · +' + safe(num) : ''}`
        : st === 'qr'
          ? `<span style="color:var(--amber);font-weight:800">Scan QR to connect</span>`
          : `<span style="color:var(--red);font-weight:800">${safe(stHuman)}</span>`;
      const linkHint = superAdmin
        ? 'Open Gateway Monitor to reset the connection and scan a new QR'
        : 'Open Settings → WhatsApp and scan the QR';
      const settingsBtnLabel = superAdmin
        ? '<i class="fa-solid fa-server"></i> Open Gateway Monitor'
        : '<i class="fa-solid fa-gear"></i> Open settings';
      const body = `
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13.5px;line-height:1.5;color:var(--text-soft)">
          <div style="padding:12px 14px;border-radius:12px;background:var(--glass);border:1px solid var(--stroke-2)">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mute);margin-bottom:4px">Bill WhatsApp</div>
            <div style="color:var(--text);font-size:15px">${statusLine}</div>
            ${tip ? `<div style="margin-top:6px;font-size:12.5px">${safe(tip)}</div>` : ''}
          </div>
          <p style="margin:0;font-size:12.5px">Bills are sent from <b>your</b> linked number to <b>your</b> customers.</p>
          <ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--text-soft)">
            <li>Best for bills and “order ready” messages</li>
            <li>Phone online · WhatsApp → Linked devices</li>
            <li>If not connected: ${safe(linkHint)}</li>
          </ul>
          ${
            window.RSWaSendQueue && RSWaSendQueue.count && RSWaSendQueue.count() > 0
              ? `<div style="margin-top:4px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,#25d366 12%,var(--panel));border:1px solid color-mix(in srgb,#25d366 30%,var(--stroke));font-size:12.5px;color:var(--text)">
                  <b>${RSWaSendQueue.count()}</b> bill(s) waiting — will send automatically when WhatsApp is connected.
                </div>`
              : ''
          }
        </div>`;
      if (!window.RSModal) {
        if (confirm((tip || 'WhatsApp: ' + stHuman) + '\n\n' + (superAdmin ? 'Open Gateway Monitor?' : 'Open WhatsApp settings?'))) {
          openWhatsAppSettings();
        }
        return;
      }
      RSModal.open({
        title: 'WhatsApp',
        sub: superAdmin ? 'Platform messaging gateway' : 'Bill delivery for this outlet',
        icon: 'fa-brands fa-whatsapp',
        size: 'sm',
        body,
        foot: `<button type="button" class="btn btn-ghost" id="wa-panel-refresh"><i class="fa-solid fa-rotate"></i> Check again</button>
               ${
                 window.RSWaSendQueue && RSWaSendQueue.count && RSWaSendQueue.count() > 0
                   ? '<button type="button" class="btn btn-ghost" id="wa-panel-queue"><i class="fa-solid fa-clock"></i> Waiting bills</button>'
                   : ''
               }
               <button type="button" class="btn btn-primary" id="wa-panel-settings" style="flex:1">${settingsBtnLabel}</button>`,
        onMount(modal, close) {
          modal.querySelector('#wa-panel-refresh').onclick = async () => {
            if (window.updateTopbarWhatsAppStatus) await window.updateTopbarWhatsAppStatus();
            if (window.RSWaSendQueue && RSWaSendQueue.processQueue) {
              await RSWaSendQueue.processQueue({ force: false });
            }
            close();
            setTimeout(openWhatsAppStatusPanel, 120);
          };
          const qBtn = modal.querySelector('#wa-panel-queue');
          if (qBtn)
            qBtn.onclick = () => {
              close();
              if (window.RSWaSendQueue && RSWaSendQueue.openQueuePanel) RSWaSendQueue.openQueuePanel();
            };
          modal.querySelector('#wa-panel-settings').onclick = () => {
            close();
            openWhatsAppSettings();
          };
        },
      });
    }

    function wireWhatsAppStatusClicks() {
      document.querySelectorAll('.js-wa-status-pill, #tb-wa-status-btn').forEach((el) => {
        if (el.dataset.waClickBound === '1') return;
        el.dataset.waClickBound = '1';
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openWhatsAppStatusPanel();
        });
      });
    }
    wireWhatsAppStatusClicks();
    document.addEventListener('DOMContentLoaded', wireWhatsAppStatusClicks);
    function gatewayReason(res, fallback) {
      const raw = (res && (res.error || res.reason || res.message || (res.details && res.details.reason))) || fallback || '';
      return humanizeGatewayReason(raw);
    }
    function humanizeGatewayReason(raw) {
      const s = String(raw || '').toLowerCase();
      if (!s || s === 'not connected' || s === 'offline' || s === 'disconnected' || s === 'n/a') {
        return 'WhatsApp is not connected. Open Settings → WhatsApp to link your number.';
      }
      if (s.includes('stream') || s.includes('conflict') || s.includes('disconnected')) {
        return 'Connection dropped. Open Settings → WhatsApp and scan the QR again if needed.';
      }
      if (s.includes('timeout') || s.includes('timed out')) {
        return 'WhatsApp took too long to respond. Check that the RestroSuite computer is on.';
      }
      if (s.includes('auth') || s.includes('logged out') || s.includes('session')) {
        return 'Link expired. Scan the QR code again in Settings → WhatsApp.';
      }
      if (s.includes('qr')) {
        return 'Scan the WhatsApp QR code in Settings → WhatsApp to connect.';
      }
      if (s.length > 90 || /[{}\[\]<>]|error code|errno|ECONN|status\s*\d/i.test(String(raw))) {
        return 'WhatsApp is temporarily unavailable. Try reconnecting in Settings → WhatsApp.';
      }
      return String(raw);
    }

    // Add topbar status badge polling & click handler
    window.updateTopbarWhatsAppStatus = async function() {
      const sessionMeta = (window.RS_API && RS_API.session && RS_API.session()) || {};
      const isSuperAdmin = sessionMeta.role === 'superadmin' || sessionMeta.role === 'super_admin';
      try {
        // Superadmin uses tenant-admin endpoint (no tenantId) so the gateway returns platform status.
        // Regular tenants use tenant-data with their own tenantId.
        const res = isSuperAdmin
          ? await RS_API.admin({ action: 'gateway_status' })
          : await RS_API.data({ operation: 'gateway_status' });
        window.__rsGatewayLastStatus = (res && res.status) || 'offline';
        window.__rsGatewayReady = false; // true when bills can auto-send (own OR platform line)
        window.__rsGatewayNumber = (res && (res.number || res.phone || res.wa_number)) || window.__rsGatewayNumber || '';
        window.__rsGatewayStatusRaw = res || null;
        window.__rsWaSendMode = (res && res.sendMode) || 'none';
        window.__rsPlatformReady = !!(res && res.platformReady);
        // Platform central number can deliver bills even when this outlet has not linked WhatsApp
        // (or is stuck on Scan QR). Prefer canAutomate / platformReady so the bill modal allows PDF auto-send.
        const canAuto = !!(res && (
          res.canAutomate === true
          || res.status === 'ready'
          || res.status === 'linked'
          || res.platformReady === true
          || res.sendMode === 'platform'
          || res.sendMode === 'own'
        ));
        if (res && res.status === 'ready' && res.sendMode !== 'platform') {
          // Own linked number (live)
          window.__rsGatewayReady = true;
          const n = window.__rsGatewayNumber;
          const short = n ? ('+' + String(n).slice(-4)) : 'On';
          setTopbarWhatsAppBadge(
            'wa-linked',
            short,
            n ? 'WhatsApp connected · +' + n + ' · bills send from your number' : 'WhatsApp connected · ready to send bills',
            false
          );
        } else if (res && (res.status === 'linked' || (res.linked && res.sendMode === 'own'))) {
          // Own number linked (lazy cold) — still can auto-send
          window.__rsGatewayReady = true;
          window.__rsGatewayLastStatus = 'ready';
          setTopbarWhatsAppBadge(
            'wa-linked',
            'On',
            'Your WhatsApp is linked · connects automatically when sending a bill',
            false
          );
        } else if (canAuto && (res.sendMode === 'platform' || res.platformReady === true || res.canAutomate === true)) {
          // Central / platform line only — NOT own number (blue badge, not green)
          window.__rsGatewayReady = true;
          window.__rsGatewayLastStatus = 'ready';
          window.__rsWaSendMode = res.sendMode || 'platform';
          const pn = res.platformNumber || res.number;
          const short = pn ? ('+' + String(pn).slice(-4)) : 'Hub';
          setTopbarWhatsAppBadge(
            'wa-platform',
            short,
            pn
              ? 'Using central WhatsApp +' + pn + ' (not your number). Link your WhatsApp in Settings for green status and bills from your phone.'
              : 'Using central platform WhatsApp. Link your restaurant number in Settings for green status.',
            false
          );
        } else if (res && (res.status === 'syncing' || res.status === 'authenticated')) {
          setTopbarWhatsAppBadge('wa-syncing', '…', 'Almost ready — finishing WhatsApp setup', true);
        } else if (res && res.status === 'qr') {
          setTopbarWhatsAppBadge('wa-qr', 'Scan QR', 'Open Settings → WhatsApp and scan the QR code', false);
        } else if (res && res.status === 'auth_failure') {
          setTopbarWhatsAppBadge('wa-auth-failure', 'Retry', gatewayReason(res, 'Please scan the QR code again'), false);
        } else if (res && (res.status === 'connecting' || res.status === 'starting')) {
          setTopbarWhatsAppBadge('wa-starting', '…', 'Connecting WhatsApp…', true);
        } else {
          setTopbarWhatsAppBadge('wa-offline', 'Off', gatewayReason(res, 'not connected'), false);
        }
        wireWhatsAppStatusClicks();
      } catch(err) {
        window.__rsGatewayLastStatus = 'error';
        window.__rsGatewayReady = false;
        setTopbarWhatsAppBadge('wa-offline', 'Off', 'Could not check WhatsApp. Try again in a moment.', false);
        wireWhatsAppStatusClicks();
      }
    };

    // Adaptive polling with backoff: a fixed 15s interval hammered the
    // gateway forever on outlets that never configured WhatsApp ("Scan to
    // Connect" / "WhatsApp Starting..." loops), wasting battery/data and
    // keeping the tab busy even around sign-out. Healthy or transitioning
    // states poll fast; unconfigured/offline/error states back off up to
    // 5 minutes; nothing polls while the tab is hidden.
    let topbarWhatsAppTimer = null;
    let topbarWhatsAppDelay = 15000;
    window.stopTopbarWhatsAppPolling = function() {
      if (topbarWhatsAppTimer) { clearTimeout(topbarWhatsAppTimer); topbarWhatsAppTimer = null; }
    };
    async function pollTopbarWhatsApp() {
      if (!document.hidden) {
        await window.updateTopbarWhatsAppStatus();
        const st = window.__rsGatewayLastStatus || 'offline';
        if (st === 'ready' || st === 'authenticated') {
          topbarWhatsAppDelay = 30000; // healthy: light poll
        } else if (st === 'syncing' || st === 'qr' || st === 'connecting' || st === 'starting') {
          topbarWhatsAppDelay = 12000; // mid-handshake: responsive but not thrashing
        } else {
          // offline / error: exponential backoff up to 5 minutes
          topbarWhatsAppDelay = Math.min(Math.max(topbarWhatsAppDelay, 20000) * 2, 300000);
        }
      }
      topbarWhatsAppTimer = setTimeout(pollTopbarWhatsApp, topbarWhatsAppDelay);
    }
    document.addEventListener('visibilitychange', () => {
      // Coming back to a visible tab: poll immediately and reset the backoff
      if (!document.hidden && topbarWhatsAppTimer) {
        window.stopTopbarWhatsAppPolling();
        topbarWhatsAppDelay = 15000;
        pollTopbarWhatsApp();
      }
    });
    window.startTopbarWhatsAppPolling = function() {
      window.stopTopbarWhatsAppPolling();
      topbarWhatsAppDelay = 15000;
      pollTopbarWhatsApp();
      wireWhatsAppStatusClicks();
    };
    
    RS.syncPhoneCombosToSettings = function(customSettings) {
      const settings = customSettings || window.RS_SETTINGS || {};
      if (!settings.set_country || !window.RS_getCountryByName) return;
      const entry = window.RS_getCountryByName(settings.set_country);
      if (!entry) return;

      // 1. Update settings profile phone input if it exists
      const settingsPhone = document.querySelector('[data-skey="set_phone"]');
      if (settingsPhone && settingsPhone.dataset.phonePrefixBuilt) {
        if (typeof settingsPhone.RS_setCountryCode === 'function') {
          settingsPhone.RS_setCountryCode(entry.code);
        } else {
          const pflag = settingsPhone.parentElement.querySelector('.pflag');
          const pdial = settingsPhone.parentElement.querySelector('.pdial');
          if (pflag) pflag.textContent = window.RS_countryFlag ? window.RS_countryFlag(entry.code) : '';
          if (pdial) pdial.textContent = `+${entry.dial}`;
        }
      }

      // 2. Update cart customer phone prefix picker if it exists
      const cartPhone = document.querySelector('#cust-input-phone');
      if (cartPhone && cartPhone.dataset.phonePrefixBuilt) {
        if (typeof cartPhone.RS_setCountryCode === 'function') {
          cartPhone.RS_setCountryCode(entry.code);
        } else {
          const pflag = cartPhone.parentElement.querySelector('.pflag');
          const pdial = cartPhone.parentElement.querySelector('.pdial');
          if (pflag) pflag.textContent = window.RS_countryFlag ? window.RS_countryFlag(entry.code) : '';
          if (pdial) pdial.textContent = `+${entry.dial}`;
        }
      }
    };
    
    // Sync immediately on load if settings are already loaded
    try {
      RS.syncPhoneCombosToSettings();
    } catch(e){}

    document.addEventListener('rs:hydrated', window.startTopbarWhatsAppPolling);
    // Start polling as soon as shell boots (don't wait only for RS_DB.session)
    try {
      window.startTopbarWhatsAppPolling();
    } catch (e) {
      console.warn('[WA topbar] poll start failed', e);
    }
    // Re-bind WA click after late DOM injects
    setTimeout(wireWhatsAppStatusClicks, 500);
    setTimeout(wireWhatsAppStatusClicks, 2000);
  }
  if (window.RS) boot();
  else document.addEventListener('rs:ready', boot, { once: true });
})();
