/* ============================================================
   RestroSuite — Commission 10/10 (cloud + PDF statements)
   ============================================================ */
(function (global) {
  'use strict';

  var PARTNERS_KEY = 'rs_commission_partners_v1';
  var EVENTS_KEY = 'rs_commission_events_v1';
  var PAYOUTS_KEY = 'rs_commission_payouts_v1';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
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
  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]') || [];
    } catch (_) {
      return [];
    }
  }
  function save(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr || []));
    } catch (_) {}
  }
  async function putColl(coll, row) {
    try {
      if (global.RS_DB && RS_DB.put) await RS_DB.put(coll, row.id, row);
    } catch (e) {
      console.warn('[Commission] put', coll, e);
    }
  }
  async function listColl(coll, lsKey) {
    try {
      if (global.RS_DB && RS_DB.list) {
        var rows = await RS_DB.list(coll);
        if (Array.isArray(rows) && rows.length) {
          save(lsKey, rows);
          return rows;
        }
      }
    } catch (_) {}
    return load(lsKey);
  }

  async function partners() {
    return listColl('commission_partners', PARTNERS_KEY);
  }
  async function events() {
    return listColl('commission_events', EVENTS_KEY);
  }
  async function payouts() {
    return listColl('commission_payouts', PAYOUTS_KEY);
  }

  async function savePartner(p) {
    var list = await partners();
    var i = list.findIndex(function (x) {
      return String(x.id) === String(p.id);
    });
    if (i >= 0) list[i] = p;
    else list.unshift(p);
    save(PARTNERS_KEY, list);
    await putColl('commission_partners', p);
  }

  function calcCommission(partner, billGrand) {
    var g = Number(billGrand) || 0;
    if (partner.type === 'flat') return Number(partner.rate) || 0;
    return Math.round(g * ((Number(partner.rate) || 0) / 100) * 100) / 100;
  }

  async function recordSale(partnerId, bill) {
    if (!partnerId || !bill) return null;
    var list = await partners();
    var p = list.find(function (x) {
      return String(x.id) === String(partnerId);
    });
    if (!p || p.active === false) return null;
    var grand = Number(bill.grand != null ? bill.grand : bill.total) || 0;
    var amount = calcCommission(p, grand);
    var row = {
      id: 'ce-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      partnerId: p.id,
      partnerName: p.name,
      billNo: bill.no || bill.orderId || '',
      billGrand: grand,
      commission: amount,
      customer: bill.customer || bill.customerName || 'Walk-in',
      at: new Date().toISOString(),
      paidOut: false,
    };
    var ev = await events();
    ev.unshift(row);
    save(EVENTS_KEY, ev.slice(0, 3000));
    await putColl('commission_events', row);
    return row;
  }

  function filterStats(list, partnerId, fromMs, toMs) {
    var rows = list.filter(function (e) {
      if (String(e.partnerId) !== String(partnerId)) return false;
      var t = new Date(e.at).getTime();
      return t >= fromMs && t <= toMs;
    });
    var sales = rows.reduce(function (s, e) {
      return s + (Number(e.billGrand) || 0);
    }, 0);
    var commission = rows.reduce(function (s, e) {
      return s + (Number(e.commission) || 0);
    }, 0);
    var unpaid = rows
      .filter(function (e) {
        return !e.paidOut;
      })
      .reduce(function (s, e) {
        return s + (Number(e.commission) || 0);
      }, 0);
    return { count: rows.length, sales: sales, commission: commission, unpaid: unpaid, events: rows };
  }

  async function partnerStats(partnerId, fromMs, toMs) {
    return filterStats(await events(), partnerId, fromMs, toMs);
  }

  async function notifyPartner(partner, text, pdfOpts) {
    var phone = String(partner.phone || '').replace(/\D/g, '');
    if (!phone) {
      toast('No WhatsApp for ' + partner.name, 'fa-circle-exclamation');
      return;
    }
    if (pdfOpts && global.RSReportPdf) {
      try {
        var dataUri = await RSReportPdf.buildReportPdf(pdfOpts);
        return await RSReportPdf.sendReportWhatsApp(
          phone,
          text,
          dataUri,
          pdfOpts.filename || 'commission.pdf'
        );
      } catch (e) {
        console.warn('[Commission] PDF failed', e);
      }
    }
    if (global.RS_API && typeof RS_API.data === 'function') {
      try {
        await RS_API.data({ operation: 'gateway_send', phone: phone, message: text });
        return { mode: 'text' };
      } catch (_) {}
    }
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank');
    return { mode: 'wa.me' };
  }

  function periodRange(period) {
    var end = new Date();
    var start = new Date();
    if (period === 'weekly') start.setDate(start.getDate() - 7);
    else if (period === 'monthly') start.setMonth(start.getMonth() - 1);
    else start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), end: end.getTime(), label: period };
  }

  async function sendPartnerStatement(partnerId, period) {
    var list = await partners();
    var p = list.find(function (x) {
      return String(x.id) === String(partnerId);
    });
    if (!p) return;
    var range = periodRange(period || 'daily');
    var st = await partnerStats(p.id, range.start, range.end);
    var text =
      '*Commission — ' +
      range.label +
      '*\n' +
      p.name +
      '\nReferrals: ' +
      st.count +
      '\nSales: ' +
      rs(st.sales) +
      '\nCommission: ' +
      rs(st.commission) +
      '\nUnpaid: ' +
      rs(st.unpaid);
    await notifyPartner(p, text, {
      brand: 'RestroSuite',
      title: 'Commission statement',
      subtitle: p.name + ' · ' + range.label,
      lines: ['Rate: ' + (p.type === 'flat' ? rs(p.rate) + '/bill' : p.rate + '%')],
      sections: [
        {
          heading: 'Period totals',
          rows: [
            ['Referrals', String(st.count)],
            ['Sales brought', rs(st.sales)],
            ['Commission earned', rs(st.commission)],
            ['Still unpaid', rs(st.unpaid)],
          ],
        },
        {
          heading: 'Recent bills',
          rows: st.events.slice(0, 20).map(function (e) {
            return [e.billNo || '—', rs(e.commission)];
          }),
        },
      ],
      footer: 'Generated ' + new Date().toLocaleString('en-IN'),
      filename: 'commission-' + range.label + '-' + p.name.replace(/\s+/g, '-') + '.pdf',
    });
    toast('Statement PDF sent to ' + p.name, 'fa-whatsapp');
  }

  async function markPayout(partnerId, period) {
    var list = await partners();
    var p = list.find(function (x) {
      return String(x.id) === String(partnerId);
    });
    if (!p) return;
    var range = periodRange(period || 'monthly');
    var st = await partnerStats(p.id, range.start, range.end);
    if (st.unpaid <= 0) {
      toast('Nothing unpaid for this period', 'fa-circle-info');
      return;
    }
    var ev = await events();
    ev = ev.map(function (e) {
      if (String(e.partnerId) !== String(p.id) || e.paidOut) return e;
      var t = new Date(e.at).getTime();
      if (t >= range.start && t <= range.end) {
        e.paidOut = true;
        putColl('commission_events', e);
      }
      return e;
    });
    save(EVENTS_KEY, ev);
    var pay = {
      id: 'cp-' + Date.now(),
      partnerId: p.id,
      partnerName: p.name,
      amount: st.unpaid,
      period: period,
      paidAt: new Date().toISOString(),
    };
    var pl = await payouts();
    pl.unshift(pay);
    save(PAYOUTS_KEY, pl);
    await putColl('commission_payouts', pay);
    await notifyPartner(
      p,
      'Commission paid: ' + rs(st.unpaid) + ' for ' + (period || 'period') + '. Thank you!',
      {
        brand: 'RestroSuite',
        title: 'Commission payout',
        subtitle: p.name,
        sections: [
          {
            heading: 'Payment',
            rows: [
              ['Amount', rs(st.unpaid)],
              ['Period', period || 'monthly'],
              ['Referrals', String(st.count)],
            ],
          },
        ],
        filename: 'payout-' + p.name.replace(/\s+/g, '-') + '.pdf',
      }
    );
    toast('Payout recorded', 'fa-circle-check');
    renderCommissionPanel();
  }

  function openPartnerModal(existing) {
    if (!global.RSModal) return;
    var p = existing || {
      id: 'cpn-' + Date.now(),
      name: '',
      phone: '',
      type: 'percent',
      rate: 5,
      active: true,
    };
    RSModal.open({
      title: existing ? 'Edit partner' : 'Add commission partner',
      sub: 'Agents, staff referrers, hotel desks, influencers',
      icon: 'fa-handshake',
      size: 'sm',
      body:
        '<div style="display:flex;flex-direction:column;gap:12px">' +
        '<div><label class="fl">Name</label><input class="form-input" id="cp-name" value="' +
        esc(p.name) +
        '"></div>' +
        '<div><label class="fl">WhatsApp</label><input class="form-input" id="cp-phone" value="' +
        esc(p.phone || '') +
        '" placeholder="91XXXXXXXXXX"></div>' +
        '<div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label class="fl">Type</label><select class="form-input" id="cp-type">' +
        '<option value="percent"' +
        (p.type !== 'flat' ? ' selected' : '') +
        '>% of bill</option>' +
        '<option value="flat"' +
        (p.type === 'flat' ? ' selected' : '') +
        '>Flat per bill</option></select></div>' +
        '<div><label class="fl">Rate</label><input class="form-input" id="cp-rate" type="number" min="0" step="0.1" value="' +
        (p.rate != null ? p.rate : 5) +
        '"></div></div></div>',
      foot:
        '<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" data-ok>Save</button>',
      onMount: function (modal, close) {
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-ok]').onclick = async function () {
          p.name = (modal.querySelector('#cp-name').value || '').trim();
          p.phone = String(modal.querySelector('#cp-phone').value || '').replace(/\D/g, '');
          p.type = modal.querySelector('#cp-type').value;
          p.rate = parseFloat(modal.querySelector('#cp-rate').value) || 0;
          p.active = true;
          if (!p.name) {
            toast('Name required', 'fa-circle-exclamation');
            return;
          }
          await savePartner(p);
          close();
          toast(p.name + ' saved', 'fa-handshake');
          renderCommissionPanel();
          refreshPartnerSelect();
        };
      },
    });
  }

  async function renderCommissionPanel() {
    var host = document.getElementById('growth-hub-tab') || document.getElementById('customers-tab');
    if (!host) return;
    var wrap = document.getElementById('rs-commission-panel');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'rs-commission-panel';
      wrap.className = 'panel panel-pad';
      wrap.style.marginTop = '16px';
      host.appendChild(wrap);
    }
    var list = await partners();
    var day = periodRange('daily');
    var allEv = await events();
    wrap.innerHTML =
      '<div class="panel-head" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">' +
      '<div><h3 style="margin:0">Commission partners</h3>' +
      '<div style="font-size:12px;color:var(--text-soft)">Cloud-synced · daily/weekly/monthly PDF to WhatsApp</div></div>' +
      '<div class="grow"></div>' +
      '<button type="button" class="btn btn-primary btn-sm" id="cp-add"><i class="fa-solid fa-user-plus"></i> Add partner</button>' +
      '</div>' +
      (list.length
        ? '<div class="table-scroll" style="margin-top:12px"><table class="data-table"><thead><tr><th>Partner</th><th>Rate</th><th>Today</th><th>Unpaid</th><th></th></tr></thead><tbody>' +
          list
            .map(function (p) {
              var st = filterStats(allEv, p.id, day.start, day.end);
              var allUnpaid = filterStats(allEv, p.id, 0, Date.now()).unpaid;
              return (
                '<tr><td><b>' +
                esc(p.name) +
                '</b><div style="font-size:11px;color:var(--text-mute)">' +
                esc(p.phone || 'no phone') +
                '</div></td><td>' +
                (p.type === 'flat' ? rs(p.rate) + '/bill' : p.rate + '%') +
                '</td><td>' +
                st.count +
                ' · ' +
                rs(st.commission) +
                '</td><td class="td-strong">' +
                rs(allUnpaid) +
                '</td><td style="white-space:nowrap">' +
                '<button type="button" class="btn btn-ghost btn-sm cp-day" data-id="' +
                esc(p.id) +
                '">Day PDF</button> ' +
                '<button type="button" class="btn btn-ghost btn-sm cp-week" data-id="' +
                esc(p.id) +
                '">Week</button> ' +
                '<button type="button" class="btn btn-ghost btn-sm cp-mon" data-id="' +
                esc(p.id) +
                '">Month</button> ' +
                '<button type="button" class="btn btn-primary btn-sm cp-pay" data-id="' +
                esc(p.id) +
                '">Pay</button></td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div>'
        : '<div class="sr-empty" style="padding:24px;margin-top:8px">No partners yet.</div>');

    var add = wrap.querySelector('#cp-add');
    if (add)
      add.onclick = function () {
        openPartnerModal();
      };
    wrap.querySelectorAll('.cp-day').forEach(function (b) {
      b.onclick = function () {
        sendPartnerStatement(b.dataset.id, 'daily');
      };
    });
    wrap.querySelectorAll('.cp-week').forEach(function (b) {
      b.onclick = function () {
        sendPartnerStatement(b.dataset.id, 'weekly');
      };
    });
    wrap.querySelectorAll('.cp-mon').forEach(function (b) {
      b.onclick = function () {
        sendPartnerStatement(b.dataset.id, 'monthly');
      };
    });
    wrap.querySelectorAll('.cp-pay').forEach(function (b) {
      b.onclick = function () {
        markPayout(b.dataset.id, 'monthly');
      };
    });
  }

  function ensureCartPartnerSelect() {
    var row = document.getElementById('cart-meta-row');
    if (!row || document.getElementById('cart-commission-partner')) return;
    var box = document.createElement('div');
    box.style.cssText = 'margin-top:8px;width:100%';
    box.innerHTML =
      '<label class="fl" style="font-size:11px">Referred by (commission)</label>' +
      '<select class="form-input" id="cart-commission-partner" style="font-size:12.5px"><option value="">— None —</option></select>';
    row.appendChild(box);
    refreshPartnerSelect();
  }

  async function refreshPartnerSelect() {
    var sel = document.getElementById('cart-commission-partner');
    if (!sel) return;
    var cur = sel.value;
    var list = await partners();
    sel.innerHTML =
      '<option value="">— None —</option>' +
      list
        .filter(function (p) {
          return p.active !== false;
        })
        .map(function (p) {
          return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
        })
        .join('');
    if (cur) sel.value = cur;
  }

  function getSelectedPartnerId() {
    var sel = document.getElementById('cart-commission-partner');
    return sel && sel.value ? sel.value : '';
  }

  global.RSCommission = {
    partners: partners,
    recordSale: recordSale,
    partnerStats: partnerStats,
    sendPartnerStatement: sendPartnerStatement,
    markPayout: markPayout,
    openPartnerModal: openPartnerModal,
    renderCommissionPanel: renderCommissionPanel,
    ensureCartPartnerSelect: ensureCartPartnerSelect,
    getSelectedPartnerId: getSelectedPartnerId,
    refreshPartnerSelect: refreshPartnerSelect,
  };

  document.addEventListener('rs:ready', function () {
    setTimeout(function () {
      ensureCartPartnerSelect();
      renderCommissionPanel();
    }, 600);
  });
  document.addEventListener('rs:bill-settled', function (ev) {
    try {
      var bill = ev && ev.detail && ev.detail.bill;
      var pid = (ev && ev.detail && ev.detail.partnerId) || getSelectedPartnerId();
      if (bill && pid) recordSale(pid, bill);
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);
