/* ============================================================
   RestroSuite — Staff efficiency → incentive guidance
   ============================================================ */
(function (global) {
  'use strict';

  const RSStaffEff = (global.RSStaffEff = global.RSStaffEff || {});

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
  function employees() {
    return (global.RS && Array.isArray(RS.EMPLOYEES) ? RS.EMPLOYEES : []) || [];
  }
  function bills() {
    return (global.RS && Array.isArray(RS.BILLS) ? RS.BILLS : []) || [];
  }
  function staffKeyFromBill(b) {
    return b.servedBy || b.staff || b.cashier || b.waiter || b.cashierName || b.createdBy || b.userName || null;
  }
  function inLastDays(iso, days) {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= Date.now() - days * 86400000;
  }
  function parsePayroll(raw) {
    const n = parseFloat(String(raw || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  function suggestIncentivePct(score) {
    if (score >= 90) return 12;
    if (score >= 80) return 8;
    if (score >= 70) return 5;
    if (score >= 55) return 3;
    if (score >= 40) return 1;
    return 0;
  }
  function suggestNote(x) {
    if (x.score >= 90) return 'Top performer — strong raise / bonus candidate';
    if (x.score >= 80) return 'High output — consider performance bonus';
    if (x.score >= 70) return 'Solid — small incentive or recognition';
    if (x.score >= 40) return 'Average — coach for more table turns / upsell';
    if (x.orders === 0) return 'No billed activity attributed — assign servedBy on POS';
    return 'Below target — training / shift review';
  }

  function computeEfficiency(days) {
    const d = Math.max(1, Number(days) || 30);
    const map = {};
    bills().forEach((b) => {
      const when = b.dateTime || b.time || b.createdAt || b.created_at;
      if (!inLastDays(when, d)) return;
      if (/cancel|void|refund/i.test(String(b.status || ''))) return;
      const who = staffKeyFromBill(b);
      if (!who) return;
      const key = String(who).trim();
      if (!map[key]) map[key] = { name: key, orders: 0, sales: 0, covers: 0, tips: 0, avgTicket: 0, score: 0 };
      map[key].orders += 1;
      map[key].sales += Number(b.amount != null ? b.amount : b.total) || 0;
      map[key].covers += Math.max(0, Number(b.covers != null ? b.covers : b.pax) || 0);
      map[key].tips += Number(b.tip || b.tips || 0) || 0;
    });
    employees().forEach((e) => {
      const name = e.name || e.displayName || e.username;
      if (!name) return;
      if (!map[name]) {
        map[name] = {
          name,
          orders: 0,
          sales: 0,
          covers: 0,
          tips: 0,
          avgTicket: 0,
          score: 0,
          role: e.role || e.staffRole || '',
          payroll: e.payroll || e.salary || '',
          empId: e.id,
        };
      } else {
        map[name].role = e.role || e.staffRole || map[name].role;
        map[name].payroll = e.payroll || e.salary || map[name].payroll;
        map[name].empId = e.id;
      }
    });
    const list = Object.values(map);
    const maxOrders = Math.max(1, ...list.map((x) => x.orders));
    const maxSales = Math.max(1, ...list.map((x) => x.sales));
    list.forEach((x) => {
      x.avgTicket = x.orders ? Math.round(x.sales / x.orders) : 0;
      const o = (x.orders / maxOrders) * 45;
      const s = (x.sales / maxSales) * 45;
      const c = Math.min(10, (x.covers / Math.max(1, x.orders || 1)) * 2);
      x.score = Math.round(Math.min(100, o + s + c));
      x.incentivePct = suggestIncentivePct(x.score);
      x.incentiveNote = suggestNote(x);
    });
    list.sort((a, b) => b.score - a.score);
    return { days: d, rows: list, periodLabel: 'Last ' + d + ' days' };
  }

  function renderPanel(host, days) {
    if (!host) return;
    const data = computeEfficiency(days || 30);
    host.innerHTML =
      '<div class="rs-eff-head" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start">' +
      '<div><h3 style="margin:0 0 4px;font-size:16px;font-weight:800">Staff efficiency</h3>' +
      '<p style="margin:0;font-size:12.5px;color:var(--text-soft)">' +
      esc(data.periodLabel) +
      ' · from bills (servedBy / cashier). Use for fair incentives.</p></div>' +
      '<div style="display:flex;gap:8px"><select id="rs-eff-days" class="form-input" style="width:auto">' +
      '<option value="7"' +
      (data.days === 7 ? ' selected' : '') +
      '>7 days</option>' +
      '<option value="30"' +
      (data.days === 30 ? ' selected' : '') +
      '>30 days</option>' +
      '<option value="90"' +
      (data.days === 90 ? ' selected' : '') +
      '>90 days</option></select>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="rs-eff-export"><i class="fa-solid fa-file-csv"></i> CSV</button></div></div>' +
      '<div class="table-scroll" style="margin-top:12px"><table class="data-table"><thead><tr>' +
      '<th>Team member</th><th>Orders</th><th>Sales</th><th>Covers</th><th>Avg ticket</th><th>Score</th><th>Suggested incentive</th><th></th>' +
      '</tr></thead><tbody>' +
      (data.rows.length
        ? data.rows
            .map((r) => {
              const base = parsePayroll(r.payroll);
              const bonus = base && r.incentivePct ? Math.round((base * r.incentivePct) / 100) : 0;
              const pill =
                r.score >= 70 ? 'pill-green' : r.score >= 40 ? 'pill-amber' : 'pill-red';
              return (
                '<tr><td><b>' +
                esc(r.name) +
                '</b>' +
                (r.role ? '<div style="font-size:11px;color:var(--text-soft)">' + esc(r.role) + '</div>' : '') +
                '</td><td>' +
                r.orders +
                '</td><td class="td-strong">' +
                rs(r.sales) +
                '</td><td>' +
                (r.covers || '—') +
                '</td><td>' +
                rs(r.avgTicket) +
                '</td><td><span class="pill ' +
                pill +
                '" style="padding:2px 8px">' +
                r.score +
                '</span></td><td style="font-size:12px">' +
                (r.incentivePct
                  ? '<b>+' + r.incentivePct + '%</b>' + (bonus ? ' · ~' + rs(bonus) : '')
                  : '—') +
                '<div style="color:var(--text-soft);font-size:11px;max-width:180px">' +
                esc(r.incentiveNote) +
                '</div></td><td><button type="button" class="btn btn-ghost btn-sm" data-eff-apply="' +
                esc(r.name) +
                '" data-pct="' +
                r.incentivePct +
                '" data-base="' +
                base +
                '">Apply</button></td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="8" style="text-align:center;color:var(--text-mute);padding:28px">No staff activity yet. Ring bills while logged in as staff (servedBy).</td></tr>') +
      '</tbody></table></div>' +
      '<p style="font-size:11.5px;color:var(--text-mute);margin-top:10px">Guidance only — owner approves raises. Attribute sales via staff login.</p>';

    const sel = host.querySelector('#rs-eff-days');
    if (sel) sel.onchange = () => renderPanel(host, Number(sel.value) || 30);
    const exp = host.querySelector('#rs-eff-export');
    if (exp) {
      exp.onclick = () => {
        const lines = [['name', 'orders', 'sales', 'covers', 'avgTicket', 'score', 'incentivePct', 'note'].join(',')];
        data.rows.forEach((r) => {
          lines.push(
            [
              r.name,
              r.orders,
              r.sales,
              r.covers,
              r.avgTicket,
              r.score,
              r.incentivePct,
              '"' + String(r.incentiveNote).replace(/"/g, '""') + '"',
            ].join(',')
          );
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
        a.download = 'staff_efficiency_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        toast('Efficiency CSV downloaded', 'fa-file-csv');
      };
    }
    host.querySelectorAll('[data-eff-apply]').forEach((btn) => {
      btn.onclick = async () => {
        const name = btn.getAttribute('data-eff-apply');
        const pct = Number(btn.getAttribute('data-pct')) || 0;
        const base = Number(btn.getAttribute('data-base')) || 0;
        const amount = base && pct ? Math.round((base * pct) / 100) : 0;
        const row = {
          id: 'INC-' + Date.now(),
          employeeName: name,
          incentivePct: pct,
          amount,
          baseSalary: base,
          note: 'Efficiency incentive ' + pct + '%',
          status: 'approved_pending_pay',
          createdAt: new Date().toISOString(),
        };
        try {
          const key = 'rs_staff_incentives_v1';
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          list.unshift(row);
          localStorage.setItem(key, JSON.stringify(list.slice(0, 200)));
          if (global.RS_DB && RS_DB.put) {
            try {
              await RS_DB.put('salary_payments', row.id, {
                id: row.id,
                employeeName: name,
                amount: amount || pct,
                type: 'incentive',
                note: row.note,
                date: row.createdAt,
                status: 'recorded',
              });
            } catch (_) {}
          }
          toast(
            pct
              ? 'Incentive logged for ' + name + (amount ? ' · ' + rs(amount) : ' · +' + pct + '%')
              : 'Note logged — no raise suggested for ' + name,
            'fa-gift'
          );
        } catch (_) {
          toast('Could not save incentive', 'fa-circle-exclamation');
        }
      };
    });
  }

  function mountIntoEmployees() {
    const tab = document.getElementById('employees-tab');
    if (!tab) return;
    let panel = tab.querySelector('#rs-staff-efficiency');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'rs-staff-efficiency';
      panel.className = 'panel panel-pad';
      panel.style.marginTop = '16px';
      tab.appendChild(panel);
    }
    renderPanel(panel, 30);
  }

  function boot() {
    document.addEventListener('rs:render-employees', () => setTimeout(mountIntoEmployees, 80));
    setTimeout(mountIntoEmployees, 1200);
  }

  RSStaffEff.computeEfficiency = computeEfficiency;
  RSStaffEff.renderPanel = renderPanel;
  RSStaffEff.mountIntoEmployees = mountIntoEmployees;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
