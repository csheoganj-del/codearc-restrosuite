/* ============================================================
   RestroSuite — Super-admin console (Wave 9 code-split)
   Tenant table, bulk ops, plan pricing, manage modal
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
  function initials(value) {
    if (global.RS && typeof RS.initials === 'function') {return RS.initials(value);}
    return String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }
  function getAvatarColors() {
    if (global.RS && Array.isArray(RS.avatarColors) && RS.avatarColors.length) {return RS.avatarColors;}
    return ['#FF4F00', '#5B6C8F', '#2A9B8F', '#1F8A5B', '#C47B16'];
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
  /** Title-case words for display (keeps short tokens like "BB" alone). */
  function titleCaseWords(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((w) => {
        if (w.length <= 2 && w === w.toUpperCase()) {return w;}
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');
  }
  function formatPlanLabel(code, name) {
    const PLAN = {
      express: 'Express', serve: 'Serve', command: 'Command',
      starter: 'Express', growth: 'Serve', enterprise: 'Command',
      free: 'Free', chain: 'Chain',
    };
    const c = String(code || '').toLowerCase();
    if (name && String(name).toLowerCase() !== c && !['starter', 'growth', 'enterprise'].includes(String(name).toLowerCase())) {
      return titleCaseWords(name);
    }
    return PLAN[c] || titleCaseWords(code || 'Serve') || 'Serve';
  }
  /** Live price map from list_tenants / list_plans (₹/mo). Falls back to catalogue. */
  let _planPriceMap = null;
  function planMonthlyPrice(code) {
    const c = String(code || '').toLowerCase();
    const canon = c === 'starter' || c === 'basic' ? 'express'
      : c === 'growth' || c === 'standard' || c === 'pro' ? 'serve'
        : c === 'enterprise' || c === 'scale' ? 'command'
          : c;
    if (_planPriceMap) {
      if (_planPriceMap[c] != null && Number.isFinite(Number(_planPriceMap[c]))) return Number(_planPriceMap[c]);
      if (_planPriceMap[canon] != null && Number.isFinite(Number(_planPriceMap[canon]))) return Number(_planPriceMap[canon]);
    }
    if (c === 'free') return 0;
    if (c === 'express' || c === 'starter' || c === 'basic') return 499;
    if (c === 'serve' || c === 'growth' || c === 'standard' || c === 'pro') return 999;
    if (c === 'command' || c === 'enterprise' || c === 'scale') return 2499;
    return 0;
  }
  /**
   * Trial vs paid (must match tenant-admin).
   * "active" alone is NOT paid — needs subscription_id or subscription_activated_at.
   * Mis-marked active workspaces with no payment evidence count as trial.
   */
  function isTrialTenant(t) {
    if (!t) return false;
    if (t.is_trial === true || t.billing_kind === 'trial') return true;
    if (t.is_paid === true || t.billing_kind === 'paid') return false;
    const sub = String(t.subscription_status || '').toLowerCase();
    if (sub === 'trialing' || sub === 'trial') return true;
    if (sub === 'past_due' || sub === 'canceled' || sub === 'cancelled' || sub === 'expired') return false;
    const hasPaidEvidence = !!(
      (t.subscription_id && String(t.subscription_id).trim()) ||
      t.subscription_activated_at
    );
    if (sub === 'active' || !sub) return !hasPaidEvidence;
    return !!t.trial_started_at && !hasPaidEvidence;
  }
  function isPaidTenant(t) {
    if (!t) return false;
    if (t.is_paid === true || t.billing_kind === 'paid') return true;
    if (isTrialTenant(t)) return false;
    const sub = String(t.subscription_status || '').toLowerCase();
    if (sub !== 'active') return false;
    const plan = canonPlanCode(t.plan_code);
    if (!['express', 'serve', 'command'].includes(plan)) return false;
    return !!(
      (t.subscription_id && String(t.subscription_id).trim()) ||
      t.subscription_activated_at
    );
  }
  /** Per-tenant MRR: only real paid (never trials). */
  function tenantMrr(t) {
    if (!t) return 0;
    if (!isPaidTenant(t)) return 0;
    if (Number(t.mrr) > 0) return Number(t.mrr);
    const mo = planMonthlyPrice(t.plan_code);
    if (!mo) return 0;
    const interval = String(t.billing_interval || 'monthly').toLowerCase();
    if (interval === 'yearly') {
      const yr = mo === 499 ? 4999 : mo === 999 ? 9999 : mo === 2499 ? 24999 : mo * 10;
      return Math.round(yr / 12);
    }
    return mo;
  }
  function canonPlanCode(code) {
    const c = String(code || '').toLowerCase();
    if (c === 'starter' || c === 'basic') return 'express';
    if (c === 'growth' || c === 'standard' || c === 'pro') return 'serve';
    if (c === 'enterprise' || c === 'scale') return 'command';
    return c || 'serve';
  }
  /** Account status for staff: approved ≡ Active (one vocabulary with modal). */
  function formatAccountStatus(status) {
    const s = String(status || 'active').toLowerCase();
    const map = {
      approved: 'Active',
      active: 'Active',
      pending: 'Pending',
      suspended: 'Suspended',
      trial: 'Trial',
      past_due: 'Past due',
      canceled: 'Canceled',
      cancelled: 'Canceled',
    };
    return map[s] || titleCaseWords(s.replace(/_/g, ' '));
  }
  function formatDisplayName(name) {
    return titleCaseWords(name || 'Unknown') || 'Unknown';
  }
  function formatOutletType(type) {
    return titleCaseWords(String(type || 'restaurant').replace(/_/g, ' ')) || 'Restaurant';
  }
  function formatDateIN(value) {
    if (!value) {return '—';}
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {return '—';}
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatDateTimeIN(value) {
    if (!value) {return '—';}
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {return '—';}
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function platformSummaryEl() {
    return document.querySelector('#super-admin-tab #saas-platform-summary')
      || document.getElementById('saas-platform-summary');
  }

let superAdminFilter = 'all';
let superAdminSearch = '';
const superAdminSort = { col: 'joined', dir: 'desc' };
let _cachedTenants = [];
let selectedTenantIds = new Set();
const saasGatewayPollingInterval = null;

function tenantSearchInputs() {
  return [
    document.querySelector('.tb-search input'),
    document.getElementById('tenant-search-input'),
  ].filter(Boolean);
}

function syncTenantSearchInputs(value) {
  tenantSearchInputs().forEach(input => {
    if (input.value !== value) {input.value = value;}
  });
}

function readVisibleTenantSearch() {
  const inline = document.getElementById('tenant-search-input');
  const topbar = document.querySelector('.tb-search input');
  return String((inline && inline.value) || (topbar && topbar.value) || '');
}

function escHtml(str) {
  if (!str) {return '';}
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatIncidentTime(value) {
  if (!value) {return 'Unknown time';}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return 'Unknown time';}
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
  const target = platformSummaryEl();
  if (!target) {return;}
  const total = tenants.length;
  const active = tenants.filter(t => t.status === 'approved' || t.status === 'active').length;
  const pending = tenants.filter(t => t.status === 'pending').length;
  const paidTiers = tenants.filter((t) => isPaidTenant(t)).length;
  const trials = tenants.filter((t) => isTrialTenant(t)).length;
  const risk = tenants.filter((t) =>
    ['past_due', 'canceled', 'cancelled', 'expired'].includes(String(t.subscription_status || '').toLowerCase()) ||
    t.billing_kind === 'risk'
  ).length;
  const conversion = total ? Math.round((paidTiers / total) * 100) : 0;
  const totalMrrFixed = tenants.reduce((sum, t) => sum + tenantMrr(t), 0);
  const mrrDisplay = totalMrrFixed > 0 ? rs(totalMrrFixed) : '₹0';
  const mrrSub = totalMrrFixed > 0
    ? `${paidTiers} paid · ${trials} trial`
    : (trials ? `${trials} on trial · ₹0 MRR` : 'no paid yet');
  target.innerHTML = [
    saasSnapshotCard('Workspaces', total, `${active} active · ${pending} pending`, 'fa-solid fa-store', 'all', superAdminFilter === 'all'),
    saasSnapshotCard('Pending', pending, pending ? 'Needs review' : 'Queue clear', 'fa-solid fa-user-clock', 'pending', superAdminFilter === 'pending'),
    saasSnapshotCard('Paid plans', `${conversion}%`, `${paidTiers} of ${total} converted`, 'fa-solid fa-chart-pie', 'paid', superAdminFilter === 'paid'),
    saasSnapshotCard('At risk', risk, 'Past-due, expired or canceled', 'fa-solid fa-triangle-exclamation', 'risk', superAdminFilter === 'risk'),
    saasSnapshotCard('Platform MRR', mrrDisplay, mrrSub, 'fa-solid fa-indian-rupee-sign', 'mrr', superAdminFilter === 'mrr')
  ].join('');

  // Inline mini reports under summary
  try { renderInlinePlatformReports(tenants); } catch (_) {}

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
  if (!all) {return;}
  const visibleIds = visibleTenants.map(getTenantRowId).filter(Boolean);
  const selectedVisible = visibleIds.filter(id => selectedTenantIds.has(id)).length;
  all.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  all.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  all.disabled = visibleIds.length === 0;
}

// Render tenant table from cached data (no network call)
function renderTenantTable() {
  const tbody = $('#tenant-table-body');
  if (!tbody) {return;}
  pruneTenantSelection();
  // Local colors only — never rely on dashboard closure (module is strict IIFE).
  const avatarColors = getAvatarColors();
  const colorAt = (seed) => {
    const n = avatarColors.length || 1;
    return avatarColors[Math.abs(Number(seed) || 0) % n];
  };
  superAdminSearch = readVisibleTenantSearch();
  syncTenantSearchInputs(superAdminSearch);

  let filtered = _cachedTenants.slice();

  // Status filter
  if (superAdminFilter === 'pending') {filtered = filtered.filter(t => t.status === 'pending');}
  else if (superAdminFilter === 'paid') {
    filtered = filtered.filter((t) => isPaidTenant(t));
  }
  else if (superAdminFilter === 'risk') {
    filtered = filtered.filter(t =>
      ['past_due', 'canceled', 'cancelled', 'expired'].includes(String(t.subscription_status || '').toLowerCase()) ||
      t.billing_kind === 'risk'
    );
  }

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
    else if (col === 'mrr') { va = tenantMrr(a); vb = tenantMrr(b); }
    else if (col === 'outlets') { va = Number(a.outlet_count) || 1; vb = Number(b.outlet_count) || 1; }
    else if (col === 'joined') { va = a.created_at || ''; vb = b.created_at || ''; }
    else if (col === 'status') { va = (a.status || '').toLowerCase(); vb = (b.status || '').toLowerCase(); }
    else if (col === 'renews') { va = a.subscription_current_period_end || ''; vb = b.subscription_current_period_end || ''; }
    else { va = a.created_at || ''; vb = b.created_at || ''; }
    if (va < vb) {return dir === 'asc' ? -1 : 1;}
    if (va > vb) {return dir === 'asc' ? 1 : -1;}
    return 0;
  });

  // Update count badge
  const countEl = document.getElementById('tenant-count');
  if (countEl) {countEl.textContent = `${filtered.length} of ${_cachedTenants.length}`;}

  // Update sort headers
  document.querySelectorAll('th[data-sort-col]').forEach(th => {
    const c = th.getAttribute('data-sort-col');
    const icon = th.querySelector('.sort-icon');
    if (!icon) {return;}
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
    const planLabel = formatPlanLabel(t.plan_code, t.plan_name);
    const planC = canonPlanCode(t.plan_code);
    const isChain = planC === 'command' || (t.plan_code || '').toLowerCase() === 'chain';
    const isGrowth = planC === 'serve';
    const pillCls = isChain ? 'pill-violet' : isGrowth ? 'pill-orange' : '';
    const statusKey = (t.status || 'active').toLowerCase();
    const onTrial = isTrialTenant(t);
    const statusCls = onTrial ? 't-trial' : (tStatus[statusKey] || 't-active');
    const statusText = onTrial ? 'Trial' : formatAccountStatus(t.status || 'active');
    const joined = formatDateIN(t.created_at);
    const mrr = tenantMrr(t);
    const rawName = t.name || t.tenant_name || t.slug || 'Unknown';
    const name = formatDisplayName(rawName);
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
      ? `<button class="icon-act quick-seed-btn" title="Load demo data (one click)" data-tid="${_e(t.id||'')}" data-tname="${_e(rawName)}" style="font-size:13px;color:#16a34a"><i class="fa-solid fa-seedling"></i></button>`
      : '';
    // Renews-on (paid-until) cell with colour: red=expired, amber=<=7 days, green=fine.
    const rawEnd = t.subscription_current_period_end;
    let renewsCell;
    if (!rawEnd) {
      renewsCell = '<span style="color:var(--text-mute)" title="No renewal date set">—</span>';
    } else {
      const end = new Date(rawEnd);
      const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000);
      const dateStr = formatDateIN(rawEnd);
      const color = daysLeft < 0 ? '#dc2626' : (daysLeft <= 7 ? '#d97706' : '#16a34a');
      const label = daysLeft < 0 ? (dateStr + ' (expired)') : (daysLeft <= 7 ? (dateStr + ' (' + daysLeft + 'd)') : dateStr);
      renewsCell = `<span style="color:${color};font-weight:600;white-space:nowrap">${_e(label)}</span>`;
    }
    const mrrCell = mrr > 0
      ? `<span title="Monthly recurring from paid conversion">${rs(mrr)}</span>`
      : (onTrial
        ? '<span style="color:var(--text-mute)" title="On trial — not counted in MRR">₹0</span>'
        : '<span style="color:var(--text-mute)" title="No active paid plan">₹0</span>');
    // Actions order: Manage · Open · Seed · Suspend (primary first)
    return `<tr class="tenant-row ${selected ? 'tenant-row-selected' : ''}" data-tid="${_e(tenantId)}" style="cursor:pointer">
      <td><div class="tenant-outlet-cell"><input type="checkbox" class="tenant-checkbox tenant-row-checkbox" data-tid="${_e(tenantId)}" aria-label="Select ${_e(name)}" ${selected ? 'checked' : ''}><div class="avatar-sm" style="background:${colorAt(rawName.length)}">${_e(initials(rawName))}</div><div><b>${_e(name)}</b><div style="font-size:11px;color:var(--text-mute)">${_e(slug)}</div></div></div></td>
      <td><span class="pill ${_e(pillCls)}" style="padding:3px 9px">${_e(planLabel)}</span></td>
      <td class="td-strong">${mrrCell}</td>
      <td>${_e(t.outlet_count || 1)}</td>
      <td>${_e(joined)}</td>
      <td><span class="tenant-status ${_e(statusCls)}">${_e(statusText)}</span></td>
      <td>${renewsCell}</td>
      <td>
        <div class="row-actions" style="gap:5px" onclick="event.stopPropagation()">
          ${approveBtn}
          <button class="icon-act manage-tenant-btn" title="Manage workspace" data-tid="${_e(t.id||'')}" style="font-size:13px"><i class="fa-solid fa-gear"></i></button>
          ${dashboardBtn}
          ${seedBtn}
          ${suspendBtn}
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
      if (!tid) {return;}
      if (cb.checked) {selectedTenantIds.add(tid);}
      else {selectedTenantIds.delete(tid);}
      renderTenantTable();
    });
  });

  // Bind quick-approve buttons
  tbody.querySelectorAll('.quick-approve-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute('data-tid');
      const t = _cachedTenants.find(x => String(x.id) === String(tid));
      if (!t) {return;}
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'update_tenant', tenant_id: tid, status: 'approved' });
        t.status = 'approved';
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast(`${t.name || 'Workspace'} approved!`, 'fa-circle-check');
        renderPlatformSummary(_cachedTenants);
        renderTenantTable();
      } catch (err) {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
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
      if (!tid) {return;}
      const ok = window.confirm(
        'Load demo menu/inventory/bills into "' + tname + '"?\n\nExisting operational data for this workspace will be reset.'
      );
      if (!ok) {return;}
      const prev = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'seed_tenant_data', tenant_id: tid });
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast('Demo data loaded for ' + tname, 'fa-seedling');
        await renderSuper();
      } catch (err) {
        console.error(err);
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
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
      if (!t) {return;}
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'update_tenant', tenant_id: tid, status: 'suspended',
          username: t.username, plan_code: t.plan_code || 'starter',
          subscription_status: t.subscription_status || 'active',
          allowed_tabs: t.allowed_tabs || [], phone: t.phone || '', email: t.email || '' });
        t.status = 'suspended';
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast(`${t.name || 'Workspace'} suspended.`, 'fa-ban');
        renderPlatformSummary(_cachedTenants); renderTenantTable(); updateBulkBar();
      } catch (err) {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
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
      if (!t) {return;}
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        await RS_API.admin({ action: 'update_tenant', tenant_id: tid, status: 'approved',
          username: t.username, plan_code: t.plan_code || 'starter',
          subscription_status: t.subscription_status || 'active',
          allowed_tabs: t.allowed_tabs || [], phone: t.phone || '', email: t.email || '' });
        t.status = 'approved';
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast(`${t.name || 'Workspace'} reactivated!`, 'fa-rotate-left');
        renderPlatformSummary(_cachedTenants); renderTenantTable(); updateBulkBar();
      } catch (err) {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
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
      const openDash = global.openTenantDashboard || (typeof window !== 'undefined' && window.openTenantDashboard);
      if (typeof openDash !== 'function') {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
        toast('Open workspace is not loaded. Hard-refresh the page (Ctrl+Shift+R).', 'fa-circle-exclamation');
        return;
      }
      openDash(tenant, btn);
    });
  });

  tbody.querySelectorAll('.manage-tenant-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tenantId = btn.getAttribute('data-tid');
      const tenant = _cachedTenants.find(t => String(t.id) === String(tenantId));
      if (tenant) {openTenantManageModal(tenant);}
      else {toast('Tenant details not found.', 'fa-circle-exclamation');}
    });
  });

  // Click row (outside actions) to open manage modal
  tbody.querySelectorAll('tr.tenant-row[data-tid]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('input, button, a, .row-actions')) {return;}
      const tenantId = row.getAttribute('data-tid');
      const tenant = _cachedTenants.find(t => String(t.id) === String(tenantId));
      if (tenant) {openTenantManageModal(tenant);}
    });
  });
}

let _superPollTimer = null;
async function pollSuperTenants() {
  try {
    if (!window.RS_API || !RS_API.configured) {return;}
    const body = document.getElementById('tenant-table-body');
    if (!body || body.offsetParent === null) {return;}
    if (document.visibilityState !== 'visible') {return;}
    const out = await RS_API.admin({ action: 'list_tenants' }).catch(() => null);
    if (out && out.plan_prices && typeof out.plan_prices === 'object') {
      _planPriceMap = out.plan_prices;
    }
    if (out && Array.isArray(out.tenants)) {
      _cachedTenants = out.tenants;
      renderPlatformSummary(_cachedTenants);
      renderTenantTable();
    }
  } catch (e) { /* quiet */ }
}
function startSuperPolling() {
  if (_superPollTimer) {return;}
  _superPollTimer = setInterval(pollSuperTenants, 30000);
}

async function renderSuper() {
  const tbody = $('#tenant-table-body');
  if (!tbody) {return;}
  superAdminSearch = readVisibleTenantSearch();
  syncTenantSearchInputs(superAdminSearch);
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
        new Promise(resolve => { setTimeout(() => resolve({ error: 'Tenant registry request timed out.', tenants: [] }), 10000); })
      ]);
      if (out && out.error) {console.warn('Superadmin tenant registry unavailable:', out.error);}
      if (out && out.plan_prices && typeof out.plan_prices === 'object') {
        _planPriceMap = out.plan_prices;
      }
      if (out && Array.isArray(out.tenants)) {_cachedTenants = out.tenants;}
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
      if (th.dataset.sortBound) {return;}
      th.dataset.sortBound = '1';
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const c = th.getAttribute('data-sort-col');
        if (superAdminSort.col === c) {superAdminSort.dir = superAdminSort.dir === 'asc' ? 'desc' : 'asc';}
        else { superAdminSort.col = c; superAdminSort.dir = 'asc'; }
        renderTenantTable();
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--red)"><i class="fa-solid fa-circle-exclamation" style="display:block;margin-bottom:8px"></i>${_e(err.message || 'Failed to load tenants')}</td></tr>`;
  }
}

// ── Bulk Actions ────────────────────────────────────────────────────────
function updateBulkBar() {
  const bar = document.getElementById('sa-bulk-bar');
  const label = document.getElementById('sa-bulk-label');
  const icon = document.getElementById('sa-bulk-icon');
  const selectionActions = document.getElementById('sa-selection-actions');
  const approveBtn = document.getElementById('sa-bulk-approve-btn');
  if (!bar || !label) {return;}
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
    if (selectionActions) {selectionActions.style.display = 'flex';}
    if (approveBtn) {approveBtn.style.display = 'none';}
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
    if (selectionActions) {selectionActions.style.display = 'none';}
    if (approveBtn) {approveBtn.style.display = 'inline-flex';}
  } else {
    bar.style.display = 'none';
    if (selectionActions) {selectionActions.style.display = 'none';}
    if (approveBtn) {approveBtn.style.display = 'inline-flex';}
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
        if (selectAll.checked) {selectedTenantIds.add(id);}
        else {selectedTenantIds.delete(id);}
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
  if (!pending.length) {return toast('No pending workspaces to approve.', 'fa-circle-info');}
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
  if (!selected.length) {return toast('Select clients to delete first.', 'fa-circle-info');}
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
      try { if (window.RSActionFeedback) {window.RSActionFeedback[done ? 'success' : 'error']();} } catch(_) {}
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
  if (!modal) {return;}
  // Clear form
  ['ct-name','ct-slug','ct-username','ct-password','ct-email','ct-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {el.value = '';}
  });
  const errEl = document.getElementById('ct-error');
  if (errEl) {errEl.style.display = 'none';}
  const autoApprove = document.getElementById('ct-auto-approve');
  if (autoApprove) {autoApprove.checked = true;}

  // Auto-generate slug and username from name
  const nameEl = document.getElementById('ct-name');
  const slugEl = document.getElementById('ct-slug');
  const userEl = document.getElementById('ct-username');
  if (nameEl && !nameEl.dataset.slugWired) {
    nameEl.dataset.slugWired = '1';
    nameEl.addEventListener('input', () => {
      const base = nameEl.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (slugEl) {slugEl.value = base;}
      if (userEl) {userEl.value = base ? base + '-admin' : '';}
    });
  }

  if (!modal.dataset.eventsBound) {
    modal.dataset.eventsBound = '1';
    document.getElementById('close-create-tenant-modal').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('ct-cancel-btn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) {modal.classList.remove('active');} });

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

      if (!name) {return showErr('Business name is required.');}
      if (!slug || !/^[a-z0-9-]+$/.test(slug)) {return showErr('Slug must be lowercase letters, numbers and hyphens only.');}
      if (!username) {return showErr('Admin username is required.');}
      if (!password || password.length < 10) {return showErr('Password must be at least 10 characters.');}

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
              // New workspaces start on trial until Super-Admin activates paid (or Razorpay converts)
              const trialEnd = new Date(Date.now() + 30 * 86400000).toISOString();
              await RS_API.admin({ action: 'update_tenant', tenant_id: newTenant.id, status: 'approved',
                username, plan_code, subscription_status: 'trialing',
                subscription_current_period_end: trialEnd,
                allowed_tabs: newTenant.allowed_tabs || [], phone, email });
              newTenant.status = 'approved';
              newTenant.plan_code = plan_code;
              newTenant.subscription_status = 'trialing';
              newTenant.subscription_current_period_end = trialEnd;
              newTenant.is_trial = true;
              newTenant.billing_kind = 'trial';
              newTenant.mrr = 0;
            }
            _cachedTenants = allTenants;
          } catch(e) { /* approval failed silently — tenant still created */ }
        }
        modal.classList.remove('active');
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast(`Workspace "${name}" created${autoApproveChecked ? ' & approved' : ' (pending approval)'}!`, 'fa-store');
        renderPlatformSummary(_cachedTenants);
        renderTenantTable();
        updateBulkBar();
      } catch (err) {
        try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
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
  m.addEventListener('click', e => { if (e.target === m) {m.remove();} });
  const body = m.querySelector('#rs-pricing-body');
  let plans = [];
  try {
    const out = await RS_API.admin({ action: 'list_plans' });
    plans = (out && out.plans) || [];
    // Seed live price map so Platform MRR matches editable catalogue
    if (plans.length) {
      if (!_planPriceMap) _planPriceMap = {};
      plans.forEach((p) => {
        if (p && p.plan_code != null) _planPriceMap[String(p.plan_code)] = Number(p.price_monthly) || 0;
      });
    }
  }
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
      try {
        await RS_API.admin(payload);
        // Keep in-memory MRR catalogue in sync with saved price
        if (!_planPriceMap) _planPriceMap = {};
        _planPriceMap[payload.plan_code] = payload.price_monthly;
        const alias = payload.plan_code === 'express' ? 'starter'
          : payload.plan_code === 'serve' ? 'growth'
            : payload.plan_code === 'command' ? 'enterprise'
              : payload.plan_code === 'starter' ? 'express'
                : payload.plan_code === 'growth' ? 'serve'
                  : payload.plan_code === 'enterprise' ? 'command' : null;
        if (alias) _planPriceMap[alias] = payload.price_monthly;
        // Recompute row mrr from new catalogue when server mrr not yet refreshed
        _cachedTenants = _cachedTenants.map((t) => ({
          ...t,
          mrr: tenantMrr({ ...t, mrr: 0 }),
        }));
        renderPlatformSummary(_cachedTenants);
        renderTenantTable();
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch (_) {}
        toast('Plan pricing updated.', 'fa-circle-check');
      }
      catch (e) { try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {} toast('Failed: ' + (e.message || 'error'), 'fa-circle-exclamation'); }
      finally { btn.disabled = false; btn.textContent = orig; }
    });
  });
}

async function loadTenantDevices(tenantId) {
  const box = document.getElementById('manage-devices-box');
  if (!box) {return;}
  if (!tenantId) { box.textContent = 'Save the workspace first to see licensed devices.'; return; }
  box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading devices…';
  let devices = [];
  try { const out = await RS_API.admin({ action: 'list_devices', tenant_id: tenantId }); devices = (out && out.devices) || []; }
  catch (e) { box.innerHTML = '<span style="color:#dc2626">Could not load devices (' + _e(e.message || 'error') + ').</span>'; return; }
  if (!devices.length) { box.innerHTML = '<span style="color:var(--text-mute)">No devices have activated a licence yet.</span>'; return; }
  const rel = (iso) => { if (!iso) {return '—';} const ms = Date.now() - new Date(iso).getTime(); const d = Math.floor(ms/86400000); if (d>0) {return d+'d ago';} const h=Math.floor(ms/3600000); if(h>0) {return h+'h ago';} const mi=Math.floor(ms/60000); return mi>0?mi+'m ago':'just now'; };
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
        try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
        toast(act === 'revoke_device' ? 'Device revoked — it will lock within the offline window.' : 'Device restored.', 'fa-circle-check');
        loadTenantDevices(tenantId);
      } catch (e) { btn.disabled = false; try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {} toast('Failed: ' + (e.message || 'error'), 'fa-circle-exclamation'); }
    });
  });
}

function openTenantManageModal(tenant) {
  try {
    const modal = document.getElementById('tenant-manage-modal');
    if (!modal) {return;}

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

    const rawName = tenant.name || tenant.tenant_name || 'Unknown';
    const displayName = formatDisplayName(rawName);
    if (tenantNameEl) {tenantNameEl.textContent = displayName;}
    const typeChip = document.getElementById('manage-outlet-type');
    if (typeChip) {
      typeChip.textContent = formatOutletType(tenant.outlet_type || tenant.business_type || 'restaurant');
      typeChip.style.display = '';
    }
    if (avatarEl) {avatarEl.textContent = initials(rawName) || 'U';}

    if (statusBadge) {
      const s = String(tenant.status || 'pending').toLowerCase();
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

    if (usernameEl) {usernameEl.value = tenant.username || '';}
    if (passwordEl) {passwordEl.value = '';}
    if (statusEl) {
      statusEl.value = tenant.status === 'approved' ? 'approved' : (tenant.status || 'pending');
    }
    if (phoneEl) {phoneEl.value = tenant.phone || '';}
    if (emailEl) {emailEl.value = tenant.email || '';}
    if (planCodeEl) {planCodeEl.value = canonPlanCode(tenant.plan_code || 'serve');}
    if (subscriptionStatusEl) {
      const ss = String(tenant.subscription_status || 'active').toLowerCase();
      subscriptionStatusEl.value = ss === 'cancelled' ? 'canceled' : ss;
    }
    const intervalEl = document.getElementById('manage-billing-interval');
    if (intervalEl) {
      intervalEl.value = String(tenant.billing_interval || 'monthly').toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
    }
    const periodEndEl = document.getElementById('manage-period-end');
    if (periodEndEl) {
      try { periodEndEl.value = tenant.subscription_current_period_end ? new Date(tenant.subscription_current_period_end).toISOString().slice(0,10) : ''; }
      catch (e) { periodEndEl.value = ''; }
    }
    loadTenantDevices(tenant.id);
    if (window.__rsDeviceTimer) {clearInterval(window.__rsDeviceTimer);}
    window.__rsDeviceTimer = setInterval(function () {
      const box = document.getElementById('manage-devices-box');
      if (!box || box.offsetParent === null) { clearInterval(window.__rsDeviceTimer); window.__rsDeviceTimer = null; return; }
      loadTenantDevices(tenant.id);
    }, 15000);
    // Notes: prefer server admin_notes; fall back to local cache for pre-migration installs
    const notesEl = document.getElementById('manage-notes');
    if (notesEl) {
      let local = '';
      try { local = localStorage.getItem(`sa-note-${tenant.id}`) || ''; } catch (e) { local = ''; }
      notesEl.value = (tenant.admin_notes != null && String(tenant.admin_notes)) || local || '';
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
          .then(() => { try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {} toast('Login URL copied!', 'fa-link'); })
          .catch(() => prompt('Copy tenant login URL:', url));
      };
    }

    const openDashboardBtn = document.getElementById('manage-open-dashboard-btn');
    if (openDashboardBtn) {
      const canOpen = !['pending', 'suspended'].includes(String(tenant.status || '').toLowerCase());
      openDashboardBtn.disabled = !canOpen;
      openDashboardBtn.title = canOpen ? 'Open this workspace dashboard' : 'Only active workspaces can be opened';
      openDashboardBtn.onclick = () => {
        const openDash = global.openTenantDashboard || (typeof window !== 'undefined' && window.openTenantDashboard);
        if (typeof openDash !== 'function') {
          toast('Open workspace is not loaded. Hard-refresh the page (Ctrl+Shift+R).', 'fa-circle-exclamation');
          return;
        }
        openDash(tenant, openDashboardBtn);
      };
    }

    modal.classList.add('active');
  } catch (err) {
    console.error(err);
    toast('Failed to render management controls.', 'fa-circle-exclamation');
  }
}

function closeTenantModal() {
  const modal = document.getElementById('tenant-manage-modal');
  if (modal) {modal.classList.remove('active');}
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
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-size:14px;padding:10px 0;border-top:1px dashed var(--stroke)">
              <div style="min-width:0">
                <div style="font-weight:600"><i class="fa-solid fa-shield-halved" style="width:16px;margin-right:6px;color:var(--orange)"></i>UI copy shield</div>
                <div style="font-size:11.5px;color:var(--text-mute);margin-top:4px;line-height:1.45">Blocks right-click, F12, and Inspect shortcuts on staff consoles. Always on for restaurants — only Super-Admin can change this on this browser.</div>
              </div>
              <button type="button" id="sa-ui-shield-toggle" class="btn btn-sm" style="min-width:96px;flex-shrink:0">…</button>
            </div>
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
    m.addEventListener('click', e => { if (e.target === m) {m.remove();} });
    const themeBtn = document.getElementById('sa-theme-toggle');
    if (themeBtn) {themeBtn.onclick = () => {
      const tt = document.getElementById('theme-toggle');
      if (tt) {tt.click();}
      m.remove();
    };}
    const sbBtn = document.getElementById('sa-sidebar-toggle');
    if (sbBtn) {sbBtn.onclick = () => {
      const sb = document.getElementById('sb-collapse');
      if (sb) {sb.click();}
      m.remove();
    };}
    // UI copy shield — Super-Admin only (never shown on outlet Settings)
    const shieldBtn = document.getElementById('sa-ui-shield-toggle');
    const paintShieldBtn = () => {
      if (!shieldBtn) {return;}
      const on = !(window.RSSecurityShield && RSSecurityShield.getConfig)
        ? true
        : !!(RSSecurityShield.getConfig().enabled);
      shieldBtn.className = on ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
      shieldBtn.innerHTML = on
        ? '<i class="fa-solid fa-lock"></i> On'
        : '<i class="fa-solid fa-lock-open"></i> Off';
      shieldBtn.title = on
        ? 'Shield is ON — click to disable on this Super-Admin browser only'
        : 'Shield is OFF on this browser — click to re-enable';
    };
    paintShieldBtn();
    if (shieldBtn) {
      shieldBtn.onclick = () => {
        if (!window.RSSecurityShield || typeof RSSecurityShield.setEnabled !== 'function') {
          toast('Security shield module not loaded. Hard-refresh the page.', 'fa-circle-exclamation');
          return;
        }
        if (typeof RSSecurityShield.canToggle === 'function' && !RSSecurityShield.canToggle()) {
          toast('Only Super-Admin can change the UI copy shield.', 'fa-shield-halved');
          return;
        }
        const cur = !!(RSSecurityShield.getConfig && RSSecurityShield.getConfig().enabled);
        const ok = RSSecurityShield.setEnabled(!cur);
        if (!ok) {
          toast('Only Super-Admin can change the UI copy shield.', 'fa-shield-halved');
          return;
        }
        if (typeof RSSecurityShield.install === 'function') {RSSecurityShield.install();}
        paintShieldBtn();
        toast(
          !cur ? 'UI copy shield enabled (this Super-Admin browser).' : 'UI copy shield disabled on this Super-Admin browser only. Restaurant accounts stay protected.',
          'fa-shield-halved'
        );
      };
    }
    const expBtn = document.getElementById('sa-export-btn');
    if (expBtn) {expBtn.onclick = () => {
      m.remove();
      const exportBtn2 = document.getElementById('btn-export-tenants');
      if (exportBtn2) {exportBtn2.click();}
    };}
    const logoutBtn = document.getElementById('sa-settings-logout');
    if (logoutBtn) {logoutBtn.onclick = () => {
      m.remove();
      if (window.RS_API) {RS_API.logout();}
      location.href = 'login';
    };}
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
  m.addEventListener('click', e => { if (e.target === m) {m.remove();} });
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
        const billing_interval = (document.getElementById('manage-billing-interval') || {}).value || 'monthly';
        const periodEndRaw = (document.getElementById('manage-period-end') || {}).value || '';

        const allowed_tabs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

        const updates = {
          tenant_id: tenantId,
          username,
          status,
          plan_code,
          subscription_status,
          billing_interval,
          allowed_tabs,
          phone,
          email
        };
        updates.subscription_current_period_end = periodEndRaw ? new Date(periodEndRaw + 'T23:59:59Z').toISOString() : '';

        if (password !== '') {
          if (password.length < 10) {
            toast('Password must be at least 10 characters.', 'fa-circle-exclamation');
            return;
          }
          updates.password = password;
        }

        // Server-side notes (+ local mirror for offline/pre-migration)
        const notesVal = (document.getElementById('manage-notes') || {}).value || '';
        updates.admin_notes = notesVal;
        try { localStorage.setItem(`sa-note-${tenantId}`, notesVal); } catch (e) {}

        await RS_API.admin({ action: 'update_tenant', ...updates });
        // Update cache so table reflects status/plan change immediately
        const idx = _cachedTenants.findIndex(t => String(t.id) === String(tenantId));
        if (idx !== -1) {
          Object.assign(_cachedTenants[idx], {
            username, status, plan_code, subscription_status, billing_interval, phone, email, allowed_tabs,
            subscription_current_period_end: updates.subscription_current_period_end || null,
            admin_notes: notesVal,
            mrr: tenantMrr({
              plan_code, subscription_status, billing_interval, mrr: 0,
            }),
          });
        }
        closeTenantModal();
        renderPlatformSummary(_cachedTenants);
        renderTenantTable();
        toast('Client configurations saved successfully!');
      } catch (err) {
        console.error(err);
        toast('Error saving settings: ' + err.message, 'fa-circle-exclamation');
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
        if (!t) {return;}
        saveFeaturesBtn.disabled = true; saveFeaturesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
        await RS_API.admin({ action: 'update_tenant', tenant_id: tenantId,
          username: t.username, status: t.status, plan_code: canonPlanCode(t.plan_code || 'serve'),
          subscription_status: t.subscription_status || 'active',
          allowed_tabs, phone: t.phone || '', email: t.email || '' });
        if (t) {t.allowed_tabs = allowed_tabs;}
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

  // Super-admin quick plan/trial actions
  async function quickBillingAction(kind) {
    const tenantId = (document.getElementById('manage-tenant-id') || {}).value;
    const t = _cachedTenants.find(x => String(x.id) === String(tenantId));
    if (!t || !tenantId) { toast('No workspace selected', 'fa-circle-info'); return; }
    const plan_code = (document.getElementById('manage-plan-code') || {}).value || canonPlanCode(t.plan_code) || 'serve';
    const billing_interval = (document.getElementById('manage-billing-interval') || {}).value || 'monthly';
    const now = Date.now();
    let subscription_status = 'active';
    let endMs = now;
    const existingEnd = t.subscription_current_period_end ? new Date(t.subscription_current_period_end).getTime() : 0;
    if (Number.isFinite(existingEnd) && existingEnd > now) endMs = existingEnd;

    if (kind === 'trial') {
      subscription_status = 'trialing';
      endMs = now + 30 * 86400000;
    } else if (kind === 'plus7') {
      endMs = endMs + 7 * 86400000;
      subscription_status = t.subscription_status === 'trialing' ? 'trialing' : 'active';
    } else if (kind === 'plus30') {
      endMs = endMs + 30 * 86400000;
      subscription_status = t.subscription_status === 'trialing' ? 'trialing' : 'active';
    } else if (kind === 'activate') {
      subscription_status = 'active';
      // if already expired, give a full month/year from now
      if (!(Number.isFinite(existingEnd) && existingEnd > now)) {
        endMs = now + (billing_interval === 'yearly' ? 365 : 30) * 86400000;
      }
    }
    const subscription_current_period_end = new Date(endMs).toISOString();
    try {
      await RS_API.admin({
        action: 'update_tenant',
        tenant_id: tenantId,
        username: t.username,
        status: 'approved',
        plan_code: kind === 'trial' ? 'serve' : plan_code,
        subscription_status,
        billing_interval: kind === 'trial' ? 'monthly' : billing_interval,
        subscription_current_period_end,
        phone: t.phone || '',
        email: t.email || '',
        // Marks paid conversion so metrics stop treating this as trial
        mark_paid: kind === 'activate',
        activate_paid: kind === 'activate',
      });
      Object.assign(t, {
        status: 'approved',
        plan_code: kind === 'trial' ? 'serve' : plan_code,
        subscription_status,
        billing_interval: kind === 'trial' ? 'monthly' : billing_interval,
        subscription_current_period_end,
        trial_started_at: kind === 'trial' ? (t.trial_started_at || new Date().toISOString()) : t.trial_started_at,
        subscription_activated_at: kind === 'activate' ? new Date().toISOString() : t.subscription_activated_at,
        is_trial: kind === 'trial',
        is_paid: kind === 'activate',
        billing_kind: kind === 'activate' ? 'paid' : (kind === 'trial' ? 'trial' : t.billing_kind),
        mrr: 0,
      });
      if (kind === 'activate') {
        t.mrr = tenantMrr({ ...t, mrr: 0, is_paid: true, billing_kind: 'paid', subscription_status: 'active' });
      }
      // Reflect in modal fields
      const pe = document.getElementById('manage-period-end');
      if (pe) pe.value = new Date(endMs).toISOString().slice(0, 10);
      const ss = document.getElementById('manage-subscription-status');
      if (ss) ss.value = subscription_status;
      const pc = document.getElementById('manage-plan-code');
      if (pc && kind === 'trial') pc.value = 'serve';
      renderPlatformSummary(_cachedTenants);
      renderTenantTable();
      toast(
        kind === 'trial' ? '30-day Serve trial granted' :
        kind === 'activate' ? 'Marked active paid' :
        kind === 'plus7' ? '+7 days applied' : '+30 days applied',
        'fa-circle-check'
      );
    } catch (err) {
      toast('Failed: ' + (err.message || 'error'), 'fa-circle-exclamation');
    }
  }
  [
    ['manage-grant-trial-btn', 'trial'],
    ['manage-extend-7-btn', 'plus7'],
    ['manage-extend-30-btn', 'plus30'],
    ['manage-activate-paid-btn', 'activate'],
  ].forEach(([id, kind]) => {
    const btn = document.getElementById(id);
    if (btn && !btn.dataset.listenerBound) {
      btn.dataset.listenerBound = 'true';
      btn.addEventListener('click', () => quickBillingAction(kind));
    }
  });
}

function renderInlinePlatformReports(tenants) {
  const box = document.getElementById('sa-inline-reports');
  if (!box) return;
  const list = Array.isArray(tenants) ? tenants : _cachedTenants;
  const byPlan = { express: 0, serve: 0, command: 0, other: 0 };
  let trialN = 0;
  let paidN = 0;
  let riskN = 0;
  list.forEach((t) => {
    const p = canonPlanCode(t.plan_code);
    if (byPlan[p] != null) byPlan[p]++; else byPlan.other++;
    if (isTrialTenant(t)) trialN++;
    else if (isPaidTenant(t)) paidN++;
    else if (
      ['past_due', 'canceled', 'cancelled', 'expired'].includes(String(t.subscription_status || '').toLowerCase()) ||
      t.billing_kind === 'risk'
    ) riskN++;
  });
  const card = (label, val, sub) =>
    `<div style="border:1px solid var(--stroke);border-radius:10px;padding:10px 12px;background:var(--panel)">
      <div style="font-size:11px;color:var(--text-mute);font-weight:700;text-transform:uppercase;letter-spacing:.04em">${_e(label)}</div>
      <div style="font-size:18px;font-weight:800;margin-top:4px">${_e(String(val))}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-mute);margin-top:2px">${_e(sub)}</div>` : ''}
    </div>`;
  box.innerHTML = [
    card('Express', byPlan.express, 'counter plans'),
    card('Serve', byPlan.serve, 'floor plans'),
    card('Command', byPlan.command, 'full ops'),
    card('Trials', trialN, 'free / not converted'),
    card('Paid active', paidN, 'billing OK'),
    card('Expired / risk', riskN, 'need attention'),
  ].join('');
  const openBtn = document.getElementById('sa-open-reports-btn');
  if (openBtn && !openBtn.dataset.bound) {
    openBtn.dataset.bound = '1';
    openBtn.onclick = () => {
      if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('sa-reports-tab');
      else {
        const link = document.querySelector('[data-tab="sa-reports-tab"]');
        if (link) link.click();
      }
    };
  }
  // Inject Ads Portal shortcut once next to reports
  try {
    const head = document.querySelector('#super-admin-tab .panel-head');
    if (head && !document.getElementById('sa-open-ads-btn')) {
      const adsBtn = document.createElement('button');
      adsBtn.type = 'button';
      adsBtn.className = 'btn btn-primary btn-sm';
      adsBtn.id = 'sa-open-ads-btn';
      adsBtn.title = 'WhatsApp ads portal';
      adsBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> WA Ads';
      adsBtn.onclick = () => {
        if (global.RS && typeof RS.activateTab === 'function') RS.activateTab('sa-ads-tab');
        else {
          const link = document.querySelector('[data-tab="sa-ads-tab"]');
          if (link) link.click();
        }
      };
      head.appendChild(adsBtn);
    }
  } catch (_) {}
}

function renderPlatformReports() {
  const tenants = _cachedTenants.slice();
  const kpis = document.getElementById('sa-reports-kpis');
  const planMix = document.getElementById('sa-reports-plan-mix');
  const health = document.getElementById('sa-reports-billing-health');
  const expBody = document.getElementById('sa-reports-expiring-body');
  const eventsEl = document.getElementById('sa-reports-events');
  if (!kpis) return;

  let mrr = 0;
  const byPlan = { express: 0, serve: 0, command: 0 };
  const bySub = { trialing: 0, active: 0, expired: 0, past_due: 0, canceled: 0 };
  const expiring = [];
  const now = Date.now();
  tenants.forEach((t) => {
    const p = canonPlanCode(t.plan_code);
    if (byPlan[p] != null) byPlan[p]++;
    if (isTrialTenant(t)) bySub.trialing++;
    else if (isPaidTenant(t)) bySub.active++;
    else {
      const s = String(t.subscription_status || '').toLowerCase();
      if (s === 'cancelled' || s === 'canceled') bySub.canceled++;
      else if (s === 'expired') bySub.expired++;
      else if (s === 'past_due') bySub.past_due++;
    }
    mrr += tenantMrr(t);
    if (t.subscription_current_period_end) {
      const end = new Date(t.subscription_current_period_end).getTime();
      const days = Math.ceil((end - now) / 86400000);
      if (days <= 14) expiring.push({ t, days, end });
    }
  });
  expiring.sort((a, b) => a.days - b.days);

  const kpi = (label, val, tone) =>
    `<div style="border:1px solid var(--stroke);border-radius:12px;padding:14px;background:var(--panel)">
      <div style="font-size:11px;font-weight:700;color:var(--text-mute);text-transform:uppercase">${_e(label)}</div>
      <div style="font-size:22px;font-weight:800;margin-top:6px;color:${tone || 'var(--text)'}">${_e(String(val))}</div>
    </div>`;
  kpis.innerHTML = [
    kpi('Workspaces', tenants.length),
    kpi('Platform MRR', rs(mrr), 'var(--orange)'),
    kpi('Trials', bySub.trialing, '#3b82f6'),
    kpi('Paid active', bySub.active, '#16a34a'),
    kpi('Expired', bySub.expired, '#dc2626'),
    kpi('Past due / canceled', bySub.past_due + bySub.canceled, '#b45309'),
  ].join('');

  const bar = (label, n, total, color) => {
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${_e(label)}</span><strong>${n} (${pct}%)</strong></div>
      <div style="height:8px;border-radius:99px;background:var(--bg);overflow:hidden"><div style="height:100%;width:${pct}%;background:${color};border-radius:99px"></div></div>
    </div>`;
  };
  if (planMix) {
    planMix.innerHTML = bar('Express', byPlan.express, tenants.length, '#64748b')
      + bar('Serve', byPlan.serve, tenants.length, 'var(--orange)')
      + bar('Command', byPlan.command, tenants.length, '#7c3aed');
  }
  if (health) {
    health.innerHTML = bar('Trialing', bySub.trialing, tenants.length, '#3b82f6')
      + bar('Active paid', bySub.active, tenants.length, '#16a34a')
      + bar('Expired', bySub.expired, tenants.length, '#dc2626')
      + bar('Past due', bySub.past_due, tenants.length, '#f59e0b')
      + bar('Canceled', bySub.canceled, tenants.length, '#94a3b8');
  }
  if (expBody) {
    if (!expiring.length) {
      expBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-mute)">No outlets ending in the next 14 days</td></tr>';
    } else {
      expBody.innerHTML = expiring.map(({ t, days }) => {
        const tone = days < 0 ? '#dc2626' : days <= 3 ? '#b45309' : 'var(--text)';
        return `<tr>
          <td><strong>${_e(formatDisplayName(t.name || t.slug))}</strong><div style="font-size:11px;color:var(--text-mute)">${_e(t.slug || '')}</div></td>
          <td>${_e(formatPlanLabel(t.plan_code))}</td>
          <td>${_e(formatAccountStatus(t.subscription_status || t.status))}</td>
          <td>${_e(formatDateIN(t.subscription_current_period_end))}</td>
          <td style="font-weight:800;color:${tone}">${days}</td>
          <td><button type="button" class="btn btn-ghost btn-sm sa-rep-manage" data-tid="${_e(t.id)}">Manage</button></td>
        </tr>`;
      }).join('');
      expBody.querySelectorAll('.sa-rep-manage').forEach((btn) => {
        btn.onclick = () => {
          const t = _cachedTenants.find(x => String(x.id) === String(btn.getAttribute('data-tid')));
          if (t) openTenantManageModal(t);
        };
      });
    }
  }

  // Recent billing events from saas_billing_events (live)
  if (eventsEl) {
    eventsEl.innerHTML = `<div style="color:var(--text-mute)"><i class="fa-solid fa-spinner fa-spin"></i> Loading billing events…</div>`;
    try {
      if (window.RS_API && typeof RS_API.admin === 'function') {
        RS_API.admin({ action: 'list_billing_events', limit: 20 }).then((out) => {
          const rows = (out && out.events) || [];
          if (!rows.length) {
            eventsEl.innerHTML = `<div style="color:var(--text-mute);font-size:12.5px;line-height:1.5">No billing events yet. Payments, renewals, and reminders will appear here automatically.</div>`;
            return;
          }
          eventsEl.innerHTML = rows.map((ev) => {
            const when = formatDateTimeIN(ev.created_at);
            const who = ev.tenant_name || ev.tenant_slug || '';
            return `<div style="padding:8px 0;border-bottom:1px solid var(--stroke);display:flex;justify-content:space-between;gap:10px">
              <span><strong>${_e(ev.event_type || 'event')}</strong>${who ? ' · ' + _e(who) : ''}${ev.channel ? ' · ' + _e(ev.channel) : ''}</span>
              <span style="color:var(--text-mute);white-space:nowrap">${_e(when)}</span>
            </div>`;
          }).join('');
        }).catch(() => {
          eventsEl.innerHTML = `<div style="color:var(--text-mute)">Billing events unavailable right now. Expiring list above is still live.</div>`;
        });
      } else {
        eventsEl.innerHTML = `<div style="color:var(--text-mute)">Sign in as Super-Admin to load billing events.</div>`;
      }
    } catch (_) {
      eventsEl.innerHTML = `<div style="color:var(--text-mute)">Could not load billing events.</div>`;
    }
  }

  const refresh = document.getElementById('sa-reports-refresh');
  if (refresh && !refresh.dataset.bound) {
    refresh.dataset.bound = '1';
    refresh.onclick = async () => {
      try {
        if (typeof pollSuperTenants === 'function') await pollSuperTenants();
        else if (typeof renderSuper === 'function') await renderSuper();
        renderPlatformReports();
        toast('Reports refreshed', 'fa-rotate');
      } catch (e) {
        toast('Refresh failed', 'fa-circle-exclamation');
      }
    };
  }
  const csvBtn = document.getElementById('sa-reports-export-csv');
  if (csvBtn && !csvBtn.dataset.bound) {
    csvBtn.dataset.bound = '1';
    csvBtn.onclick = () => {
      const rows = [['outlet', 'slug', 'plan', 'status', 'period_end', 'days']];
      expiring.forEach(({ t, days }) => {
        rows.push([
          t.name || '', t.slug || '', canonPlanCode(t.plan_code), t.subscription_status || '',
          t.subscription_current_period_end || '', String(days),
        ]);
      });
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = 'restrosuite-expiring-outlets.csv';
      a.click();
    };
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
    renderPlatformReports,
    openTenantManageModal,
    setSearch(q) {
      superAdminSearch = String(q || '');
      syncTenantSearchInputs(superAdminSearch);
      if (typeof renderTenantTable === 'function') {renderTenantTable();}
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
    if (!global.RS) {return;}
    global.RS.renderSuper = renderSuper;
  }
  if (global.RS) {attach();}
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
