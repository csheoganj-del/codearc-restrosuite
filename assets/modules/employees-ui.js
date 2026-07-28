/* ============================================================
   RestroSuite — Employees UI (Wave 10 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel, r) {
    return (r || document).querySelector(sel);
  }
  function $$(sel, r) {
    return Array.from((r || document).querySelectorAll(sel));
  }
  function getEmployees() {
    return (global.RS && Array.isArray(RS.EMPLOYEES) ? RS.EMPLOYEES : []) || [];
  }
  function avatarColors() {
    return (global.RS && RS.avatarColors) || ['#FF4F00', '#5B6C8F', '#2A9B8F', '#1F8A5B', '#C47B16'];
  }
  function initials(n) {
    if (global.RS && typeof RS.initials === 'function') {return RS.initials(n);}
    return String(n || '')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  // Module-level role catalog (must NOT be nested inside renderEmployees —
  // openAddEmployeeModal is exported at load time and must stay in scope).
  const ROLE_DEFS = [
    { key: 'owner', label: 'Owner', color: '#FF4F00', icon: 'fa-crown', desc: 'Full access to all tabs' },
    { key: 'manager', label: 'Manager', color: '#7c3aed', icon: 'fa-user-tie', desc: 'All ops tabs -- no super-admin' },
    { key: 'cashier', label: 'Cashier', color: '#0891b2', icon: 'fa-cash-register', desc: 'POS · Floor · Bills · Customers' },
    { key: 'waiter', label: 'Waiter', color: '#059669', icon: 'fa-utensils', desc: 'POS · Floor · Kitchen Display' },
    { key: 'captain', label: 'Captain', color: '#2563eb', icon: 'fa-star', desc: 'POS · Floor · KDS · QR Orders' },
    { key: 'kitchen', label: 'Kitchen Staff', color: '#dc2626', icon: 'fa-fire-burner', desc: 'Kitchen Display only' },
    { key: 'inventory', label: 'Inventory Manager', color: '#b45309', icon: 'fa-boxes-stacked', desc: 'Inventory · Menu Editor · Reports' },
  ];

  async function openAddEmployeeModal() {
    if (!window.RSModal) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('Modal unavailable — try again', 'fa-circle-exclamation');
      return;
    }
    const EMPLOYEES = getEmployees();
    const roleOpts = ROLE_DEFS.map(
      (r) => `<option value="${r.key}">${_e(r.label)}</option>`
    ).join('');
    RSModal.open({
      title: 'Add team member',
      sub: 'Directory entry for roster · payroll · roles',
      icon: 'fa-user-plus',
      size: 'sm',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label class="fl">Full name</label>
            <input class="form-input" id="emp-new-name" placeholder="e.g. Priya Sharma" autocomplete="name">
          </div>
          <div>
            <label class="fl">Email / login hint</label>
            <input class="form-input" id="emp-new-email" type="email" placeholder="optional">
          </div>
          <div>
            <label class="fl">WhatsApp / mobile</label>
            <input class="form-input" id="emp-new-phone" type="tel" placeholder="91XXXXXXXXXX for pay/leave alerts">
          </div>
          <div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label class="fl">Role</label>
              <select class="form-input" id="emp-new-role">${roleOpts}</select>
            </div>
            <div>
              <label class="fl">Shift</label>
              <select class="form-input" id="emp-new-shift">
                <option value="Day">Day</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
                <option value="Off">Off</option>
              </select>
            </div>
          </div>
          <div>
            <label class="fl">Monthly payroll (optional)</label>
            <input class="form-input" id="emp-new-pay" type="number" min="0" step="100" placeholder="e.g. 18000">
          </div>
          <p style="font-size:12px;color:var(--text-soft);margin:0;line-height:1.4">
            This adds them to the <b>employee directory</b>. Create a <b>Staff login</b> separately if they need dashboard access.
          </p>
        </div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
             <button type="button" class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-user-plus"></i> Add member</button>`,
      onMount(modal, close) {
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-ok]').onclick = async () => {
          const name = (modal.querySelector('#emp-new-name').value || '').trim();
          if (!name) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Enter a name', 'fa-circle-exclamation');
            modal.querySelector('#emp-new-name').focus();
            return;
          }
          const roleKey = modal.querySelector('#emp-new-role').value || 'waiter';
          const chosen = ROLE_DEFS.find((r) => r.key === roleKey) || ROLE_DEFS[3];
          const shift = modal.querySelector('#emp-new-shift').value || 'Day';
          const email = (modal.querySelector('#emp-new-email').value || '').trim();
          const phone = String((modal.querySelector('#emp-new-phone') || {}).value || '').replace(/\D/g, '');
          const payRaw = modal.querySelector('#emp-new-pay').value;
          const emp = {
            id: 'emp-' + Date.now(),
            name,
            email: email || '',
            phone: phone || '',
            whatsapp: phone || '',
            role: chosen.label,
            roleKey: chosen.key,
            rc: 'r-' + chosen.key,
            shift,
            sales: '—',
            orders: '—',
            payroll: payRaw ? String(payRaw) : '',
          };
          EMPLOYEES.push(emp);
          try {
            if (window.RS && typeof RS.save === 'function') {await RS.save('employees');}
            else if (window.RS_DB && RS_DB.put) {await RS_DB.put('employees', emp.id, emp);}
            if (window.RS) {RS.EMPLOYEES = EMPLOYEES.slice();}
          } catch (e) {
            console.warn('Add employee save failed', e);
            toast('Saved locally — cloud sync may retry', 'fa-cloud');
          }
          close();
          try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
          toast(name + ' added to team', 'fa-user-check');
          renderEmployees();
        };
      },
    });
  }

  global.openAddEmployeeModal = openAddEmployeeModal;

  function renderEmployees() {
    const EMPLOYEES = getEmployees();
    const avatarColors_ = avatarColors();
  const totalStaff = EMPLOYEES.length;
  const onShift = EMPLOYEES.filter(e => e.shift && e.shift !== 'Off').length;
  let payrollSum = 0;
  EMPLOYEES.forEach(e => {
    if (e.payroll) {
      const num = parseFloat(String(e.payroll).replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) {payrollSum += num;}
    }
  });

  const empTab = document.getElementById('employees-tab');
  if (empTab) {
    const svElements = empTab.querySelectorAll('.stat-row .stat-card .sv');
    // Attendance % = on shift / total (honest, not fake 100%)
    const attendancePct = totalStaff > 0 ? Math.round((onShift / totalStaff) * 100) : 0;
    if (svElements.length >= 4) {
      svElements[0].textContent = totalStaff;
      svElements[1].textContent = onShift;
      svElements[2].textContent = payrollSum > 0 ? rs(payrollSum) : '₹0';
      svElements[3].textContent = attendancePct + '%';
    }
  }

  // Dispatch custom event to notify other modules
  document.dispatchEvent(new CustomEvent('rs:render-employees'));

  async function openEditRoleModal(empIndex) {
    const emp = EMPLOYEES[empIndex];
    if (!emp) {return;}
    const currentKey = (emp.roleKey || emp.role || '').toLowerCase();
    const body = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--text-soft)">
        Choosing a role controls which tabs <b>${_e(emp.name)}</b> can see after login.
      </div>
      <div style="display:flex;flex-direction:column;gap:8px" id="role-picker">
        ${ROLE_DEFS.map(r=>`
          <label style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;border:1px solid var(--stroke-2);cursor:pointer;background:var(--glass);transition:var(--t)" class="role-opt ${currentKey===r.key?'selected':''}">
            <input type="radio" name="emp-role" value="${r.key}" ${currentKey===r.key?'checked':''} style="display:none">
            <span style="width:34px;height:34px;border-radius:50%;background:${r.color}22;display:grid;place-items:center;flex-shrink:0">
              <i class="fa-solid ${r.icon}" style="color:${r.color};font-size:14px"></i>
            </span>
            <div style="flex:1">
              <div style="font-weight:700;font-size:14px">${r.label}</div>
              <div style="font-size:12px;color:var(--text-mute)">${r.desc}</div>
            </div>
            <i class="fa-solid fa-circle-check" style="color:${r.color};font-size:16px;opacity:${currentKey===r.key?1:0};transition:var(--t)" class="role-chk"></i>
          </label>`).join('')}
      </div>`;
    if (!window.RSModal) {
      const pick = prompt(`Role for ${emp.name}:\n${ROLE_DEFS.map((r,i)=>`${i+1}. ${r.label} -- ${r.desc}`).join('\n')}\n\nEnter number:`);
      const idx = parseInt(pick,10)-1;
      if (idx>=0 && idx<ROLE_DEFS.length) {
        const chosen = ROLE_DEFS[idx];
        EMPLOYEES[empIndex].role = chosen.label;
        EMPLOYEES[empIndex].roleKey = chosen.key;
        EMPLOYEES[empIndex].rc = 'r-'+chosen.key;
        await RS_DB.save('employees', EMPLOYEES[empIndex]);
        renderEmployees();
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast(`${emp.name} -> ${chosen.label}`,'fa-user-check');
      }
      return;
    }
    const modal = RSModal.open({
      title: `Set role -- ${emp.name}`,
      icon: 'fa-user-gear',
      body,
      foot: `<button class="btn btn-ghost" id="role-cancel">Cancel</button>
             <button class="btn btn-primary" id="role-save"><i class="fa-solid fa-check"></i> Save role</button>`,
      onOpen: (el) => {
        // Style selected state on click
        el.querySelectorAll('.role-opt').forEach(opt => {
          opt.addEventListener('click', () => {
            el.querySelectorAll('.role-opt').forEach(o => {
              o.style.borderColor=''; o.style.background='var(--glass)';
              o.querySelector('.fa-circle-check').style.opacity='0';
            });
            opt.style.borderColor='var(--orange)';
            opt.style.background='var(--orange-tint)';
            opt.querySelector('.fa-circle-check').style.opacity='1';
            opt.querySelector('input').checked=true;
          });
        });
        // Pre-highlight current
        el.querySelectorAll('.role-opt').forEach(opt => {
          if (opt.querySelector('input').checked) {
            opt.style.borderColor='var(--orange)';
            opt.style.background='var(--orange-tint)';
            opt.querySelector('.fa-circle-check').style.opacity='1';
          }
        });
        el.querySelector('#role-cancel').onclick = () => RSModal.close();
        el.querySelector('#role-save').onclick = async () => {
          const checked = el.querySelector('input[name="emp-role"]:checked');
          if (!checked) {return;}
          const chosen = ROLE_DEFS.find(r=>r.key===checked.value);
          if (!chosen) {return;}
          EMPLOYEES[empIndex].role = chosen.label;
          EMPLOYEES[empIndex].roleKey = chosen.key;
          EMPLOYEES[empIndex].rc = 'r-'+chosen.key;
          try { await RS_DB.save('employees', EMPLOYEES[empIndex]); } catch(e) { console.warn('Role save failed',e); }
          RSModal.close();
          renderEmployees();
          try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
          toast(`${emp.name} is now ${chosen.label}`,'fa-user-check');
        };
      }
    });
  }

  // Wire header Add button (dashboard.html)
  (function wireHeaderAdd() {
    const tab = document.getElementById('employees-tab');
    if (!tab) {return;}
    let btn = document.getElementById('btn-add-employee');
    if (!btn) {
      btn = tab.querySelector('.toolbar-row .btn-primary, .btn.btn-primary.btn-sm');
      if (btn && !btn.id) {btn.id = 'btn-add-employee';}
    }
    if (btn && btn.dataset.rsEmpAddBound !== '1') {
      btn.dataset.rsEmpAddBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
        openAddEmployeeModal();
      });
    }
  })();

  const grid = $('#emp-grid');
  if (!grid) {return;}

  let empView =
    global.RSViewMode && RSViewMode.get
      ? RSViewMode.get('employees', 'list')
      : 'list';

  // Toolbar view toggle above the grid (once)
  (function ensureEmpViewToggle() {
    const tab = document.getElementById('employees-tab');
    if (!tab) {return;}
    let bar = tab.querySelector('.emp-view-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'emp-view-bar';
      bar.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:0 0 12px;';
      const host = grid.parentElement;
      if (host) {host.insertBefore(bar, grid);}
      else {tab.insertBefore(bar, grid);}
    }
    if (global.RSViewMode && RSViewMode.toggleHtml) {
      bar.innerHTML = RSViewMode.toggleHtml('employees', empView);
      empView = RSViewMode.wire(bar, 'employees', function (m) {
        empView = m;
        renderEmployees();
      }, 'list');
    }
  })();

  if (EMPLOYEES.length === 0) {
    // Soft-link: staff login accounts exist but employee directory is empty
    grid.innerHTML = `
      <div class="emp-empty-state" style="grid-column:1/-1;padding:36px 22px;text-align:center;border:1.5px dashed var(--stroke);border-radius:var(--r-md);background:var(--panel)">
        <i class="fa-solid fa-users" style="font-size:36px;color:var(--text-mute);margin-bottom:12px;display:block"></i>
        <h3 style="margin:0 0 6px;font-size:16px">No employees in the directory yet</h3>
        <p style="margin:0 auto 16px;max-width:420px;font-size:13px;color:var(--text-soft);line-height:1.55">
          Add team members here for roster, attendance and payroll — or import people who already have staff login accounts.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:14px">
          <button type="button" class="btn btn-primary btn-sm" id="emp-add-from-empty"><i class="fa-solid fa-user-plus"></i> Add employee</button>
          <button type="button" class="btn btn-ghost btn-sm" id="emp-goto-logins"><i class="fa-solid fa-key"></i> Staff logins</button>
          <button type="button" class="btn btn-ghost btn-sm" id="emp-import-staff" style="display:none"><i class="fa-solid fa-link"></i> Import from staff logins</button>
        </div>
        <div id="emp-staff-softlink" style="display:none;text-align:left;max-width:520px;margin:0 auto"></div>
      </div>`;

    const addBtn = grid.querySelector('#emp-add-from-empty');
    if (addBtn) {
      addBtn.onclick = () => { try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {} openAddEmployeeModal(); };
    }
    const loginBtn = grid.querySelector('#emp-goto-logins');
    if (loginBtn) {
      loginBtn.onclick = () => {
        const seg = document.querySelector('#employees-tab .seg button');
        const loginSeg = Array.from(document.querySelectorAll('#employees-tab .seg button'))
          .find(b => /login/i.test(b.textContent || ''));
        if (loginSeg) {loginSeg.click();}
        else {toast('Open the Logins sub-tab under Employees', 'fa-key');}
      };
    }

    // Load staff users and offer one-click import into employee directory
    (async () => {
      try {
        if (!window.RS_API || !RS_API.staffUsers) {return;}
        const res = await RS_API.staffUsers({ action: 'list_users' });
        const users = (res && res.users) || [];
        if (!users.length) {return;}
        const importBtn = grid.querySelector('#emp-import-staff');
        const soft = grid.querySelector('#emp-staff-softlink');
        if (!importBtn || !soft) {return;}
        importBtn.style.display = '';
        soft.style.display = '';
        soft.innerHTML = `
          <div style="font-size:12px;color:var(--text-mute);margin-bottom:8px;font-weight:600">
            ${users.length} staff login account${users.length === 1 ? '' : 's'} found — not yet in the employee directory:
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${users.slice(0, 12).map((u, i) => {
              const name = u.display_name || u.username || 'Staff';
              const role = u.role || 'staff';
              return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--stroke);border-radius:10px;background:var(--glass)">
                <div class="emp-av" style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:${avatarColors_[i % avatarColors_.length]}">${_e(initials(name))}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:700;font-size:13.5px">${_e(name)}</div>
                  <div style="font-size:11.5px;color:var(--text-mute)">${_e(u.username || '')} · ${_e(role)}</div>
                </div>
                <button type="button" class="btn btn-ghost btn-sm emp-import-one" data-idx="${i}" style="flex-shrink:0">Add</button>
              </div>`;
            }).join('')}
          </div>`;

        const roleLabel = (key) => {
          const map = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter', captain: 'Captain', kitchen: 'Kitchen Staff', inventory: 'Inventory Manager' };
          return map[String(key || '').toLowerCase()] || (key ? String(key).replace(/\b\w/g, c => c.toUpperCase()) : 'Staff');
        };

        async function importStaffUser(u) {
          const name = (u.display_name || u.username || 'Staff').trim();
          const roleKey = String(u.role || 'waiter').toLowerCase();
          const emp = {
            id: 'emp-staff-' + (u.id || Date.now()),
            name,
            email: u.email || (u.username ? u.username + '@staff.local' : ''),
            role: roleLabel(roleKey),
            roleKey,
            rc: 'r-' + roleKey,
            shift: 'Day',
            sales: '—',
            orders: '—',
            payroll: '',
            staffUserId: u.id || null,
          };
          EMPLOYEES.push(emp);
          try {
            if (window.RS && typeof RS.save === 'function') {await RS.save('employees');}
            else if (window.RS_DB && RS_DB.put) {await RS_DB.put('employees', emp.id, emp);}
          } catch (e) {
            console.warn('Employee import save failed', e);
          }
          if (window.RS) {RS.EMPLOYEES = EMPLOYEES.slice();}
          return emp;
        }

        soft.querySelectorAll('.emp-import-one').forEach(btn => {
          btn.onclick = async () => {
            const u = users[+btn.dataset.idx];
            if (!u) {return;}
            btn.disabled = true;
            await importStaffUser(u);
            toast((u.display_name || u.username) + ' added to employees', 'fa-user-check');
            renderEmployees();
          };
        });

        importBtn.onclick = async () => {
          importBtn.disabled = true;
          importBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing…';
          for (const u of users) {
            const already = EMPLOYEES.some(e =>
              e.staffUserId === u.id
              || (e.name && u.display_name && e.name.toLowerCase() === String(u.display_name).toLowerCase())
            );
            if (!already) {await importStaffUser(u);}
          }
          try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
          toast(`Imported ${users.length} staff into employees`, 'fa-users');
          renderEmployees();
        };
      } catch (e) {
        console.warn('Staff soft-link load failed', e);
      }
    })();
    return;
  }

  if (empView === 'list') {
    grid.classList.add('emp-grid-list');
    grid.classList.remove('emp-grid');
    grid.style.display = 'block';
    grid.innerHTML = `
      <div class="rs-line-list emp-line-list">
        <div class="rs-line-head emp-line-head">
          <span>Team member</span>
          <span>Role</span>
          <span>Shift</span>
          <span class="rl-num">Sales</span>
          <span class="rl-num">Orders</span>
          <span>Payroll</span>
          <span class="rl-acts">Actions</span>
        </div>
        ${EMPLOYEES.map((e, i) => {
          const inactive = e.active === false || String(e.status || '').toLowerCase() === 'inactive';
          return `
        <div class="rs-line-row emp-line-row${inactive ? ' rs10-deactivated' : ''}" data-idx="${i}" data-id="${_e(e.id || '')}" data-name="${_e(e.name || '')}" data-staff-user-id="${_e(e.staffUserId || '')}" style="${inactive ? 'opacity:.62' : ''}">
          <span class="emp-line-guest">
            <span class="emp-av" style="width:32px;height:32px;border-radius:9px;font-size:11px;background:${avatarColors_[i % avatarColors_.length]}">${_e(initials(e.name))}</span>
            <span>
              <div class="rl-name">${_e(e.name)}${inactive ? ' <span class="pill pill-red" style="padding:1px 7px;font-size:10px;margin-left:4px">Inactive</span>' : ''}</div>
              <div class="rl-mute">${_e(e.email || e.phone || '—')}</div>
            </span>
          </span>
          <span><span class="role-tag ${_e(e.rc || '')}">${_e(e.role || 'Staff')}</span></span>
          <span class="rl-mute"><i class="fa-solid fa-clock" style="font-size:9px;opacity:.6"></i> ${_e(e.shift || '—')}</span>
          <span class="rl-num">${_e(e.sales || '—')}</span>
          <span class="rl-num">${_e(e.orders || '—')}</span>
          <span class="rl-mute">${e.payroll ? rs(parseFloat(String(e.payroll).replace(/[^0-9.]/g, '')) || 0) : '—'}</span>
          <span class="rl-acts">
            <button type="button" class="btn btn-ghost btn-sm edit-role-btn" data-idx="${i}"><i class="fa-solid fa-pen"></i> Role</button>
            <button type="button" class="icon-act emp-toggle-active" data-idx="${i}" title="${inactive ? 'Reactivate login' : 'Deactivate login'}" aria-label="${inactive ? 'Reactivate' : 'Deactivate'} ${_e(e.name)}"><i class="fa-solid ${inactive ? 'fa-user-check' : 'fa-user-slash'}"></i></button>
            <button type="button" class="icon-act emp-reset-pin" data-idx="${i}" title="PIN"><i class="fa-solid fa-key"></i></button>
            <button type="button" class="icon-act danger emp-remove" data-idx="${i}" title="Remove"><i class="fa-solid fa-user-minus"></i></button>
          </span>
        </div>`;
        }).join('')}
      </div>`;
  } else {
    grid.classList.remove('emp-grid-list');
    grid.classList.add('emp-grid');
    grid.style.display = '';
    grid.innerHTML = EMPLOYEES.map((e,i)=>{
      const inactive = e.active === false || String(e.status || '').toLowerCase() === 'inactive';
      return `
    <div class="emp-card${inactive ? ' rs10-deactivated' : ''}" data-id="${_e(e.id || '')}" data-name="${_e(e.name || '')}" data-staff-user-id="${_e(e.staffUserId || '')}" style="${inactive ? 'opacity:.72' : ''}">
      <div class="emp-top"><div class="emp-av" style="background:${avatarColors_[i%avatarColors_.length]}">${_e(initials(e.name))}</div><div style="flex:1"><div class="en">${_e(e.name)}${inactive ? ' · Inactive' : ''}</div><div class="ee">${_e(e.email || '—')}</div></div></div>
      <div style="margin-bottom:14px"><span class="role-tag ${_e(e.rc || '')}">${_e(e.role)}</span> <span class="pill" style="padding:3px 9px;font-size:11px"><i class="fa-solid fa-clock" style="font-size:9px"></i> ${_e(e.shift || '—')}</span></div>
      <div class="emp-stats"><div class="es"><div class="esv">${_e(e.sales || '—')}</div><div class="esl">Sales (30d)</div></div><div class="es"><div class="esv">${_e(e.orders || '—')}</div><div class="esl">Orders</div></div></div>
      <div class="emp-actions">
        <button type="button" class="btn btn-ghost btn-sm edit-role-btn" data-idx="${i}" style="flex:1" aria-label="Edit role for ${_e(e.name)}"><i class="fa-solid fa-pen"></i> Edit role</button>
        <button type="button" class="icon-act emp-toggle-active" data-idx="${i}" title="${inactive ? 'Reactivate' : 'Deactivate login'}" aria-label="${inactive ? 'Reactivate' : 'Deactivate'} ${_e(e.name)}"><i class="fa-solid ${inactive ? 'fa-user-check' : 'fa-user-slash'}"></i></button>
        <button type="button" class="icon-act emp-reset-pin" data-idx="${i}" title="Set / reset staff PIN" aria-label="Reset PIN for ${_e(e.name)}"><i class="fa-solid fa-key"></i></button>
        <button type="button" class="icon-act danger emp-remove" data-idx="${i}" title="Remove from directory" aria-label="Remove ${_e(e.name)}"><i class="fa-solid fa-user-minus"></i></button>
      </div>
    </div>`;
    }).join('');
  }
  $$('#emp-grid .edit-role-btn').forEach((b) =>
    b.addEventListener('click', () => openEditRoleModal(+b.dataset.idx))
  );

  async function revokeLinkedStaffLogin(emp, suspend) {
    if (!window.RS_API || typeof RS_API.staffUsers !== 'function') {return;}
    let staffId = emp.staffUserId || null;
    // Match by username/email/display name when staffUserId missing
    if (!staffId) {
      try {
        const res = await RS_API.staffUsers({ action: 'list_users' });
        const users = (res && res.users) || [];
        const name = String(emp.name || '').toLowerCase();
        const email = String(emp.email || '').toLowerCase();
        const hit = users.find(
          (u) =>
            (emp.staffUserId && u.id === emp.staffUserId) ||
            (email && String(u.username || '').toLowerCase() === email.split('@')[0]) ||
            (name && String(u.display_name || '').toLowerCase() === name)
        );
        if (hit) {
          staffId = hit.id;
          emp.staffUserId = staffId;
        }
      } catch (_) {}
    }
    if (!staffId) {return;}
    try {
      await RS_API.staffUsers({
        action: 'update_user',
        user_id: staffId,
        status: suspend ? 'suspended' : 'active',
      });
    } catch (e) {
      console.warn('[employees] staff status update', e);
    }
    try {
      await RS_API.staffUsers({ action: 'revoke_user_sessions', user_id: staffId });
    } catch (_) {
      try {
        if (typeof RS_API.data === 'function') {
          await RS_API.data({ operation: 'revoke_user_sessions', userId: staffId });
        }
      } catch (__) {}
    }
  }

  $$('#emp-grid .emp-toggle-active').forEach((b) =>
    b.addEventListener('click', async () => {
      const emp = EMPLOYEES[+b.dataset.idx];
      if (!emp) {return;}
      const inactive = emp.active === false || String(emp.status || '').toLowerCase() === 'inactive';
      if (!inactive) {
        const ok = window.confirm(
          'Deactivate ' +
            emp.name +
            '?\n\n• They cannot use staff login (if linked)\n• Active sessions are revoked\n• Directory row stays for payroll history\n\nYou can reactivate later.'
        );
        if (!ok) {return;}
        emp.active = false;
        emp.status = 'Inactive';
        emp.disabledAt = new Date().toISOString();
        emp.shift = emp.shift === 'Off' ? emp.shift : emp.shift;
        try {
          await revokeLinkedStaffLogin(emp, true);
        } catch (_) {}
        try {
          if (window.RS && typeof RS.save === 'function') {await RS.save('employees');}
          else if (window.RS_DB && RS_DB.put) {await RS_DB.put('employees', emp.id, emp);}
          if (window.RS) {RS.EMPLOYEES = EMPLOYEES.slice();}
        } catch (e) {
          console.warn('Deactivate save failed', e);
        }
        toast(emp.name + ' deactivated · sessions revoked', 'fa-user-slash');
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
      } else {
        const ok = window.confirm('Reactivate ' + emp.name + '? Their staff login will be re-enabled if linked.');
        if (!ok) {return;}
        emp.active = true;
        emp.status = 'Active';
        emp.disabledAt = null;
        try {
          await revokeLinkedStaffLogin(emp, false);
        } catch (_) {}
        try {
          if (window.RS && typeof RS.save === 'function') {await RS.save('employees');}
          else if (window.RS_DB && RS_DB.put) {await RS_DB.put('employees', emp.id, emp);}
          if (window.RS) {RS.EMPLOYEES = EMPLOYEES.slice();}
        } catch (e) {
          console.warn('Reactivate save failed', e);
        }
        toast(emp.name + ' reactivated', 'fa-user-check');
      }
      renderEmployees();
    })
  );

  $$('#emp-grid .emp-reset-pin').forEach((b) =>
    b.addEventListener('click', async () => {
      const emp = EMPLOYEES[+b.dataset.idx];
      if (!emp) {return;}
      const pin = window.prompt('Set a 4–6 digit PIN for ' + emp.name + ' (used at POS if enabled):', emp.pin || '');
      if (pin == null) {return;}
      const cleaned = String(pin).replace(/\D/g, '').slice(0, 6);
      if (cleaned && (cleaned.length < 4 || cleaned.length > 6)) {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
        toast('PIN must be 4–6 digits', 'fa-circle-exclamation');
        return;
      }
      emp.pin = cleaned || '';
      try {
        if (window.RS && typeof RS.save === 'function') {await RS.save('employees');}
        else if (window.RS_DB && RS_DB.put) {await RS_DB.put('employees', emp.id, emp);}
      } catch (e) {
        console.warn('PIN save failed', e);
      }
      try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
      toast(cleaned ? 'PIN updated for ' + emp.name : 'PIN cleared for ' + emp.name, 'fa-key');
    })
  );
  $$('#emp-grid .emp-remove').forEach((b) =>
    b.addEventListener('click', async () => {
      const idx = +b.dataset.idx;
      const emp = EMPLOYEES[idx];
      if (!emp) {return;}
      const ok = window.confirm(
        'Remove ' +
          emp.name +
          ' from the employee directory?\n\nTip: use Deactivate (user-slash icon) if they left the job but you want payroll history. Remove does not delete staff login — suspend that under Logins.'
      );
      if (!ok) {return;}
      const id = emp.id;
      EMPLOYEES.splice(idx, 1);
      try {
        if (window.RS && typeof RS.removeOne === 'function') {await RS.removeOne('employees', id);}
        else if (window.RS_DB && RS_DB.del) {await RS_DB.del('employees', id);}
        else if (window.RS && typeof RS.save === 'function') {await RS.save('employees');}
        if (window.RS) {RS.EMPLOYEES = EMPLOYEES.slice();}
      } catch (e) {
        console.warn('Remove employee failed', e);
      }
      try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
      toast(emp.name + ' removed', 'fa-user-minus');
      renderEmployees();
    })
  );
  }

  global.RSEmployeesUI = { renderEmployees, openAddEmployeeModal };
  function attach() {
    if (!global.RS) {return;}
    global.RS.renderEmployees = renderEmployees;
    global.RS.openAddEmployeeModal = openAddEmployeeModal;
  }
  if (global.RS) {attach();}
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
