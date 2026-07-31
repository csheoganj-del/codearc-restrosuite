/* ============================================================
   RestroSuite — HR 10/10 (leave · advance · salary · WhatsApp)
   Cloud-backed via RS_DB when available; localStorage fallback.
   ============================================================ */
(function (global) {
  'use strict';

  const LEAVE_KEY = 'rs_leave_requests_v1';
  const ADV_KEY = 'rs_salary_advances_v1';
  const PAY_KEY = 'rs_salary_payments_v1';

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
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function employees() {
    return (global.RS && Array.isArray(RS.EMPLOYEES) ? RS.EMPLOYEES : []) || [];
  }
  function loadLS(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]') || [];
    } catch (_) {
      return [];
    }
  }
  function saveLS(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr || []));
    } catch (_) {}
  }

  async function putColl(coll, row) {
    try {
      if (global.RS_DB && RS_DB.put) {await RS_DB.put(coll, row.id, row);}
    } catch (e) {
      console.warn('[HR] put', coll, e);
    }
  }

  async function listColl(coll, lsKey) {
    try {
      if (global.RS_DB && RS_DB.list) {
        const rows = await RS_DB.list(coll);
        if (Array.isArray(rows) && rows.length) {
          saveLS(lsKey, rows);
          return rows;
        }
      }
    } catch (_) {}
    return loadLS(lsKey);
  }

  async function notifyEmployee(emp, text, pdfOpts) {
    let phone = String((emp && (emp.phone || emp.mobile || emp.whatsapp || emp.email)) || '').replace(
      /\D/g,
      ''
    );
    // email field may hold phone for some rows
    if (phone.length < 10 && emp && emp.email && /^\d{10,}$/.test(String(emp.email).replace(/\D/g, ''))) {
      phone = String(emp.email).replace(/\D/g, '');
    }
    if (!phone || phone.length < 10) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('No WhatsApp for ' + ((emp && emp.name) || 'staff') + ' — copy message', 'fa-copy');
      try {
        if (navigator.clipboard) {navigator.clipboard.writeText(text);}
      } catch (_) {}
      return { noPhone: true };
    }
    if (pdfOpts && global.RSReportPdf) {
      try {
        const dataUri = await RSReportPdf.buildReportPdf(pdfOpts);
        return await RSReportPdf.sendReportWhatsApp(
          phone,
          text,
          dataUri,
          pdfOpts.filename || 'hr-document.pdf'
        );
      } catch (e) {
        console.warn('[HR] PDF notify failed', e);
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

  function dayCount(from, to) {
    try {
      return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
    } catch (_) {
      return 1;
    }
  }

  async function listLeaves() {
    return listColl('leave_requests', LEAVE_KEY);
  }
  async function listAdvances() {
    return listColl('salary_advances', ADV_KEY);
  }
  async function listPayments() {
    return listColl('salary_payments', PAY_KEY);
  }

  function openLeaveModal(emp) {
    if (!global.RSModal) {return;}
    const emps = employees();
    const opts = emps
      .map(function (e) {
        return (
          '<option value="' +
          esc(e.id) +
          '"' +
          (emp && String(emp.id) === String(e.id) ? ' selected' : '') +
          '>' +
          esc(e.name) +
          '</option>'
        );
      })
      .join('');
    RSModal.open({
      title: 'Leave request',
      icon: 'fa-calendar-days',
      size: 'sm',
      body:
        '<div style="display:flex;flex-direction:column;gap:12px">' +
        '<div><label class="fl">Employee</label><select class="form-input" id="lv-emp">' +
        opts +
        '</select></div>' +
        '<div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label class="fl">From</label><input class="form-input" type="date" id="lv-from"></div>' +
        '<div><label class="fl">To</label><input class="form-input" type="date" id="lv-to"></div>' +
        '</div>' +
        '<div><label class="fl">Type</label><select class="form-input" id="lv-type">' +
        '<option value="casual">Casual leave</option><option value="sick">Sick leave</option>' +
        '<option value="earned">Earned / paid leave</option><option value="unpaid">Unpaid</option>' +
        '<option value="comp_off">Comp off</option></select></div>' +
        '<div><label class="fl">Reason</label><input class="form-input" id="lv-reason" placeholder="Optional"></div>' +
        '</div>',
      foot:
        '<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" data-ok>Submit</button>',
      onMount: function (modal, close) {
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-ok]').onclick = async function () {
          try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
          const empId = modal.querySelector('#lv-emp').value;
          const e = emps.find(function (x) {
            return String(x.id) === String(empId);
          });
          const from = modal.querySelector('#lv-from').value;
          const to = modal.querySelector('#lv-to').value || from;
          if (!e || !from) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Pick employee and dates', 'fa-circle-exclamation');
            return;
          }
          const row = {
            id: 'leave-' + Date.now(),
            employeeId: e.id,
            employeeName: e.name,
            startDate: from,
            endDate: to,
            from: from,
            to: to,
            type: modal.querySelector('#lv-type').value,
            reason: (modal.querySelector('#lv-reason').value || '').trim(),
            status: 'pending',
            days: dayCount(from, to),
            createdAt: new Date().toISOString(),
          };
          const list = await listLeaves();
          list.unshift(row);
          saveLS(LEAVE_KEY, list);
          await putColl('leave_requests', row);
          close();
          try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
          toast('Leave request saved', 'fa-calendar-check');
          renderHrPanels();
        };
      },
    });
  }

  async function setLeaveStatus(id, status) {
    let list = await listLeaves();
    let row = null;
    list = list.map(function (r) {
      if (String(r.id) === String(id)) {
        r.status = status;
        r.decidedAt = new Date().toISOString();
        row = r;
      }
      return r;
    });
    saveLS(LEAVE_KEY, list);
    if (row) {await putColl('leave_requests', row);}
    if (row && (status === 'approved' || status === 'rejected')) {
      const emp = employees().find(function (e) {
        return String(e.id) === String(row.employeeId);
      });
      if (emp) {
        // Deduct leave balance on approve
        if (status === 'approved' && row.type !== 'unpaid') {
          const balKey =
            row.type === 'sick' ? 'sickLeave' : row.type === 'earned' ? 'earnedLeave' : 'casualLeave';
          emp[balKey] = Math.max(0, (Number(emp[balKey]) || 12) - (Number(row.days) || 1));
          try {
            if (global.RS && RS.saveOne) {await RS.saveOne('employees', emp);}
            else if (global.RS_DB) {await RS_DB.put('employees', emp.id, emp);}
          } catch (_) {}
        }
        await notifyEmployee(
          emp,
          'Leave ' +
            status +
            ': ' +
            (row.startDate || row.from) +
            ' to ' +
            (row.endDate || row.to) +
            ' (' +
            row.type +
            ', ' +
            (row.days || 1) +
            ' day(s)). — RestroSuite HR'
        );
      }
    }
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    toast('Leave ' + status, 'fa-check');
    renderHrPanels();
  }

  function openAdvanceModal(emp) {
    if (!global.RSModal) {return;}
    const emps = employees();
    const opts = emps
      .map(function (e) {
        return (
          '<option value="' +
          esc(e.id) +
          '"' +
          (emp && String(emp.id) === String(e.id) ? ' selected' : '') +
          '>' +
          esc(e.name) +
          '</option>'
        );
      })
      .join('');
    RSModal.open({
      title: 'Salary advance',
      icon: 'fa-hand-holding-dollar',
      size: 'sm',
      body:
        '<div style="display:flex;flex-direction:column;gap:12px">' +
        '<div><label class="fl">Employee</label><select class="form-input" id="ad-emp">' +
        opts +
        '</select></div>' +
        '<div><label class="fl">Amount</label><input class="form-input" type="number" min="1" id="ad-amt" placeholder="2000"></div>' +
        '<div><label class="fl">Recover from</label><select class="form-input" id="ad-recover">' +
        '<option value="next_payroll">Next payroll</option>' +
        '<option value="emi_2">2 instalments</option>' +
        '<option value="emi_3">3 instalments</option>' +
        '<option value="manual">Manual recovery</option></select></div>' +
        '<div><label class="fl">Note</label><input class="form-input" id="ad-note"></div></div>',
      foot:
        '<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" data-ok>Record &amp; notify</button>',
      onMount: function (modal, close) {
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-ok]').onclick = async function () {
          const empId = modal.querySelector('#ad-emp').value;
          const e = emps.find(function (x) {
            return String(x.id) === String(empId);
          });
          const amt = parseFloat(modal.querySelector('#ad-amt').value);
          if (!e || !(amt > 0)) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Employee and amount required', 'fa-circle-exclamation');
            return;
          }
          const row = {
            id: 'adv-' + Date.now(),
            employeeId: e.id,
            employeeName: e.name,
            amount: amt,
            recover: modal.querySelector('#ad-recover').value,
            note: (modal.querySelector('#ad-note').value || '').trim(),
            status: 'paid',
            paidAt: new Date().toISOString(),
            remaining: amt,
          };
          const list = await listAdvances();
          list.unshift(row);
          saveLS(ADV_KEY, list);
          await putColl('salary_advances', row);
          close();
          await notifyEmployee(
            e,
            'Salary advance of ' +
              rs(amt) +
              ' recorded on ' +
              new Date().toLocaleDateString('en-IN') +
              '. Recovery: ' +
              row.recover.replace(/_/g, ' ') +
              '. — RestroSuite',
            {
              brand: 'RestroSuite HR',
              title: 'Advance receipt',
              subtitle: e.name,
              lines: ['Amount: ' + rs(amt), 'Recovery: ' + row.recover, 'Date: ' + new Date().toLocaleString('en-IN')],
              filename: 'advance-' + e.name.replace(/\s+/g, '-') + '.pdf',
            }
          );
          try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
          toast('Advance paid & notified', 'fa-whatsapp');
          renderHrPanels();
        };
      },
    });
  }

  function parsePay(emp) {
    return (
      parseFloat(String(emp.payroll || emp.salary || emp.baseSalary || '').replace(/[^0-9.]/g, '')) || 0
    );
  }

  function openSalaryPayModal() {
    if (!global.RSModal) {return;}
    const emps = employees().filter(function (e) {
      return parsePay(e) > 0;
    });
    if (!emps.length) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('Set monthly payroll on employees first', 'fa-circle-info');
      return;
    }
    listAdvances().then(function (allAdv) {
      const body =
        '<p style="font-size:12.5px;color:var(--text-soft);margin:0 0 10px">Mark salaries paid. Payslip PDF is sent on WhatsApp when a phone is on file.</p>' +
        '<div style="max-height:280px;overflow:auto;display:flex;flex-direction:column;gap:8px">' +
        emps
          .map(function (e, i) {
            const base = parsePay(e);
            const adv = allAdv
              .filter(function (a) {
                return String(a.employeeId) === String(e.id) && (Number(a.remaining) || 0) > 0;
              })
              .reduce(function (s, a) {
                return s + (Number(a.remaining) || 0);
              }, 0);
            const net = Math.max(0, base - Math.min(adv, base));
            return (
              '<label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--stroke-2);border-radius:10px">' +
              '<input type="checkbox" data-i="' +
              i +
              '" checked> <div style="flex:1"><b>' +
              esc(e.name) +
              '</b><div style="font-size:12px;color:var(--text-mute)">Base ' +
              rs(base) +
              (adv ? ' − adv ' + rs(Math.min(adv, base)) : '') +
              ' = <b style="color:var(--orange)">' +
              rs(net) +
              '</b></div></div></label>'
            );
          })
          .join('') +
        '</div>';
      RSModal.open({
        title: 'Pay salaries',
        icon: 'fa-money-check-dollar',
        size: 'sm',
        body: body,
        foot:
          '<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>' +
          '<button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-paper-plane"></i> Mark paid + payslips</button>',
        onMount: function (modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('[data-ok]').onclick = async function () {
            const month = new Date().toISOString().slice(0, 7);
            const payments = await listPayments();
            const selected = [];
            modal.querySelectorAll('input[data-i]:checked').forEach(function (cb) {
              selected.push(emps[+cb.getAttribute('data-i')]);
            });
            if (!selected.length) {
              try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
              toast('Select at least one person', 'fa-circle-exclamation');
              return;
            }
            const prog =
              global.RSProgress &&
              RSProgress.open({
                title: 'Paying salaries…',
                sub: 'Writing ledger + WhatsApp payslips',
                total: selected.length,
                unit: 'staff',
              });
            const advs = await listAdvances();
            for (let i = 0; i < selected.length; i++) {
              const e = selected[i];
              const base = parsePay(e);
              let deduct = 0;
              advs.forEach(function (a) {
                if (String(a.employeeId) !== String(e.id) || !(Number(a.remaining) > 0)) {return;}
                const take = Math.min(Number(a.remaining) || 0, base - deduct);
                if (take > 0) {
                  a.remaining = (Number(a.remaining) || 0) - take;
                  if (a.remaining <= 0) {a.status = 'recovered';}
                  deduct += take;
                  putColl('salary_advances', a);
                }
              });
              saveLS(ADV_KEY, advs);
              const net = Math.max(0, base - deduct);
              const pay = {
                id: 'pay-' + e.id + '-' + month,
                employeeId: e.id,
                employeeName: e.name,
                month: month,
                base: base,
                advanceDeducted: deduct,
                net: net,
                paidAt: new Date().toISOString(),
              };
              payments.unshift(pay);
              await putColl('salary_payments', pay);
              await notifyEmployee(
                e,
                'Salary paid for ' +
                  month +
                  '\nGross: ' +
                  rs(base) +
                  (deduct ? '\nAdvance recovery: −' + rs(deduct) : '') +
                  '\nNet: ' +
                  rs(net) +
                  '\n— RestroSuite HR',
                {
                  brand: 'RestroSuite',
                  title: 'Payslip · ' + month,
                  subtitle: e.name + ' · ' + (e.role || ''),
                  lines: [],
                  sections: [
                    {
                      heading: 'Earnings & deductions',
                      rows: [
                        ['Gross salary', rs(base)],
                        ['Advance recovery', '−' + rs(deduct)],
                        ['Net paid', rs(net)],
                      ],
                    },
                  ],
                  footer: 'Paid on ' + new Date().toLocaleString('en-IN'),
                  filename: 'payslip-' + month + '-' + e.name.replace(/\s+/g, '-') + '.pdf',
                }
              );
              if (prog) {prog.update({ done: i + 1 });}
            }
            saveLS(PAY_KEY, payments);
            if (prog) {prog.close();}
            close();
            try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
            toast(selected.length + ' salaries paid · payslips sent', 'fa-circle-check');
            renderHrPanels();
          };
        },
      });
    });
  }

  async function renderHrPanels() {
    const sec = document.getElementById('employees-tab');
    if (!sec) {return;}
    let wrap = document.getElementById('rs-hr-extended');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'rs-hr-extended';
      wrap.style.marginTop = '16px';
      sec.appendChild(wrap);
    }
    const leaves = (await listLeaves()).slice(0, 15);
    const advs = (await listAdvances()).slice(0, 15);
    const pays = (await listPayments()).slice(0, 8);
    wrap.innerHTML =
      '<div class="panel panel-pad" style="margin-bottom:14px">' +
      '<div class="panel-head" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">' +
      '<div><h3 style="margin:0">HR desk</h3><div style="font-size:12px;color:var(--text-soft)">Leave balances · advances · payslip WhatsApp · industry basics</div></div>' +
      '<div class="grow"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="hr-leave"><i class="fa-solid fa-calendar-plus"></i> Leave</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="hr-adv"><i class="fa-solid fa-hand-holding-dollar"></i> Advance</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="hr-pay"><i class="fa-solid fa-money-check-dollar"></i> Pay salaries</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:12px">' +
      '<div><div style="font-weight:700;font-size:13px;margin-bottom:8px">Leave queue</div>' +
      (leaves.length
        ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>Staff</th><th>Dates</th><th>Status</th><th></th></tr></thead><tbody>' +
          leaves
            .map(function (l) {
              return (
                '<tr><td><b>' +
                esc(l.employeeName) +
                '</b><div style="font-size:11px;color:var(--text-mute)">' +
                esc(l.type) +
                ' · ' +
                (l.days || 1) +
                'd</div></td><td style="font-size:12px">' +
                esc(l.startDate || l.from) +
                ((l.endDate || l.to) !== (l.startDate || l.from)
                  ? ' → ' + esc(l.endDate || l.to)
                  : '') +
                '</td><td><span class="pill" style="padding:2px 8px;text-transform:capitalize">' +
                esc(l.status) +
                '</span></td><td>' +
                (String(l.status).toLowerCase() === 'pending'
                  ? '<button type="button" class="btn btn-ghost btn-sm hr-lv-ok" data-id="' +
                    esc(l.id) +
                    '">OK</button> <button type="button" class="btn btn-ghost btn-sm hr-lv-no" data-id="' +
                    esc(l.id) +
                    '">No</button>'
                  : '') +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div>'
        : '<div class="sr-empty" style="padding:16px">No leave requests</div>') +
      '</div>' +
      '<div><div style="font-weight:700;font-size:13px;margin-bottom:8px">Advances</div>' +
      (advs.length
        ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>Staff</th><th>Amt</th><th>Left</th></tr></thead><tbody>' +
          advs
            .map(function (a) {
              return (
                '<tr><td><b>' +
                esc(a.employeeName) +
                '</b></td><td>' +
                rs(a.amount) +
                '</td><td>' +
                rs(a.remaining != null ? a.remaining : a.amount) +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div>'
        : '<div class="sr-empty" style="padding:16px">No advances</div>') +
      '</div>' +
      '<div><div style="font-weight:700;font-size:13px;margin-bottom:8px">Recent payslips</div>' +
      (pays.length
        ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>Staff</th><th>Month</th><th>Net</th></tr></thead><tbody>' +
          pays
            .map(function (p) {
              return (
                '<tr><td><b>' +
                esc(p.employeeName) +
                '</b></td><td>' +
                esc(p.month) +
                '</td><td class="td-strong">' +
                rs(p.net) +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div>'
        : '<div class="sr-empty" style="padding:16px">No payments yet</div>') +
      '</div></div></div>';

    wrap.querySelector('#hr-leave').onclick = function () {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
      openLeaveModal();
    };
    wrap.querySelector('#hr-adv').onclick = function () {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
      openAdvanceModal();
    };
    wrap.querySelector('#hr-pay').onclick = function () {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
      openSalaryPayModal();
    };
    wrap.querySelectorAll('.hr-lv-ok').forEach(function (b) {
      b.onclick = function () {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
        setLeaveStatus(b.dataset.id, 'approved');
      };
    });
    wrap.querySelectorAll('.hr-lv-no').forEach(function (b) {
      b.onclick = function () {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
        setLeaveStatus(b.dataset.id, 'rejected');
      };
    });
  }

  global.RSHR = {
    openLeaveModal: openLeaveModal,
    openAdvanceModal: openAdvanceModal,
    openSalaryPayModal: openSalaryPayModal,
    renderHrPanels: renderHrPanels,
    listLeaves: listLeaves,
    listAdvances: listAdvances,
  };

  document.addEventListener('rs:ready', function () {
    setTimeout(renderHrPanels, 400);
  });
  document.addEventListener('rs:render-employees', function () {
    setTimeout(renderHrPanels, 100);
  });
})(typeof window !== 'undefined' ? window : globalThis);
