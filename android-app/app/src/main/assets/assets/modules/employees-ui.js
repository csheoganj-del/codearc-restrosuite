/* ============================================================
   RestroSuite — Employees UI (Wave 10 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
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
    if (global.RS && typeof RS.initials === 'function') return RS.initials(n);
    return String(n || '')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function renderEmployees() {
    const EMPLOYEES = getEmployees();
    const avatarColors_ = avatarColors();
  const totalStaff = EMPLOYEES.length;
  const onShift = EMPLOYEES.filter(e => e.shift && e.shift !== 'Off').length;
  let payrollSum = 0;
  EMPLOYEES.forEach(e => {
    if (e.payroll) {
      const num = parseFloat(String(e.payroll).replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) payrollSum += num;
    }
  });

  const empTab = document.getElementById('employees-tab');
  if (empTab) {
    const svElements = empTab.querySelectorAll('.stat-row .stat-card .sv');
    if (svElements.length >= 4) {
      svElements[0].textContent = totalStaff;
      svElements[1].textContent = onShift;
      svElements[2].textContent = payrollSum > 0 ? rs(payrollSum) : '₹0';
      svElements[3].textContent = totalStaff > 0 ? '100%' : '0%';
    }
  }

  // Dispatch custom event to notify other modules
  document.dispatchEvent(new CustomEvent('rs:render-employees'));

  // Role definitions for edit modal (key -> { label, color, icon, tabs description })
  const ROLE_DEFS = [
    { key:'owner',     label:'Owner',             color:'#FF4F00', icon:'fa-crown',        desc:'Full access to all tabs' },
    { key:'manager',   label:'Manager',            color:'#7c3aed', icon:'fa-user-tie',     desc:'All ops tabs -- no super-admin' },
    { key:'cashier',   label:'Cashier',            color:'#0891b2', icon:'fa-cash-register',desc:'POS · Floor · Bills · Customers' },
    { key:'waiter',    label:'Waiter',             color:'#059669', icon:'fa-utensils',     desc:'POS · Floor · Kitchen Display' },
    { key:'captain',   label:'Captain',            color:'#2563eb', icon:'fa-star',         desc:'POS · Floor · KDS · QR Orders' },
    { key:'kitchen',   label:'Kitchen Staff',      color:'#dc2626', icon:'fa-fire-burner',  desc:'Kitchen Display only' },
    { key:'inventory', label:'Inventory Manager',  color:'#b45309', icon:'fa-boxes-stacked',desc:'Inventory · Menu Editor · Reports' },
  ];

  async function openEditRoleModal(empIndex) {
    const emp = EMPLOYEES[empIndex];
    if (!emp) return;
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
          if (!checked) return;
          const chosen = ROLE_DEFS.find(r=>r.key===checked.value);
          if (!chosen) return;
          EMPLOYEES[empIndex].role = chosen.label;
          EMPLOYEES[empIndex].roleKey = chosen.key;
          EMPLOYEES[empIndex].rc = 'r-'+chosen.key;
          try { await RS_DB.save('employees', EMPLOYEES[empIndex]); } catch(e) { console.warn('Role save failed',e); }
          RSModal.close();
          renderEmployees();
          toast(`${emp.name} is now ${chosen.label}`,'fa-user-check');
        };
      }
    });
  }

  const grid = $('#emp-grid');
  if (!grid) return;

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
      addBtn.onclick = () => {
        const headerAdd = document.querySelector('#employees-tab .btn-primary, #employees-tab [data-action="add-employee"], #btn-add-employee');
        if (headerAdd) headerAdd.click();
        else if (typeof window.openAddEmployeeModal === 'function') window.openAddEmployeeModal();
        else toast('Use the Add employee button in the Employees header', 'fa-user-plus');
      };
    }
    const loginBtn = grid.querySelector('#emp-goto-logins');
    if (loginBtn) {
      loginBtn.onclick = () => {
        const seg = document.querySelector('#employees-tab .seg button');
        const loginSeg = Array.from(document.querySelectorAll('#employees-tab .seg button'))
          .find(b => /login/i.test(b.textContent || ''));
        if (loginSeg) loginSeg.click();
        else toast('Open the Logins sub-tab under Employees', 'fa-key');
      };
    }

    // Load staff users and offer one-click import into employee directory
    (async () => {
      try {
        if (!window.RS_API || !RS_API.staffUsers) return;
        const res = await RS_API.staffUsers({ action: 'list_users' });
        const users = (res && res.users) || [];
        if (!users.length) return;
        const importBtn = grid.querySelector('#emp-import-staff');
        const soft = grid.querySelector('#emp-staff-softlink');
        if (!importBtn || !soft) return;
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
                <div class="emp-av" style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:${avatarColors_[i % avatarColors.length]}">${_e(initials(name))}</div>
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
            if (window.RS && typeof RS.save === 'function') await RS.save('employees');
            else if (window.RS_DB && RS_DB.put) await RS_DB.put('employees', emp.id, emp);
          } catch (e) {
            console.warn('Employee import save failed', e);
          }
          if (window.RS) RS.EMPLOYEES = EMPLOYEES.slice();
          return emp;
        }

        soft.querySelectorAll('.emp-import-one').forEach(btn => {
          btn.onclick = async () => {
            const u = users[+btn.dataset.idx];
            if (!u) return;
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
            if (!already) await importStaffUser(u);
          }
          toast(`Imported ${users.length} staff into employees`, 'fa-users');
          renderEmployees();
        };
      } catch (e) {
        console.warn('Staff soft-link load failed', e);
      }
    })();
    return;
  }

  grid.innerHTML = EMPLOYEES.map((e,i)=>`
    <div class="emp-card">
      <div class="emp-top"><div class="emp-av" style="background:${avatarColors_[i%avatarColors_.length]}">${_e(initials(e.name))}</div><div style="flex:1"><div class="en">${_e(e.name)}</div><div class="ee">${_e(e.email)}</div></div></div>
      <div style="margin-bottom:14px"><span class="role-tag ${_e(e.rc)}">${_e(e.role)}</span> <span class="pill" style="padding:3px 9px;font-size:11px"><i class="fa-solid fa-clock" style="font-size:9px"></i> ${_e(e.shift)}</span></div>
      <div class="emp-stats"><div class="es"><div class="esv">${_e(e.sales)}</div><div class="esl">Sales (30d)</div></div><div class="es"><div class="esv">${_e(e.orders)}</div><div class="esl">Orders</div></div></div>
      <div class="emp-actions"><button class="btn btn-ghost btn-sm edit-role-btn" data-idx="${i}" style="flex:1" aria-label="Edit role for ${_e(e.name)}"><i class="fa-solid fa-pen"></i> Edit role</button><button class="icon-act" title="Reset PIN" aria-label="Reset PIN for ${_e(e.name)}"><i class="fa-solid fa-key"></i></button><button class="icon-act danger" title="Remove" aria-label="Remove ${_e(e.name)}"><i class="fa-solid fa-user-minus"></i></button></div>
    </div>`).join('');
  $$('#emp-grid .edit-role-btn').forEach(b=>b.addEventListener('click', () => openEditRoleModal(+b.dataset.idx)));
  }

  global.RSEmployeesUI = { renderEmployees };
  function attach() {
    if (!global.RS) return;
    global.RS.renderEmployees = renderEmployees;
  }
  if (global.RS) attach();
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
