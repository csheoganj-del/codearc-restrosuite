/* ============================================================
   RestroSuite — Super-admin console (Wave 9 code-split)
   Tenant table, bulk ops, plan pricing, manage modal
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

let superAdminFilter = 'all';
let superAdminSearch = '';
let superAdminSort = { col: 'joined', dir: 'desc' };
let _cachedTenants = [];
let selectedTenantIds = new Set();
let saasGatewayPollingInterval = null;

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatIncidentTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderIncidentEmpty(title, detail, icon = 'fa-circle-check') {
  return `
    <div class="app-incidents-empty">
      <i class="fa-solid ${icon}"></i>
      <strong>${escHtml(title)}</strong>
      <span>${escHtml(detail)}</span>
    </div>
  `;
}

function saasSnapshotCard(title, value, subtitle, iconClass, filterAttr, isActive = false) {
  const filterData = filterAttr ? `data-filter="${filterAttr}"` : '';
  const activeClass = isActive ? 'active-filter' : '';
  return `
    <div class="saas-snapshot-card ${activeClass}" ${filterData}>
      <div class="saas-snapshot-card-header">
        <span class="saas-snapshot-card-title">${escHtml(title)}</span>
        <i class="${iconClass}" style="color: #FF4F00; font-size: 14px;"></i>
      </div>
      <div>
        <div class="saas-snapshot-card-value">${escHtml(value)}</div>
        <div class="saas-snapshot-card-subtitle">${escHtml(subtitle)}</div>
      </div>
    </div>
  `;
}

function renderPlatformSummary(tenants = []) {
  const target = document.getElementById('saas-platform-summary');
  if (!target) return;
  const total = tenants.length;
  const active = tenants.filter(t => t.status === 'approved' || t.status === 'active').length;
  const pending = tenants.filter(t => t.status === 'pending').length;
  const paidTier = tenants.filter(t => ['growth', 'enterprise'].includes(t.plan_code)).length;
  const risk = tenants.filter(t => ['past_due', 'canceled'].includes(t.subscription_status)).length;
  const conversion = total ? Math.round((paidTier / total) * 100) : 0;
  const totalMrr = tenants.reduce((sum, t) => sum + (Number(t.mrr) || 0), 0);
  const mrrDisplay = totalMrr > 0 ? rs(totalMrr) : '₹0';
  target.innerHTML = [
    saasSnapshotCard('Workspaces', total, `${active} active outlets`, 'fa-solid fa-store', 'all', superAdminFilter === 'all'),
    saasSnapshotCard('Pending Approvals', pending, pending ? 'Requires review' : 'Queue is clear', 'fa-solid fa-user-clock', 'pending', superAdminFilter === 'pending'),
    saasSnapshotCard('Conversion Rate', `${conversion}%`, `${paidTier} paid / ${total} total`, 'fa-solid fa-chart-pie', 'paid', superAdminFilter === 'paid'),
    saasSnapshotCard('At-Risk Accounts', risk, 'Past-due or canceled', 'fa-solid fa-triangle-exclamation', 'risk', superAdminFilter === 'risk'),
    saasSnapshotCard('Platform MRR', mrrDisplay, `${total} tenants tracked`, 'fa-solid fa-indian-rupee-sign', 'mrr', superAdminFilter === 'mrr')
  ].join('');

  target.querySelectorAll('.saas-snapshot-card[data-filter]').forEach(item => {
    item.addEventListener('click', async () => {
      const f = item.getAttribute('data-filter');
      if (f === 'mrr') { openPlanPricingEditor(); return; } // MRR card opens plan pricing
      superAdminFilter = f;
      await renderSuper();
    });
  });
}

const tStatus={active:'t-active',approved:'t-active',trial:'t-trial',pending:'t-trial',suspended:'t-suspended',past_due:'t-suspended',canceled:'t-suspended'};

function getTenantRowId(tenant) {
  return tenant && tenant.id != null ? String(tenant.id) : '';
}

function getSelectedTenants() {
  return _cachedTenants.filter(t => selectedTenantIds.has(getTenantRowId(t)));
}

function pruneTenantSelection() {
  const validIds = new Set(_cachedTenants.map(getTenantRowId).filter(Boolean));
  selectedTenantIds = new Set([...selectedTenantIds].filter(id => validIds.has(id)));
}

function syncTenantSelectAll(visibleTenants = []) {
  const all = document.getElementById('tenant-select-all');
  if (!all) return;
  const visibleIds = visibleTenants.map(getTenantRowId).filter(Boolean);
  const selectedVisible = visibleIds.filter(id => selectedTenantIds.has(id)).length;
  all.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  all.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  all.disabled = visibleIds.length === 0;
}

// Render tenant table from cached data (no network call)
function renderTenantTable() {
  const tbody = $('#tenant-table-body');
  if (!tbody) return;
  pruneTenantSelection();

  let filtered = _cachedTenants.slice();

  // Status filter
  if (superAdminFilter === 'pending') filtered = filtered.filter(t => t.status === 'pending');
  else if (superAdminFilter === 'paid') filtered = filtered.filter(t => ['growth','enterprise'].includes(t.plan_code));
  else if (superAdminFilter === 'risk') filtered = filtered.filter(t => ['past_due','canceled'].includes(t.subscription_status));

  // Text search
  const q = (superAdminSearch || '').toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(t => {
      const fields = [t.name, t.tenant_name, t.slug, t.email, t.phone, t.username, t.plan_code, t.status];
      return fields.some(f => f && String(f).toLowerCase().includes(q));
    });
  }

  // Sort
  const { col, dir } = superAdminSort;
  filtered.sort((a, b) => {
    let va, vb;
    if (col === 'outlet') { va = (a.name || a.tenant_name || '').toLowerCase(); vb = (b.name || b.tenant_name || '').toLowerCase(); }
    else if (col === 'plan') { va = (a.plan_code || '').toLowerCase(); vb = (b.plan_code || '').toLowerCase(); }
    else if (col === 'mrr') { va = Number(a.mrr) || 0; vb = Number(b.mrr) || 0; }
    else if (col === 'outlets') { va = Number(a.outlet_count) || 1; vb = Number(b.outlet_count) || 1; }
    else if (col === 'joined') { va = a.created_at || ''; vb = b.created_at || ''; }
    else if (col === 'status') { va = (a.status || '').toLowerCase(); vb = (b.status || '').toLowerCase(); }
    else if (col === 'renews') { va = a.subscription_current_period_end || ''; vb = b.subscription_current_period_end || ''; }
    else { va = a.created_at || ''; vb = b.created_at || ''; }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  // Update count badge
  const countEl = document.getElementById('tenant-count');
  if (countEl) countEl.textContent = `${filtered.length} of ${_cachedTenants.length}`;

  // Update sort headers
  document.querySelectorAll('th[data-sort-col]').forEach(th => {
    const c = th.getAttribute('data-sort-col');
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (c === col) {
      icon.className = `sort-icon fa-solid ${dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'}`;
      icon.style.color = 'var(--orange)';
    } else {
      icon.className = 'sort-icon fa-solid fa-sort';
      icon.style.color = 'var(--text-mute)';
      icon.style.opacity = '0.4';
    }
  });

  if (filtered.length === 0) {
    syncTenantSelectAll([]);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-mute)"><i class="fa-solid fa-store-slash" style="display:block;margin-bottom:8px;font-size:20px"></i>${q ? `No tenants match "${_e(q)}"` : `No tenants found for filter "${_e(superAdminFilter)}".`}</td></tr>`;
    updateBulkBar();
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const planLabel = t.plan_name || t.plan_code || 'Starter';
    const isChain = ['chain','enterprise'].includes((t.plan_code||'').toLowerCase());
    const isGrowth = (t.plan_code||'').toLowerCase() === 'growth';
    const pillCls = isChain ? 'pill-violet' : isGrowth ? 'pill-orange' : '';
    const statusKey = (t.status || 'active').toLowerCase();
    const statusCls = tStatus[statusKey] || 't-active';
    const statusText = t.status ? (t.status.charAt(0).toUpperCase() + t.status.slice(1).replace(/_/g,' ')) : 'Active';
    const joined = t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-';
    const mrr = t.mrr || 0;
    const name = t.name || t.tenant_name || t.slug || 'Unknown';
    const slug = t.slug || t.tenant_slug || '';
    const tenantId = getTenantRowId(t);
    const selected = tenantId && selectedTenantIds.has(tenantId);
    const isPending = statusKey === 'pending';
    const isSuspended = statusKey === 'suspended';
    const approveBtn = isPending
      ? `<button class="btn btn-sm quick-approve-btn" style="background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.25);padding:3px 9px;font-size:11px;border-radius:6px;cursor:pointer" title="Approve this workspace" data-tid="${_e(t.id||'')}"><i class="fa-solid fa-check"></i> Approve</button>`
      : '';
    const suspendBtn = !isPending
      ? isSuspended
        ? `<button class="btn btn-sm quick-reactivate-btn" style="background:rgba(34,197,94,0.08);color:#16a34a;border:1px solid rgba(34,197,94,0.2);padding:3px 9px;font-size:11px;border-radius:6px;cursor:pointer" title="Reactivate workspace" data-tid="${_e(t.id||'')}"><i class="fa-solid fa-rotate-left"></i> Reactivate</button>`
        : `<button class="btn btn-sm quick-suspend-btn" style="background:rgba(239,68,68,0.06);color:#dc2626;border:1px solid rgba(239,68,68,0.18);padding:3px 9px;font-size:11px;border-radius:6px;cursor:pointer" title="Suspend workspace" data-tid="${_e(t.id||'')}"><i class="fa-solid fa-ban"></i> Suspend</button>`
      : '';
    const dashboardBtn = !isPending && !isSuspended
      ? `<button class="icon-act open-tenant-dashboard-btn" title="Open workspace dashboard" data-tid="${_e(t.id||'')}" style="font-size:13px;color:var(--orange)"><i class="fa-solid fa-arrow-right-to-bracket"></i></button>`
      : '';
    const seedBtn = !isPending && !isSuspended
      ? `<button class="icon-act quick-seed-btn" title="Load demo data (one click)" data-tid="${_e(t.id||'')}" data-tname="${_e(name)}" style="font-size:13px;color:#16a34a"><i class="fa-solid fa-seedling"></i></button>`
      : '';
    // Renews-on (paid-until) cell with colour: red=expired, amber=<=7 days, green=fine.
    const rawEnd = t.subscription_current_period_end;
    let renewsCell;
    if (!rawEnd) {
      renewsCell = '<span style="color:var(--text-mute)">—</span>';
    } else {
      const end = new Date(rawEnd);
      const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000);
      const dateStr = isNaN(end.getTime()) ? '—' : end.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      const color = daysLeft < 0 ? '#dc2626' : (daysLeft <= 7 ? '#d97706' : '#16a34a');
      const label = daysLeft < 0 ? (dateStr + ' (expired)') : (daysLeft <= 7 ? (dateStr + ' (' + daysLeft + 'd)') : dateStr);
      renewsCell = `<span style="color:${color};font-weight:600;white-space:nowrap">${_e(label)}</span>`;
    }
    return `<tr class="${selected ? 'tenant-row-selected' : ''}">
      <td><div class="tenant-outlet-cell"><input type="checkbox" class="tenant-checkbox tenant-row-checkbox" data-tid="${_e(tenantId)}" aria-label="Select ${_e(name)}" ${selected ? 'checked' : ''}><div class="avatar-sm" style="background:${avatarColors[name.length%avatarColors.length]}">${_e(initials(name))}</div><div><b>${_e(name)}</b><div style="font-size:11px;color:var(--text-mute)">${_e(slug)}</div></div></div></td>
      <td><span class="pill ${_e(planLabel.toLowerCase())} ${_e(pillCls)}" style="padding:3px 9px">${_e(planLabel)}</span></td>
      <td class="td-strong">${mrr ? rs(mrr) : '--'}</td>
      <td>${_e(t.outlet_count || 1)}</td>
      <td>${_e(joined)}</td>
      <td><span class="tenant-status ${_e(statusCls)}">${_e(statusText)}</span></td>
      <td>${renewsCell}</td>
      <td>
        <div class="row-actions" style="gap:5px">
          ${approveBtn}
          ${suspendBtn}
          ${seedBtn}
          ${dashboardBtn}
          <button class="icon-act manage-tenant-btn" title="Manage workspace" data-tid="${_e(t.id||'')}" style="font-size:13px"><i class="fa-solid fa-gear"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  syncTenantSelectAll(filtered);
  updateBulkBar();

  tbody.querySelectorAll('.tenant-row-checkbox').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      const tid = cb.getAttribute('data-tid');
      if (!tid) return;
      if (cb.checked) selectedTenantIds.add(tid);
      else selectedTenantIds.delete(tid);
      renderTenantTable();
    });
  });

  // Bind quick-approve buttons
  tbody.querySelectorAll('.quick-approve-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute('data-tid');
      const t = _cachedTenants.find(x => String(x.id) === String(tid));
      if (!t) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'update_tenant', tenant_id: tid, status: 'approved' });
        t.status = 'approved';
        toast(`${t.name || 'Workspace'} approved!`, 'fa-circle-check');
        renderPlatformSummary(_cachedTenants);
        renderTenantTable();
      } catch (err) {
        toast('Approval failed: ' + (err.message || err), 'fa-circle-exclamation');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Approve';
      }
    });
  });

  // One-click demo seed from tenant row (no manage modal required)
  tbody.querySelectorAll('.quick-seed-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute('data-tid');
      const tname = btn.getAttribute('data-tname') || 'workspace';
      if (!tid) return;
      const ok = window.confirm(
        'Load demo menu/inventory/bills into "' + tname + '"?\n\nExisting operational data for this workspace will be reset.'
      );
      if (!ok) return;
      const prev = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'seed_tenant_data', tenant_id: tid });
        toast('Demo data loaded for ' + tname, 'fa-seedling');
        await renderSuper();
      } catch (err) {
        console.error(err);
        toast('Seed failed: ' + (err.message || err), 'fa-circle-exclamation');
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    });
  });

  // Bind suspend buttons
  tbody.querySelectorAll('.quick-suspend-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute('data-tid');
      const t = _cachedTenants.find(x => String(x.id) === String(tid));
      if (!t) return;
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'update_tenant', tenant_id: tid, status: 'suspended',
          username: t.username, plan_code: t.plan_code || 'starter',
          subscription_status: t.subscription_status || 'active',
          allowed_tabs: t.allowed_tabs || [], phone: t.phone || '', email: t.email || '' });
        t.status = 'suspended';
        toast(`${t.name || 'Workspace'} suspended.`, 'fa-ban');
        renderPlatformSummary(_cachedTenants); renderTenantTable(); updateBulkBar();
      } catch (err) {
        toast('Suspend failed: ' + (err.message || err), 'fa-circle-exclamation');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-ban"></i> Suspend';
      }
    });
  });

  // Bind reactivate buttons
  tbody.querySelectorAll('.quick-reactivate-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute('data-tid');
      const t = _cachedTenants.find(x => String(x.id) === String(tid));
      if (!t) return;
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'update_tenant', tenant_id: tid, status: 'approved',
          username: t.username, plan_code: t.plan_code || 'starter',
          subscription_status: t.subscription_status || 'active',
          allowed_tabs: t.allowed_tabs || [], phone: t.phone || '', email: t.email || '' });
        t.status = 'approved';
        toast(`${t.name || 'Workspace'} reactivated!`, 'fa-rotate-left');
        renderPlatformSummary(_cachedTenants); renderTenantTable(); updateBulkBar();
      } catch (err) {
        toast('Reactivate failed: ' + (err.message || err), 'fa-circle-exclamation');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Reactivate';
      }
    });
  });

  // Bind manage buttons
  tbody.querySelectorAll('.open-tenant-dashboard-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tenantId = btn.getAttribute('data-tid');
      const tenant = _cachedTenants.find(t => String(t.id) === String(tenantId));
      openTenantDashboard(tenant, btn);
    });
  });

  tbody.querySelectorAll('.manage-tenant-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tenantId = btn.getAttribute('data-tid');
      const tenant = _cachedTenants.find(t => String(t.id) === String(tenantId));
      if (tenant) openTenantManageModal(tenant);
      else toast('Tenant details not found.', 'fa-circle-exclamation');
    });
  });
}

let _superPollTimer = null;
async function pollSuperTenants() {
  try {
    if (!window.RS_API || !RS_API.configured) return;
    const body = document.getElementById('tenant-table-body');
    if (!body || body.offsetParent === null) return;
    if (document.visibilityState !== 'visible') return;
    const out = await RS_API.admin({ action: 'list_tenants' }).catch(() => null);
    if (out && Array.isArray(out.tenants)) {
      _cachedTenants = out.tenants;
      renderPlatformSummary(_cachedTenants);
      renderTenantTable();
    }
  } catch (e) { /* quiet */ }
}
function startSuperPolling() {
  if (_superPollTimer) return;
  _superPollTimer = setInterval(pollSuperTenants, 30000);
}

async function renderSuper() {
  const tbody = $('#tenant-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-mute)"><i class="fa-solid fa-spinner fa-spin"></i> Loading client workspace registry...</td></tr>';
  renderPlatformSummary([]);
  try {
    if (window.RS_API) {
      // ── Wait for Supabase config to load (async race condition fix) ──
      // /api/config is fetched async at boot; renderSuper fires after 300ms
      // which can be faster than the network round-trip. Poll up to 4s.
      if (!RS_API.configured) {
        await new Promise(resolve => {
          let tries = 0;
          const poll = setInterval(() => {
            if (RS_API.configured || ++tries >= 40) { clearInterval(poll); resolve(); }
          }, 100);
        });
      }
      // If still not configured after waiting, session is genuinely missing
      if (!RS_API.configured) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-mute)"><i class="fa-solid fa-circle-exclamation" style="display:block;margin-bottom:8px;font-size:20px;color:#F59E0B"></i>Supabase not reachable — check your internet connection and reload the page.</td></tr>';
        return;
      }
      const out = await Promise.race([
        RS_API.admin({ action: 'list_tenants' }).catch(err => ({ error: err && err.message ? err.message : String(err), tenants: [] })),
        new Promise(resolve => setTimeout(() => resolve({ error: 'Tenant registry request timed out.', tenants: [] }), 10000))
      ]);
      if (out && out.error) console.warn('Superadmin tenant registry unavailable:', out.error);
      if (out && Array.isArray(out.tenants)) _cachedTenants = out.tenants;
      // If we got an auth error, show a helpful message with retry
      if (out && out.error && (out.error.includes('not configured') || out.error.includes('expired') || out.error.includes('401'))) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-mute)"><i class="fa-solid fa-rotate-right" style="display:block;margin-bottom:8px;font-size:20px;color:#F59E0B"></i>Session expired — <button onclick="location.reload()" style="background:none;border:none;color:var(--orange);cursor:pointer;font-weight:600;text-decoration:underline">reload</button> or <button onclick="RS_API.logout();location.href=\'login\'" style="background:none;border:none;color:var(--orange);cursor:pointer;font-weight:600;text-decoration:underline">sign in again</button>.</td></tr>';
        return;
      }
    }
    renderPlatformSummary(_cachedTenants);
    renderTenantTable();
    bindTenantBulkControls();
    updateBulkBar();
    startSuperPolling();

    // Wire sort headers (only once)
    document.querySelectorAll('th[data-sort-col]').forEach(th => {
      if (th.dataset.sortBound) return;
      th.dataset.sortBound = '1';
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const c = th.getAttribute('data-sort-col');
        if (superAdminSort.col === c) superAdminSort.dir = superAdminSort.dir === 'asc' ? 'desc' : 'asc';
        else { superAdminSort.col = c; superAdminSort.dir = 'asc'; }
        renderTenantTable();
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--red)"><i class="fa-solid fa-circle-exclamation" style="display:block;margin-bottom:8px"></i>${_e(err.message || 'Failed to load tenants')}</td></tr>`;
  }
};

// ── Bulk Actions ────────────────────────────────────────────────────────
function updateBulkBar() {
  const bar = document.getElementById('sa-bulk-bar');
  const label = document.getElementById('sa-bulk-label');
  const icon = document.getElementById('sa-bulk-icon');
  const selectionActions = document.getElementById('sa-selection-actions');
  const approveBtn = document.getElementById('sa-bulk-approve-btn');
  if (!bar || !label) return;
  const selected = getSelectedTenants();
  const pending = _cachedTenants.filter(t => t.status === 'pending');
  if (selected.length > 0) {
    bar.style.display = 'flex';
    bar.style.background = 'rgba(239,68,68,0.07)';
    bar.style.borderColor = 'rgba(239,68,68,0.22)';
    label.style.color = '#dc2626';
    label.textContent = `${selected.length} client${selected.length > 1 ? 's' : ''} selected`;
    if (icon) {
      icon.className = 'fa-solid fa-trash-can';
      icon.style.color = '#dc2626';
    }
    if (selectionActions) selectionActions.style.display = 'flex';
    if (approveBtn) approveBtn.style.display = 'none';
  } else if (pending.length > 0) {
    bar.style.display = 'flex';
    bar.style.background = 'rgba(245,158,11,0.08)';
    bar.style.borderColor = 'rgba(245,158,11,0.2)';
    label.style.color = '#b45309';
    label.textContent = `${pending.length} workspace${pending.length > 1 ? 's' : ''} waiting for approval`;
    if (icon) {
      icon.className = 'fa-solid fa-user-clock';
      icon.style.color = '#b45309';
    }
    if (selectionActions) selectionActions.style.display = 'none';
    if (approveBtn) approveBtn.style.display = 'inline-flex';
  } else {
    bar.style.display = 'none';
    if (selectionActions) selectionActions.style.display = 'none';
    if (approveBtn) approveBtn.style.display = 'inline-flex';
  }
}

function bindTenantBulkControls() {
  const selectHead = document.querySelector('.tenant-select-head');
  if (selectHead && !selectHead.dataset.wired) {
    selectHead.dataset.wired = '1';
    selectHead.addEventListener('click', e => e.stopPropagation());
  }
  const selectAll = document.getElementById('tenant-select-all');
  if (selectAll && !selectAll.dataset.wired) {
    selectAll.dataset.wired = '1';
    selectAll.addEventListener('click', e => e.stopPropagation());
    selectAll.addEventListener('change', () => {
      const visibleIds = Array.from(document.querySelectorAll('#tenant-table-body .tenant-row-checkbox'))
        .map(cb => cb.getAttribute('data-tid'))
        .filter(Boolean);
      visibleIds.forEach(id => {
        if (selectAll.checked) selectedTenantIds.add(id);
        else selectedTenantIds.delete(id);
      });
      renderTenantTable();
    });
  }
  const clearBtn = document.getElementById('sa-clear-selection-btn');
  if (clearBtn && !clearBtn.dataset.wired) {
    clearBtn.dataset.wired = '1';
    clearBtn.addEventListener('click', () => {
      selectedTenantIds.clear();
      renderTenantTable();
    });
  }
  const deleteBtn = document.getElementById('sa-bulk-delete-btn');
  if (deleteBtn && !deleteBtn.dataset.wired) {
    deleteBtn.dataset.wired = '1';
    deleteBtn.addEventListener('click', () => bulkDeleteSelectedTenants());
  }
}

async function bulkApproveAllPending() {
  const pending = _cachedTenants.filter(t => t.status === 'pending');
  if (!pending.length) return toast('No pending workspaces to approve.', 'fa-circle-info');
  const btn = document.getElementById('sa-bulk-approve-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving…'; }
  let done = 0, failed = 0;
  for (const t of pending) {
    try {
      await RS_API.admin({ action: 'update_tenant', tenant_id: t.id, status: 'approved',
        username: t.username, plan_code: t.plan_code || 'starter',
        subscription_status: t.subscription_status || 'active',
        allowed_tabs: t.allowed_tabs || [], phone: t.phone || '', email: t.email || '' });
      t.status = 'approved';
      done++;
    } catch(e) { failed++; }
  }
  renderPlatformSummary(_cachedTenants);
  renderTenantTable();
  updateBulkBar();
  toast(`${done} workspace${done !== 1 ? 's' : ''} approved${failed ? ` · ${failed} failed` : ''}.`, done ? 'fa-circle-check' : 'fa-circle-exclamation');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Approve all pending'; }
}

async function bulkDeleteSelectedTenants() {
  const selected = getSelectedTenants();
  if (!selected.length) return toast('Select clients to delete first.', 'fa-circle-info');
  const sampleNames = selected.slice(0, 4).map(t => t.name || t.tenant_name || t.slug || 'Unnamed client');
  const more = selected.length > sampleNames.length ? ` and ${selected.length - sampleNames.length} more` : '';
  confirmDangerAction(
    `Delete ${selected.length} selected client${selected.length > 1 ? 's' : ''}?`,
    `This will <strong>permanently erase</strong> the selected client workspace${selected.length > 1 ? 's' : ''} and all related data. This cannot be undone.<br><br><strong>${sampleNames.map(_e).join(', ')}${_e(more)}</strong>`,
    async () => {
      const btn = document.getElementById('sa-bulk-delete-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
      }
      let done = 0, failed = 0;
      const deletedIds = [];
      for (const tenant of selected) {
        const tenantId = getTenantRowId(tenant);
        if (!tenantId) { failed++; continue; }
        try {
          await RS_API.admin({ action: 'delete_tenant', tenant_id: tenantId });
          deletedIds.push(tenantId);
          done++;
        } catch (err) {
          console.error('Bulk tenant delete failed', tenantId, err);
          failed++;
        }
      }
      if (deletedIds.length) {
        const deleted = new Set(deletedIds);
        _cachedTenants = _cachedTenants.filter(t => !deleted.has(getTenantRowId(t)));
        selectedTenantIds = new Set([...selectedTenantIds].filter(id => !deleted.has(id)));
      }
      renderPlatformSummary(_cachedTenants);
      renderTenantTable();
      updateBulkBar();
      toast(`${done} client${done !== 1 ? 's' : ''} deleted${failed ? ` · ${failed} failed` : ''}.`, done ? 'fa-circle-check' : 'fa-circle-exclamation');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete selected';
      }
    }
  );
}

// ── Create Tenant Modal ─────────────────────────────────────────────────
function openCreateTenantModal() {
  const modal = document.getElementById('create-tenant-modal');
  if (!modal) return;
  // Clear form
  ['ct-name','ct-slug','ct-username','ct-password','ct-email','ct-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('ct-error');
  if (errEl) errEl.style.display = 'none';
  const autoApprove = document.getElementById('ct-auto-approve');
  if (autoApprove) autoApprove.checked = true;

  // Auto-generate slug and username from name
  const nameEl = document.getElementById('ct-name');
  const slugEl = document.getElementById('ct-slug');
  const userEl = document.getElementById('ct-username');
  if (nameEl && !nameEl.dataset.slugWired) {
    nameEl.dataset.slugWired = '1';
    nameEl.addEventListener('input', () => {
      const base = nameEl.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (slugEl) slugEl.value = base;
      if (userEl) userEl.value = base ? base + '-admin' : '';
    });
  }

  if (!modal.dataset.eventsBound) {
    modal.dataset.eventsBound = '1';
    document.getElementById('close-create-tenant-modal').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('ct-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

    document.getElementById('ct-submit-btn').addEventListener('click', async () => {
      const name = document.getElementById('ct-name').value.trim();
      const slug = document.getElementById('ct-slug').value.trim();
      const outlet_type = document.getElementById('ct-outlet-type').value;
      const plan_code = document.getElementById('ct-plan').value;
      const username = document.getElementById('ct-username').value.trim();
      const password = document.getElementById('ct-password').value;
      const email = document.getElementById('ct-email').value.trim();
      const phone = document.getElementById('ct-phone').value.trim();
      const autoApproveChecked = document.getElementById('ct-auto-approve').checked;

      const errEl = document.getElementById('ct-error');
      const showErr = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };
      errEl.style.display = 'none';

      if (!name) return showErr('Business name is required.');
      if (!slug || !/^[a-z0-9-]+$/.test(slug)) return showErr('Slug must be lowercase letters, numbers and hyphens only.');
      if (!username) return showErr('Admin username is required.');
      if (!password || password.length < 6) return showErr('Password must be at least 6 characters.');

      const btn = document.getElementById('ct-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';

      try {
        await RS_API.register({ name, slug, outlet_type, email, phone, username, password });
        // If auto-approve, immediately approve by finding and updating the new tenant
        if (autoApproveChecked) {
          try {
            // Refresh tenant list to get the new tenant's ID
            const out = await RS_API.admin({ action: 'list_tenants' }).catch(() => ({ tenants: [] }));
            const allTenants = (out && out.tenants) || [];
            const newTenant = allTenants.find(t => t.slug === slug || t.username === username);
            if (newTenant && newTenant.id) {
              await RS_API.admin({ action: 'update_tenant', tenant_id: newTenant.id, status: 'approved',
                username, plan_code, subscription_status: 'active',
                allowed_tabs: newTenant.allowed_tabs || [], phone, email });
              newTenant.status = 'approved';
              newTenant.plan_code = plan_code;
            }
            _cachedTenants = allTenants;
          } catch(e) { /* approval failed silently — tenant still created */ }
        }
        modal.classList.remove('active');
        toast(`Workspace "${name}" created${autoApproveChecked ? ' & approved' : ' (pending approval)'}!`, 'fa-store');
        renderPlatformSummary(_cachedTenants);
        renderTenantTable();
        updateBulkBar();
      } catch (err) {
        showErr(err.message || 'Failed to create workspace. Check details and try again.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-plus"></i> Create Workspace';
      }
    });
  }

  modal.classList.add('active');
}

async function openPlanPricingEditor() {
  document.getElementById('rs-pricing-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'rs-pricing-modal';
  m.className = 'modal-backdrop';
  m.style.cssText = 'z-index:200010;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto';
  m.innerHTML = `
    <div style="background:var(--panel,#fff);border:1px solid var(--stroke);border-radius:16px;max-width:640px;width:100%;padding:22px 22px 18px;box-shadow:0 24px 80px rgba(0,0,0,.35)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h3 style="margin:0;font-size:16px;font-weight:800">Plan pricing</h3>
        <button id="rs-pricing-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-mute);line-height:1">×</button>
      </div>
      <p style="font-size:12px;color:var(--text-soft);margin:0 0 14px">Edit monthly price, currency, and the Razorpay plan id used for self-serve checkout. Changes apply immediately.</p>
      <div id="rs-pricing-body" style="font-size:13px;color:var(--text-soft)"><i class="fa-solid fa-spinner fa-spin"></i> Loading plans…</div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('#rs-pricing-close').onclick = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  const body = m.querySelector('#rs-pricing-body');
  let plans = [];
  try { const out = await RS_API.admin({ action: 'list_plans' }); plans = (out && out.plans) || []; }
  catch (e) { body.innerHTML = '<span style="color:#dc2626">Could not load plans (' + _e(e.message || 'error') + ').</span>'; return; }
  body.innerHTML = plans.map(p => `
    <div data-plan="${_e(p.plan_code)}" style="border:1px solid var(--stroke);border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">${_e(p.name)} <span style="color:var(--text-mute);font-weight:600">(${_e(p.plan_code)})</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="font-size:11px;color:var(--text-mute)">Price / month
          <input class="rs-pp-price" type="number" min="0" value="${Number(p.price_monthly)||0}" style="width:100%;padding:7px 10px;border:1px solid var(--stroke);border-radius:7px;background:var(--panel);color:var(--text);margin-top:3px">
        </label>
        <label style="font-size:11px;color:var(--text-mute)">Currency
          <input class="rs-pp-cur" type="text" value="${_e(p.currency||'INR')}" maxlength="8" style="width:100%;padding:7px 10px;border:1px solid var(--stroke);border-radius:7px;background:var(--panel);color:var(--text);margin-top:3px">
        </label>
        <label style="font-size:11px;color:var(--text-mute);grid-column:1/3">Razorpay plan id (for self-serve checkout)
          <input class="rs-pp-rzp" type="text" value="${_e(p.razorpay_plan_id||'')}" placeholder="plan_XXXXXXXX" style="width:100%;padding:7px 10px;border:1px solid var(--stroke);border-radius:7px;background:var(--panel);color:var(--text);margin-top:3px;font-family:monospace">
        </label>
        <label style="font-size:12px;color:var(--text);display:flex;align-items:center;gap:7px;grid-column:1/3">
          <input class="rs-pp-pub" type="checkbox" ${p.is_public===false?'':'checked'}> Show to tenants in the in-app billing panel
        </label>
      </div>
      <div style="text-align:right;margin-top:8px">
        <button class="rs-pp-save btn btn-sm" style="background:var(--orange);color:#fff;border:none;padding:7px 16px;border-radius:7px;font-size:12px;font-weight:700">Save</button>
      </div>
    </div>`).join('');
  body.querySelectorAll('.rs-pp-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-plan]');
      const payload = {
        action: 'update_plan',
        plan_code: row.getAttribute('data-plan'),
        price_monthly: Number(row.querySelector('.rs-pp-price').value) || 0,
        currency: (row.querySelector('.rs-pp-cur').value || 'INR').trim().toUpperCase(),
        razorpay_plan_id: row.querySelector('.rs-pp-rzp').value.trim(),
        is_public: row.querySelector('.rs-pp-pub').checked,
      };
      btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Saving…';
      try { await RS_API.admin(payload); toast('Plan pricing updated.', 'fa-circle-check'); }
      catch (e) { toast('Failed: ' + (e.message || 'error'), 'fa-circle-exclamation'); }
      finally { btn.disabled = false; btn.textContent = orig; }
    });
  });
}

async function loadTenantDevices(tenantId) {
  const box = document.getElementById('manage-devices-box');
  if (!box) return;
  if (!tenantId) { box.textContent = 'Save the workspace first to see licensed devices.'; return; }
  box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading devices…';
  let devices = [];
  try { const out = await RS_API.admin({ action: 'list_devices', tenant_id: tenantId }); devices = (out && out.devices) || []; }
  catch (e) { box.innerHTML = '<span style="color:#dc2626">Could not load devices (' + _e(e.message || 'error') + ').</span>'; return; }
  if (!devices.length) { box.innerHTML = '<span style="color:var(--text-mute)">No devices have activated a licence yet.</span>'; return; }
  const rel = (iso) => { if (!iso) return '—'; const ms = Date.now() - new Date(iso).getTime(); const d = Math.floor(ms/86400000); if (d>0) return d+'d ago'; const h=Math.floor(ms/3600000); if(h>0) return h+'h ago'; const mi=Math.floor(ms/60000); return mi>0?mi+'m ago':'just now'; };
  box.innerHTML = devices.map(d => {
    const shortId = _e(String(d.device_id || '').replace(/^dev_/, '').slice(0, 12));
    const revoked = !!d.revoked;
    const statusChip = revoked ? '<span style="color:#dc2626;font-weight:700">Revoked</span>' : '<span style="color:#16A34A;font-weight:700">Active</span>';
    const btn = revoked
      ? `<button class="rs-dev-btn" data-act="restore_device" data-dev="${_e(d.device_id)}" style="background:none;border:1px solid var(--stroke);border-radius:7px;padding:5px 10px;font-size:11px;color:var(--text);cursor:pointer">Restore</button>`
      : `<button class="rs-dev-btn" data-act="revoke_device" data-dev="${_e(d.device_id)}" style="background:none;border:1px solid rgba(239,68,68,.35);border-radius:7px;padding:5px 10px;font-size:11px;color:#dc2626;cursor:pointer">Revoke</button>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--stroke)">
      <div style="min-width:0">
        <div style="font-weight:700;color:var(--text);font-family:monospace;font-size:12px">${shortId} · ${statusChip}</div>
        <div style="font-size:11px;color:var(--text-mute)">${_e(d.last_plan || '—')} · last seen ${rel(d.last_lease_at)} · ${_e(String(d.lease_count || 0))} renewals</div>
      </div>${btn}
    </div>`;
  }).join('');
  box.querySelectorAll('.rs-dev-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const act = btn.getAttribute('data-act'); const dev = btn.getAttribute('data-dev');
      btn.disabled = true;
      try {
        await RS_API.admin({ action: act, tenant_id: tenantId, device_id: dev, reason: 'Toggled from admin console' });
        toast(act === 'revoke_device' ? 'Device revoked — it will lock within the offline window.' : 'Device restored.', 'fa-circle-check');
        loadTenantDevices(tenantId);
      } catch (e) { btn.disabled = false; toast('Failed: ' + (e.message || 'error'), 'fa-circle-exclamation'); }
    });
  });
}

function openTenantManageModal(tenant) {
  try {
    const modal = document.getElementById('tenant-manage-modal');
    if (!modal) return;

    initTenantManageModalEvents();

    const tenantIdEl = document.getElementById('manage-tenant-id');
    const tenantNameEl = document.getElementById('manage-tenant-name');
    const avatarEl = document.getElementById('manage-tenant-avatar');
    const statusBadge = document.getElementById('manage-status-badge');
    const usernameEl = document.getElementById('manage-username');
    const passwordEl = document.getElementById('manage-password');
    const statusEl = document.getElementById('manage-status');
    const planCodeEl = document.getElementById('manage-plan-code');
    const subscriptionStatusEl = document.getElementById('manage-subscription-status');
    const phoneEl = document.getElementById('manage-phone');
    const emailEl = document.getElementById('manage-email');

    if (tenantIdEl) {
      tenantIdEl.value = tenant.id || '';
      tenantIdEl.setAttribute('data-slug', tenant.slug || '');
    }

    const displayName = (tenant.name || 'Unknown') + ` (${(tenant.outlet_type || 'CAFE').toUpperCase()})`;
    if (tenantNameEl) tenantNameEl.textContent = displayName;
    if (avatarEl) avatarEl.textContent = (tenant.name || 'U').charAt(0).toUpperCase();

    if (statusBadge) {
      const s = tenant.status || 'pending';
      const badgeMap = {
        approved: { dot: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', color: '#16A34A', label: 'Active' },
        active: { dot: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', color: '#16A34A', label: 'Active' },
        pending: { dot: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', color: '#B45309', label: 'Pending' },
        suspended: { dot: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', color: '#DC2626', label: 'Suspended' }
      };
      const b = badgeMap[s] || badgeMap.pending;
      statusBadge.style.background = b.bg;
      statusBadge.style.borderColor = b.border;
      statusBadge.style.color = b.color;
      statusBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${_e(b.dot)};display:inline-block;"></span>${_e(b.label)}`;
    }

    if (usernameEl) usernameEl.value = tenant.username || '';
    if (passwordEl) passwordEl.value = '';
    if (statusEl) {
      statusEl.value = tenant.status === 'approved' ? 'approved' : (tenant.status || 'pending');
    }
    if (phoneEl) phoneEl.value = tenant.phone || '';
    if (emailEl) emailEl.value = tenant.email || '';
    if (planCodeEl) planCodeEl.value = tenant.plan_code || 'starter';
    if (subscriptionStatusEl) subscriptionStatusEl.value = tenant.subscription_status || 'active';
    const periodEndEl = document.getElementById('manage-period-end');
    if (periodEndEl) {
      try { periodEndEl.value = tenant.subscription_current_period_end ? new Date(tenant.subscription_current_period_end).toISOString().slice(0,10) : ''; }
      catch (e) { periodEndEl.value = ''; }
    }
    loadTenantDevices(tenant.id);
    if (window.__rsDeviceTimer) clearInterval(window.__rsDeviceTimer);
    window.__rsDeviceTimer = setInterval(function () {
      const box = document.getElementById('manage-devices-box');
      if (!box || box.offsetParent === null) { clearInterval(window.__rsDeviceTimer); window.__rsDeviceTimer = null; return; }
      loadTenantDevices(tenant.id);
    }, 15000);
    // Notes field — stored in localStorage keyed by tenant ID (no backend needed)
    const notesEl = document.getElementById('manage-notes');
    if (notesEl) {
      try { notesEl.value = localStorage.getItem(`sa-note-${tenant.id}`) || ''; } catch(e) { notesEl.value = ''; }
    }

    const allowed = Array.isArray(tenant.allowed_tabs) ? tenant.allowed_tabs : [];
    const checkboxes = document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]');

    checkboxes.forEach(cb => {
      cb.checked = allowed.includes(cb.value);
      const card = cb.closest('label');
      if (card) {
        if (cb.checked) {
          card.style.borderColor = 'rgba(252,128,25,0.45)';
          card.style.background = 'rgba(252,128,25,0.06)';
        } else {
          card.style.borderColor = 'var(--stroke)';
          card.style.background = 'var(--panel)';
        }
      }
    });

    // Reset to Account tab
    document.querySelectorAll('.tmtab').forEach((tb, i) => {
      tb.style.color = i === 0 ? 'var(--orange)' : 'var(--text-mute)';
      tb.style.borderBottomColor = i === 0 ? 'var(--orange)' : 'transparent';
    });
    document.querySelectorAll('.tm-panel').forEach((p, i) => {
      p.style.display = i === 0 ? 'flex' : 'none';
    });

    // Wire copy-login button in modal header
    const copyLoginBtn = document.getElementById('manage-copy-login-btn');
    if (copyLoginBtn) {
      const slug = (tenant.slug || tenant.username || '').toLowerCase().replace(/\s+/g, '-');
      copyLoginBtn.onclick = () => {
        const origin = location.origin + location.pathname.replace(/\/[^\/]*$/, '');
        const url = `${origin}/login?tenant=${encodeURIComponent(slug)}`;
        navigator.clipboard.writeText(url)
          .then(() => toast('Login URL copied!', 'fa-link'))
          .catch(() => prompt('Copy tenant login URL:', url));
      };
    }

    const openDashboardBtn = document.getElementById('manage-open-dashboard-btn');
    if (openDashboardBtn) {
      const canOpen = !['pending', 'suspended'].includes(String(tenant.status || '').toLowerCase());
      openDashboardBtn.disabled = !canOpen;
      openDashboardBtn.title = canOpen ? 'Open this workspace dashboard' : 'Only active workspaces can be opened';
      openDashboardBtn.onclick = () => openTenantDashboard(tenant, openDashboardBtn);
    }

    modal.classList.add('active');
  } catch (err) {
    console.error(err);
    toast('Failed to render management controls.', 'fa-circle-exclamation');
  }
}

function closeTenantModal() {
  const modal = document.getElementById('tenant-manage-modal');
  if (modal) modal.classList.remove('active');
  if (window.__rsDeviceTimer) { clearInterval(window.__rsDeviceTimer); window.__rsDeviceTimer = null; }
}

// ── Super-Admin Settings Modal ──────────────────────────────────────────
function openSuperAdminSettingsModal() {
  let m = document.getElementById('sa-settings-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'sa-settings-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px)';
    const sess = window.RS_API ? RS_API.session() : null;
    const uname = (sess && sess.username) || 'codearc-superadmin';
    const tenantId = (sess && sess.tenant_id) || '';
    m.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--stroke);border-radius:16px;padding:28px 32px;width:min(480px,90vw);box-shadow:0 20px 60px rgba(0,0,0,0.35)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <h3 style="font-size:16px;margin:0;display:flex;align-items:center;gap:8px"><i class="fa-solid fa-shield-halved" style="color:var(--orange)"></i> Super-Admin Settings</h3>
          <button id="close-sa-settings" style="background:none;border:none;cursor:pointer;color:var(--text-mute);font-size:18px;padding:4px"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="background:rgba(252,128,25,0.06);border:1px solid rgba(252,128,25,0.15);border-radius:10px;padding:14px 16px">
            <div style="font-size:12px;color:var(--text-mute);margin-bottom:4px">Logged in as</div>
            <div style="font-weight:600;font-size:15px">${_e(uname)}</div>
            <div style="font-size:12px;color:var(--text-mute);margin-top:2px">Role: SaaS Super-Admin · Tenant ID: ${_e(tenantId || 'root')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="font-size:12px;font-weight:600;color:var(--text-mute);text-transform:uppercase;letter-spacing:.05em">Platform</div>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:14px">
              <span><i class="fa-solid fa-moon" style="width:16px;margin-right:6px;color:var(--text-mute)"></i>Dark mode</span>
              <button id="sa-theme-toggle" class="btn btn-ghost btn-sm" style="min-width:80px">
                ${document.documentElement.classList.contains('dark') ? '<i class="fa-solid fa-sun"></i> Light' : '<i class="fa-solid fa-moon"></i> Dark'}
              </button>
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:14px">
              <span><i class="fa-solid fa-sidebar" style="width:16px;margin-right:6px;color:var(--text-mute)"></i>Collapse sidebar</span>
              <button id="sa-sidebar-toggle" class="btn btn-ghost btn-sm"><i class="fa-solid fa-arrow-left-to-line"></i> Toggle</button>
            </label>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="font-size:12px;font-weight:600;color:var(--text-mute);text-transform:uppercase;letter-spacing:.05em">Data</div>
            <label style="display:flex;align-items:center;justify-content:space-between;font-size:14px">
              <span><i class="fa-solid fa-download" style="width:16px;margin-right:6px;color:var(--text-mute)"></i>Export all tenants</span>
              <button id="sa-export-btn" class="btn btn-ghost btn-sm"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
            </label>
          </div>
          <div style="border-top:1px solid var(--stroke);padding-top:14px;display:flex;gap:10px;justify-content:flex-end">
            <button id="sa-settings-logout" class="btn btn-danger btn-sm"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    document.getElementById('close-sa-settings').onclick = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    const themeBtn = document.getElementById('sa-theme-toggle');
    if (themeBtn) themeBtn.onclick = () => {
      const tt = document.getElementById('theme-toggle');
      if (tt) tt.click();
      m.remove();
    };
    const sbBtn = document.getElementById('sa-sidebar-toggle');
    if (sbBtn) sbBtn.onclick = () => {
      const sb = document.getElementById('sb-collapse');
      if (sb) sb.click();
      m.remove();
    };
    const expBtn = document.getElementById('sa-export-btn');
    if (expBtn) expBtn.onclick = () => {
      m.remove();
      const exportBtn2 = document.getElementById('btn-export-tenants');
      if (exportBtn2) exportBtn2.click();
    };
    const logoutBtn = document.getElementById('sa-settings-logout');
    if (logoutBtn) logoutBtn.onclick = () => {
      m.remove();
      if (window.RS_API) RS_API.logout();
      location.href = 'login';
    };
  } else {
    m.remove();
  }
}

// ── Super-Admin Delete Confirmation Modal ───────────────────────────────
function confirmDangerAction(title, body, onConfirm) {
  const m = document.createElement('div');
  m.style.cssText = 'position:fixed;inset:0;z-index:11000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)';
  m.innerHTML = `
    <div style="background:var(--panel);border:1px solid rgba(239,68,68,0.4);border-radius:14px;padding:24px 28px;width:min(420px,90vw);box-shadow:0 20px 60px rgba(0,0,0,0.4)">
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:18px">
        <div style="flex-shrink:0;width:40px;height:40px;border-radius:10px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;color:#ef4444;font-size:18px"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div><div style="font-weight:700;font-size:15px;margin-bottom:4px">${title}</div><div style="font-size:13px;color:var(--text-mute);line-height:1.5">${body}</div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" id="danger-cancel">Cancel</button>
        <button class="btn btn-danger btn-sm" id="danger-confirm"><i class="fa-solid fa-trash-can"></i> Yes, proceed</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  document.getElementById('danger-cancel').onclick = () => m.remove();
  document.getElementById('danger-confirm').onclick = () => { m.remove(); onConfirm(); };
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

function initTenantManageModalEvents() {
  const closeBtn = document.getElementById('close-tenant-modal');
  const closeBtn2 = document.getElementById('close-tenant-modal-btn');
  if (closeBtn && !closeBtn.dataset.listenerBound) {
    closeBtn.dataset.listenerBound = 'true';
    closeBtn.addEventListener('click', closeTenantModal);
  }
  if (closeBtn2 && !closeBtn2.dataset.listenerBound) {
    closeBtn2.dataset.listenerBound = 'true';
    closeBtn2.addEventListener('click', closeTenantModal);
  }

  // Bind checkboxes parent highlight
  const checkboxes = document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (!cb.dataset.listenerBound) {
      cb.dataset.listenerBound = 'true';
      cb.addEventListener('change', () => {
        const card = cb.closest('label');
        if (card) {
          card.style.borderColor = cb.checked ? 'rgba(252,128,25,0.45)' : 'var(--stroke)';
          card.style.background = cb.checked ? 'rgba(252,128,25,0.06)' : 'var(--panel)';
        }
      });
    }
  });

  const saveTenantBtn = document.getElementById('save-tenant-settings-btn');
  if (saveTenantBtn && !saveTenantBtn.dataset.listenerBound) {
    saveTenantBtn.dataset.listenerBound = 'true';
    saveTenantBtn.addEventListener('click', async () => {
      try {
        const tenantIdEl = document.getElementById('manage-tenant-id');
        const tenantId = tenantIdEl.value;
        const username = document.getElementById('manage-username').value.trim();
        const password = document.getElementById('manage-password').value.trim();
        const status = document.getElementById('manage-status').value;
        const phone = document.getElementById('manage-phone').value.trim();
        const email = document.getElementById('manage-email').value.trim();
        const plan_code = document.getElementById('manage-plan-code').value;
        const subscription_status = document.getElementById('manage-subscription-status').value;
        const periodEndRaw = (document.getElementById('manage-period-end') || {}).value || '';

        const allowed_tabs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

        const updates = {
          tenant_id: tenantId,
          username,
          status,
          plan_code,
          subscription_status,
          allowed_tabs,
          phone,
          email
        };
        updates.subscription_current_period_end = periodEndRaw ? new Date(periodEndRaw + 'T23:59:59Z').toISOString() : '';

        if (password !== '') updates.password = password;

        // Save notes locally
        const notesVal = (document.getElementById('manage-notes') || {}).value || '';
        try { localStorage.setItem(`sa-note-${tenantId}`, notesVal); } catch(e) {}

        await RS_API.admin({ action: 'update_tenant', ...updates });
        // Update cache so table reflects status/plan change immediately
        const idx = _cachedTenants.findIndex(t => String(t.id) === String(tenantId));
        if (idx !== -1) Object.assign(_cachedTenants[idx], { username, status, plan_code, subscription_status, phone, email, allowed_tabs });
        closeTenantModal();
        renderPlatformSummary(_cachedTenants);
        renderTenantTable();
        toast("Client configurations saved successfully!");
      } catch (err) {
        console.error(err);
        toast("Error saving settings: " + err.message, "fa-circle-exclamation");
      }
    });
  }

  const deleteTenantBtn = document.getElementById('delete-tenant-btn');
  if (deleteTenantBtn && !deleteTenantBtn.dataset.listenerBound) {
    deleteTenantBtn.dataset.listenerBound = 'true';
    deleteTenantBtn.addEventListener('click', () => {
      const tenantId = document.getElementById('manage-tenant-id').value;
      const tenantName = document.getElementById('manage-tenant-name').textContent;
      confirmDangerAction(
        'Delete workspace permanently?',
        `This will <strong>permanently erase</strong> the account and all data for <strong>${_e(tenantName)}</strong>. This cannot be undone.`,
        async () => {
          try {
            await RS_API.admin({ action: 'delete_tenant', tenant_id: tenantId });
            closeTenantModal();
            _cachedTenants = _cachedTenants.filter(t => String(t.id) !== String(tenantId));
            renderPlatformSummary(_cachedTenants);
            renderTenantTable();
            toast('Client account permanently deleted.', 'fa-circle-check');
          } catch (err) {
            console.error(err);
            toast('Error deleting client: ' + err.message, 'fa-circle-exclamation');
          }
        }
      );
    });
  }

  const resetTenantDataBtn = document.getElementById('reset-tenant-data-btn');
  if (resetTenantDataBtn && !resetTenantDataBtn.dataset.listenerBound) {
    resetTenantDataBtn.dataset.listenerBound = 'true';
    resetTenantDataBtn.addEventListener('click', () => {
      const tenantId = document.getElementById('manage-tenant-id').value;
      const tenantName = document.getElementById('manage-tenant-name').textContent;
      confirmDangerAction(
        'Reset all operations data?',
        `This will <strong>permanently delete</strong> all bills, menus, inventory, staff, CRM and recipes for <strong>${_e(tenantName)}</strong>. Account credentials and settings will be kept.`,
        async () => {
          resetTenantDataBtn.disabled = true;
          resetTenantDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
          try {
            await RS_API.admin({ action: 'reset_tenant_data', tenant_id: tenantId });
            closeTenantModal();
            toast('Workspace reset to factory fresh!', 'fa-rotate-right');
            await renderSuper();
          } catch (err) {
            console.error(err);
            toast('System error resetting data: ' + err.message, 'fa-circle-exclamation');
          } finally {
            resetTenantDataBtn.disabled = false;
            resetTenantDataBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-left" style="font-size: 10px;"></i> Reset data';
          }
        }
      );
    });
  }

  const seedTenantDataBtn = document.getElementById('seed-tenant-data-btn');
  if (seedTenantDataBtn && !seedTenantDataBtn.dataset.listenerBound) {
    seedTenantDataBtn.dataset.listenerBound = 'true';
    seedTenantDataBtn.addEventListener('click', () => {
      const tenantId = document.getElementById('manage-tenant-id').value;
      const tenantName = document.getElementById('manage-tenant-name').textContent;
      confirmDangerAction(
        'Load demo data into this workspace?',
        `This will populate <strong>${_e(tenantName)}</strong>'s workspace with a realistic set of menu, inventory, recipes, staff and bill history. Existing operational data will be reset.`,
        async () => {
          seedTenantDataBtn.disabled = true;
          seedTenantDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Seeding...';
          try {
            await RS_API.admin({ action: 'seed_tenant_data', tenant_id: tenantId });
            closeTenantModal();
            toast('Demo records loaded successfully!', 'fa-seedling');
            await renderSuper();
          } catch (err) {
            console.error(err);
            toast('Error loading demo data: ' + err.message, 'fa-circle-exclamation');
          } finally {
            seedTenantDataBtn.disabled = false;
            seedTenantDataBtn.innerHTML = '<i class="fa-solid fa-seedling" style="font-size: 10px;"></i> Load Demo Data';
          }
        }
      );
    });
  }

  const purgeTenantDataBtn = document.getElementById('purge-tenant-data-btn');
  if (purgeTenantDataBtn && !purgeTenantDataBtn.dataset.listenerBound) {
    purgeTenantDataBtn.dataset.listenerBound = 'true';
    purgeTenantDataBtn.addEventListener('click', () => {
      const tenantId = document.getElementById('manage-tenant-id').value;
      const tenantName = document.getElementById('manage-tenant-name').textContent;
      confirmDangerAction(
        'Remove demo data?',
        `This will safely delete <em>only</em> the demo data records from <strong>${_e(tenantName)}</strong>'s workspace. Client-added data will remain intact.`,
        async () => {
          purgeTenantDataBtn.disabled = true;
          purgeTenantDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Purging...';
          try {
            await RS_API.admin({ action: 'purge_demo_data', tenant_id: tenantId });
            closeTenantModal();
            toast('Demo records removed successfully!', 'fa-trash-can');
            await renderSuper();
          } catch (err) {
            console.error(err);
            toast('Error purging demo data: ' + err.message, 'fa-circle-exclamation');
          } finally {
            purgeTenantDataBtn.disabled = false;
            purgeTenantDataBtn.innerHTML = '<i class="fa-solid fa-trash-can" style="font-size: 10px;"></i> Remove Demo Data';
          }
        }
      );
    });
  }

  // ── Tab switching ──────────────────────────────────────────
  document.querySelectorAll('.tmtab').forEach(tab => {
    if (!tab.dataset.listenerBound) {
      tab.dataset.listenerBound = 'true';
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tmtab');
        document.querySelectorAll('.tmtab').forEach(t => {
          const active = t.getAttribute('data-tmtab') === target;
          t.style.color = active ? 'var(--orange)' : 'var(--text-mute)';
          t.style.borderBottomColor = active ? 'var(--orange)' : 'transparent';
        });
        document.querySelectorAll('.tm-panel').forEach(p => {
          p.style.display = p.id === `tm-panel-${target}` ? 'flex' : 'none';
        });
      });
    }
  });

  // ── Select All / Clear All (Features tab) ─────────────────
  const selAll = document.getElementById('manage-select-all-tabs');
  const clrAll = document.getElementById('manage-deselect-all-tabs');
  if (selAll && !selAll.dataset.listenerBound) {
    selAll.dataset.listenerBound = 'true';
    selAll.addEventListener('click', () => {
      document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        const card = cb.closest('label');
        if (card) { card.style.borderColor = 'rgba(252,128,25,0.45)'; card.style.background = 'rgba(252,128,25,0.06)'; }
      });
    });
  }
  if (clrAll && !clrAll.dataset.listenerBound) {
    clrAll.dataset.listenerBound = 'true';
    clrAll.addEventListener('click', () => {
      document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        const card = cb.closest('label');
        if (card) { card.style.borderColor = 'var(--stroke)'; card.style.background = 'var(--panel)'; }
      });
    });
  }

  // ── Save Features button ───────────────────────────────────
  const saveFeaturesBtn = document.getElementById('save-tenant-features-btn');
  if (saveFeaturesBtn && !saveFeaturesBtn.dataset.listenerBound) {
    saveFeaturesBtn.dataset.listenerBound = 'true';
    saveFeaturesBtn.addEventListener('click', async () => {
      try {
        const tenantId = document.getElementById('manage-tenant-id').value;
        const checkboxes = document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]');
        const allowed_tabs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        const t = _cachedTenants.find(x => String(x.id) === String(tenantId));
        if (!t) return;
        saveFeaturesBtn.disabled = true; saveFeaturesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
        await RS_API.admin({ action: 'update_tenant', tenant_id: tenantId,
          username: t.username, status: t.status, plan_code: t.plan_code || 'starter',
          subscription_status: t.subscription_status || 'active',
          allowed_tabs, phone: t.phone || '', email: t.email || '' });
        if (t) t.allowed_tabs = allowed_tabs;
        toast('Feature access updated!', 'fa-toggle-on');
        closeTenantModal();
        renderTenantTable();
      } catch (err) {
        toast('Error saving features: ' + err.message, 'fa-circle-exclamation');
      } finally {
        saveFeaturesBtn.disabled = false;
        saveFeaturesBtn.innerHTML = '<i class="fa-solid fa-floppy-disk" style="margin-right:5px"></i>Save features';
      }
    });
  }
}

  global.RSSuperAdmin = {
    renderSuper,
    renderTenantTable,
    pollSuperTenants,
    startSuperPolling,
    openCreateTenantModal,
    bulkApproveAllPending,
    bulkDeleteSelectedTenants,
    openPlanPricingEditor,
    setSearch(q) {
      superAdminSearch = String(q || '');
      if (typeof renderTenantTable === 'function') renderTenantTable();
    },
    getSearch() {
      return superAdminSearch;
    },
    getTenantCount() {
      return Array.isArray(_cachedTenants) ? _cachedTenants.length : 0;
    },
  };

  // Boot-hook aliases (dashboard shell still wires these by name)
  global.openCreateTenantModal = openCreateTenantModal;
  global.bulkApproveAllPending = bulkApproveAllPending;
  global.renderTenantTable = renderTenantTable;

  function attach() {
    if (!global.RS) return;
    global.RS.renderSuper = renderSuper;
  }
  if (global.RS) attach();
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
