/* ============================================================
   RestroSuite — Owner WhatsApp reports (10/10)
   Daily sales PDF · Stock alerts · Weekly/Monthly P&L PDF
   Cloud prefs + local fallback · gateway PDF send
   ============================================================ */
(function (global) {
  'use strict';

  const CFG_KEY = 'rs_owner_wa_reports_v1';
  const SENT_KEY = 'rs_owner_wa_sent_v1';

  function defaults() {
    return {
      enabled: true,
      ownerPhone: '',
      dailySales: true,
      dailySalesHour: 22,
      stockAlerts: true,
      stockAlertHour: 10,
      weeklyPL: true,
      weeklyPLDay: 1,
      monthlyPL: true,
      monthlyPLDay: 1,
    };
  }

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function rs(n) {
    if (global.RSReportPdf) {return RSReportPdf.money(n);}
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function outletName() {
    const s = global.RS_SETTINGS || {};
    return s.set_outlet_name || s.set_restaurant_name || 'RestroSuite';
  }
  function bills() {
    return (global.RS && Array.isArray(RS.BILLS) ? RS.BILLS : []) || [];
  }
  function inventory() {
    return (global.RS && Array.isArray(RS.INVENTORY) ? RS.INVENTORY : []) || [];
  }
  function dayKey(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10);
  }
  function loadSent() {
    try {
      return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }
  function markSent(key) {
    const s = loadSent();
    s[key] = new Date().toISOString();
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify(s));
    } catch (_) {}
  }
  function wasSent(key) {
    return !!loadSent()[key];
  }

  function loadCfgLocal() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) {return defaults();}
      return Object.assign(defaults(), JSON.parse(raw));
    } catch (_) {
      return defaults();
    }
  }

  async function loadCfg() {
    let local = loadCfgLocal();
    try {
      if (global.RS_DB && RS_DB.list) {
        const rows = await RS_DB.list('owner_report_prefs');
        if (rows && rows[0]) {
          const r = rows[0];
          local = Object.assign(local, {
            enabled: r.enabled !== false,
            ownerPhone: r.ownerPhone || local.ownerPhone,
            dailySales: r.dailySales !== false,
            dailySalesHour: r.dailySalesHour || 22,
            stockAlerts: r.stockAlerts !== false,
            stockAlertHour: r.stockAlertHour || 10,
            weeklyPL: r.weeklyPL !== false,
            weeklyPLDay: r.weeklyPLDay || 1,
            monthlyPL: r.monthlyPL !== false,
            monthlyPLDay: r.monthlyPLDay || 1,
          });
        }
      }
    } catch (_) {}
    return local;
  }

  async function saveCfg(cfg) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch (_) {}
    try {
      if (global.RS_DB && RS_DB.put) {
        const tid =
          (global.RS_API && RS_API.session && RS_API.session() && RS_API.session().tenant_id) ||
          sessionStorage.getItem('tenant_id') ||
          'local';
        await RS_DB.put('owner_report_prefs', tid, Object.assign({}, cfg, { id: tid, tenantId: tid }));
      }
    } catch (e) {
      console.warn('[OwnerWA] cloud prefs save', e);
    }
  }

  function billsInRange(fromMs, toMs) {
    return bills().filter(function (b) {
      if (b.status === 'refunded' || b.status === 'void' || b.status === 'voided') {return false;}
      const t = new Date(b.time || b.dateTime || b.created_at || b.createdAt || 0).getTime();
      if (!t || isNaN(t)) {return false;}
      return t >= fromMs && t <= toMs;
    });
  }

  function sumBills(list) {
    let gross = 0;
    const count = list.length;
    let cash = 0;
    let upi = 0;
    let card = 0;
    let due = 0;
    let tax = 0;
    list.forEach(function (b) {
      const g = Number(b.grand != null ? b.grand : b.amount != null ? b.amount : b.total) || 0;
      gross += g;
      tax += Number(b.gst) || 0;
      if (Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach(function (t) {
          const m = String(t.method || '').toLowerCase();
          const a = Number(t.amount) || 0;
          if (m.indexOf('cash') >= 0) {cash += a;}
          else if (m.indexOf('upi') >= 0) {upi += a;}
          else if (m.indexOf('card') >= 0) {card += a;}
          else if (m.indexOf('due') >= 0) {due += a;}
        });
      } else {
        const method = String(b.pay || b.paymentMethod || b.payMethod || '').toLowerCase();
        if (method.indexOf('cash') >= 0) {cash += g;}
        else if (method.indexOf('upi') >= 0) {upi += g;}
        else if (method.indexOf('card') >= 0) {card += g;}
        else if (method.indexOf('due') >= 0) {due += g;}
        else {cash += g;}
      }
    });
    return {
      gross: gross,
      count: count,
      cash: cash,
      upi: upi,
      card: card,
      due: due,
      tax: tax,
      avg: count ? gross / count : 0,
    };
  }

  function lowStockRows() {
    return inventory().filter(function (i) {
      const stock = Number(i.stock != null ? i.stock : i.current) || 0;
      const min = Number(i.min != null ? i.min : 0) || 0;
      const max = Number(i.max != null ? i.max : i.max_stock) || 0;
      if (stock <= 0) {return true;}
      if (min > 0 && stock <= min) {return true;}
      if (max > 0) {
        const thr = Number(i.threshold) || 15;
        if ((stock / max) * 100 <= thr) {return true;}
      }
      return false;
    });
  }

  function estimateCogs(list) {
    let cost = 0;
    const menu = (global.RS && RS.MENU) || [];
    const inv = inventory();
    list.forEach(function (b) {
      (b.items || b._items || []).forEach(function (line) {
        const m = menu.find(function (x) {
          return x.name === line.name || String(x.id) === String(line.id);
        });
        if (!m || !Array.isArray(m.ingredients)) {return;}
        const qty = Number(line.qty) || 1;
        const portion = Number(line.portion || line.servings) || 1;
        const base = Math.max(1, Number(m.recipeServings) || 1);
        m.ingredients.forEach(function (ing) {
          const need = ((Number(ing.qty) || 0) / base) * qty * portion;
          const row = inv.find(function (i) {
            return i.name === ing.name;
          });
          cost += need * (row ? Number(row.cost) || 0 : 0);
        });
      });
    });
    return cost;
  }

  async function sendPdfOrText(phone, caption, pdfOpts, filename) {
    if (global.RSReportPdf && RSReportPdf.buildReportPdf) {
      try {
        const dataUri = await RSReportPdf.buildReportPdf(pdfOpts);
        const res = await RSReportPdf.sendReportWhatsApp(phone, caption, dataUri, filename);
        return res;
      } catch (e) {
        console.warn('[OwnerWA] PDF path failed', e);
      }
    }
    if (global.RS_API && typeof RS_API.data === 'function') {
      await RS_API.data({ operation: 'gateway_send', phone: phone, message: caption });
      return { mode: 'text' };
    }
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(caption), '_blank');
    return { mode: 'wa.me' };
  }

  async function sendDailySales(force) {
    const cfg = await loadCfg();
    if (!cfg.enabled || !cfg.dailySales) {return { skipped: true };}
    const key = 'daily-' + dayKey();
    if (!force && wasSent(key)) {return { skipped: true, reason: 'already_sent' };}
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const list = billsInRange(start.getTime(), Date.now());
    const s = sumBills(list);
    const caption =
      '*' +
      outletName() +
      ' — Daily sales ' +
      dayKey() +
      '*\nBills: ' +
      s.count +
      '\nGross: ' +
      rs(s.gross) +
      '\nAvg: ' +
      rs(s.avg);
    const pdfOpts = {
      brand: outletName(),
      title: 'Daily Sales Report',
      subtitle: dayKey() + ' · generated ' + new Date().toLocaleString('en-IN'),
      lines: [
        'Total bills: ' + s.count,
        'Gross revenue: ' + rs(s.gross),
        'Average ticket: ' + rs(s.avg),
        'Tax (billed): ' + rs(s.tax),
      ],
      sections: [
        {
          heading: 'Tenders',
          rows: [
            ['Cash', rs(s.cash)],
            ['UPI', rs(s.upi)],
            ['Card', rs(s.card)],
            ['Due', rs(s.due)],
          ],
        },
      ],
      footer: 'RestroSuite automatic owner report',
    };
    const res = await sendPdfOrText(cfg.ownerPhone, caption, pdfOpts, 'daily-sales-' + dayKey() + '.pdf');
    markSent(key);
    toast(res.mode === 'pdf' ? 'Daily sales PDF sent' : 'Daily sales sent', 'fa-whatsapp');
    return { ok: true, summary: s, mode: res.mode };
  }

  async function sendStockAlert(force) {
    const cfg = await loadCfg();
    if (!cfg.enabled || !cfg.stockAlerts) {return { skipped: true };}
    const rows = lowStockRows();
    if (!rows.length && !force) {return { skipped: true, reason: 'no_low_stock' };}
    const key = 'stock-' + dayKey();
    if (!force && wasSent(key)) {return { skipped: true, reason: 'already_sent' };}
    const caption =
      '*' +
      outletName() +
      ' — Stock alert*\n' +
      (rows.length ? rows.length + ' item(s) low / out' : 'All stock above threshold');
    const pdfOpts = {
      brand: outletName(),
      title: 'Stock Alert',
      subtitle: dayKey(),
      lines: rows.length ? [] : ['All items are above reorder threshold.'],
      sections: [
        {
          heading: 'Items needing attention',
          rows: rows.slice(0, 40).map(function (i) {
            const stock = Number(i.stock != null ? i.stock : i.current) || 0;
            return [(i.name || i.label || i.key) + (stock <= 0 ? ' OUT' : ''), stock + ' ' + (i.unit || '')];
          }),
        },
      ],
      footer: 'RestroSuite inventory',
    };
    const res = await sendPdfOrText(cfg.ownerPhone, caption, pdfOpts, 'stock-alert-' + dayKey() + '.pdf');
    markSent(key);
    toast('Stock report sent', 'fa-boxes-stacked');
    return { ok: true, count: rows.length, mode: res.mode };
  }

  function getWeekKey(d) {
    d = new Date(d);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return d.getFullYear() + '-W' + String(week).padStart(2, '0');
  }

  async function sendPL(period, force) {
    const cfg = await loadCfg();
    const isWeek = period === 'weekly';
    if (isWeek && (!cfg.enabled || !cfg.weeklyPL)) {return { skipped: true };}
    if (!isWeek && (!cfg.enabled || !cfg.monthlyPL)) {return { skipped: true };}
    const now = new Date();
    const key = isWeek ? 'wpl-' + getWeekKey(now) : 'mpl-' + now.toISOString().slice(0, 7);
    if (!force && wasSent(key)) {return { skipped: true, reason: 'already_sent' };}
    let start = new Date();
    if (isWeek) {start.setDate(start.getDate() - 7);}
    else {start = new Date(now.getFullYear(), now.getMonth(), 1);}
    const list = billsInRange(start.getTime(), Date.now());
    const s = sumBills(list);
    const cogs = estimateCogs(list);
    const profit = s.gross - cogs;
    const label = isWeek ? 'Weekly P&L · ' + getWeekKey(now) : 'Monthly P&L · ' + now.toISOString().slice(0, 7);
    const caption =
      '*' +
      outletName() +
      ' — ' +
      label +
      '*\nRevenue: ' +
      rs(s.gross) +
      '\nEst. COGS: ' +
      rs(cogs) +
      '\nEst. profit: ' +
      rs(profit);
    const pdfOpts = {
      brand: outletName(),
      title: label,
      subtitle: start.toISOString().slice(0, 10) + ' → ' + dayKey(),
      lines: ['Bills: ' + s.count, 'Revenue: ' + rs(s.gross), 'Tax: ' + rs(s.tax)],
      sections: [
        {
          heading: 'Profit & loss (recipe-based COGS where linked)',
          rows: [
            ['Gross revenue', rs(s.gross)],
            ['Estimated COGS', rs(cogs)],
            ['Estimated gross profit', rs(profit)],
            ['Margin', s.gross ? Math.round((profit / s.gross) * 100) + '%' : '—'],
          ],
        },
        {
          heading: 'Tenders',
          rows: [
            ['Cash', rs(s.cash)],
            ['UPI', rs(s.upi)],
            ['Card', rs(s.card)],
            ['Due', rs(s.due)],
          ],
        },
      ],
      footer: 'COGS uses recipe costs when ingredients are linked; otherwise 0 for unlinked dishes.',
    };
    const res = await sendPdfOrText(
      cfg.ownerPhone,
      caption,
      pdfOpts,
      (isWeek ? 'weekly' : 'monthly') + '-pl.pdf'
    );
    markSent(key);
    toast((isWeek ? 'Weekly' : 'Monthly') + ' P&L sent', 'fa-chart-line');
    return { ok: true, mode: res.mode };
  }

  async function sendWeeklyPL(force) {
    return sendPL('weekly', force);
  }
  async function sendMonthlyPL(force) {
    return sendPL('monthly', force);
  }

  async function tick() {
    const cfg = await loadCfg();
    if (!cfg.enabled || !cfg.ownerPhone) {return;}
    const now = new Date();
    const h = now.getHours();
    if (cfg.dailySales && h >= (cfg.dailySalesHour || 22)) {
      sendDailySales(false).catch(function (e) {
        console.warn('[OwnerWA] daily', e);
      });
    }
    if (cfg.stockAlerts && h >= (cfg.stockAlertHour || 10) && h < (cfg.stockAlertHour || 10) + 3) {
      sendStockAlert(false).catch(function (e) {
        console.warn('[OwnerWA] stock', e);
      });
    }
    if (cfg.weeklyPL && now.getDay() === (cfg.weeklyPLDay % 7) && h >= 9) {
      sendWeeklyPL(false).catch(function () {});
    }
    if (cfg.monthlyPL && now.getDate() === (cfg.monthlyPLDay || 1) && h >= 9) {
      sendMonthlyPL(false).catch(function () {});
    }
  }

  function notifyStockNowIfCritical() {
    const rows = lowStockRows().filter(function (i) {
      return (Number(i.stock != null ? i.stock : i.current) || 0) <= 0;
    });
    if (!rows.length) {return;}
    loadCfg().then(function (cfg) {
      if (!cfg.enabled || !cfg.stockAlerts || !cfg.ownerPhone) {return;}
      const key = 'stock-crit-' + dayKey();
      if (wasSent(key)) {return;}
      sendStockAlert(true)
        .then(function () {
          markSent(key);
        })
        .catch(function () {});
    });
  }

  function openSettingsModal() {
    loadCfg().then(function (cfg) {
      if (!global.RSModal) {
        const p = window.prompt('Owner WhatsApp (digits with country code)', cfg.ownerPhone || '');
        if (p != null) {
          cfg.ownerPhone = String(p).replace(/\D/g, '');
          saveCfg(cfg);
          toast('Saved', 'fa-whatsapp');
        }
        return;
      }
      RSModal.open({
        title: 'Owner WhatsApp reports',
        sub: 'Daily sales PDF · stock · weekly/monthly P&L',
        icon: 'fa-brands fa-whatsapp',
        size: 'sm',
        body:
          '<div style="display:flex;flex-direction:column;gap:12px">' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="ow-en" ' +
          (cfg.enabled ? 'checked' : '') +
          '> Enable automatic owner reports</label>' +
          '<div><label class="fl">Your WhatsApp number</label><input class="form-input" id="ow-phone" placeholder="91XXXXXXXXXX" value="' +
          String(cfg.ownerPhone || '').replace(/"/g, '') +
          '"></div>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="ow-daily" ' +
          (cfg.dailySales ? 'checked' : '') +
          '> Daily sales PDF</label>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="ow-stock" ' +
          (cfg.stockAlerts ? 'checked' : '') +
          '> Stock out / near-threshold PDF</label>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="ow-wpl" ' +
          (cfg.weeklyPL ? 'checked' : '') +
          '> Weekly profit &amp; loss PDF</label>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="ow-mpl" ' +
          (cfg.monthlyPL ? 'checked' : '') +
          '> Monthly profit &amp; loss PDF</label>' +
          '<p style="font-size:12px;color:var(--text-soft);margin:0;line-height:1.4">PDFs send via linked WhatsApp gateway while this device is open. Cloud prefs sync across outlets.</p>' +
          '</div>',
        foot:
          '<button class="btn btn-ghost" style="flex:1" data-test>Send all now</button>' +
          '<button class="btn btn-primary" style="flex:1" data-ok>Save</button>',
        onMount: function (modal, close) {
          modal.querySelector('[data-ok]').onclick = async function () {
            cfg.enabled = !!modal.querySelector('#ow-en').checked;
            cfg.ownerPhone = String(modal.querySelector('#ow-phone').value || '').replace(/\D/g, '');
            cfg.dailySales = !!modal.querySelector('#ow-daily').checked;
            cfg.stockAlerts = !!modal.querySelector('#ow-stock').checked;
            cfg.weeklyPL = !!modal.querySelector('#ow-wpl').checked;
            cfg.monthlyPL = !!modal.querySelector('#ow-mpl').checked;
            await saveCfg(cfg);
            toast('Owner report settings saved', 'fa-check');
            close();
          };
          modal.querySelector('[data-test]').onclick = async function () {
            cfg.ownerPhone = String(modal.querySelector('#ow-phone').value || '').replace(/\D/g, '');
            await saveCfg(cfg);
            const prog =
              global.RSProgress &&
              RSProgress.open({ title: 'Sending owner reports…', total: 4, unit: 'reports' });
            try {
              await sendDailySales(true);
              if (prog) {prog.update({ done: 1 });}
              await sendStockAlert(true);
              if (prog) {prog.update({ done: 2 });}
              await sendWeeklyPL(true);
              if (prog) {prog.update({ done: 3 });}
              await sendMonthlyPL(true);
              if (prog) {prog.update({ done: 4 });}
            } catch (e) {
              toast(e.message || 'Send failed', 'fa-circle-exclamation');
            } finally {
              if (prog) {prog.close();}
            }
          };
        },
      });
    });
  }

  global.RSOwnerReports = {
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    sendDailySales: sendDailySales,
    sendStockAlert: sendStockAlert,
    sendWeeklyPL: sendWeeklyPL,
    sendMonthlyPL: sendMonthlyPL,
    openSettingsModal: openSettingsModal,
    notifyStockNowIfCritical: notifyStockNowIfCritical,
    tick: tick,
  };

  document.addEventListener('rs:ready', function () {
    try {
      tick();
      setInterval(function () {
        tick();
      }, 10 * 60 * 1000);
    } catch (_) {}
  });
  document.addEventListener('rs:render-inventory', function () {
    try {
      notifyStockNowIfCritical();
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);
