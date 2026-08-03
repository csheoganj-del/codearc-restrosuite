/* ============================================================
   RestroSuite — Gateway monitor & app incidents (Wave 8)
   ============================================================ */
(function (global) {
  'use strict';

  let saasGatewayPollingInterval = null;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
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
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateTimeIN(value) {
    if (!value) {return '—';}
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {return '—';}
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function stripUuid(text) {
    return String(text || '').replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      'workspace'
    );
  }

  function humanizeGatewayEvent(event, details) {
    const ev = String(event || '').toUpperCase();
    const raw = stripUuid(details?.message || details?.error || details?.reason || '');
    const titles = {
      CONNECTED: 'WhatsApp connected',
      DISCONNECTED: 'Connection closed',
      SESSION_SAVED: 'Session backup saved',
      ALERT_SENT: 'Alert sent',
      APPROVAL_WHATSAPP_SENT: 'Approval sent via WhatsApp',
      APPROVAL_EMAIL_SKIPPED: 'Approval email skipped',
      APPROVAL_RECEIVED: 'Approval received',
      GATEWAY_SEND: 'Message sent',
      MESSAGE_SENT: 'Message sent',
      QR: 'Waiting for QR scan',
      READY: 'Gateway ready',
    };
    let title = titles[ev] || ev.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    let detail = raw;
    // Soften noisy stream errors
    if (/stream errored/i.test(detail)) {
      title = 'Connection interrupted';
      detail = 'WhatsApp stream dropped — reconnecting automatically when possible.';
    } else if (/session backup/i.test(detail) || /session saved/i.test(detail)) {
      const kb = detail.match(/([\d.]+)\s*KB/i);
      detail = kb ? `Backup size ${kb[1]} KB` : 'Session snapshot stored';
    } else if (detail.length > 90) {
      detail = detail.slice(0, 87) + '…';
    }
    const technical = `[${ev}] ${raw || 'System event'}`;
    return { title, detail, technical };
  }

  function friendlyErrorMessage(msg) {
    const m = String(msg || '').trim();
    if (!m || /^unknown/i.test(m)) {return 'Application error (no message captured)';}
    if (m.length > 140) {return m.slice(0, 137) + '…';}
    return m;
  }

  function shortPath(urlPath) {
    if (!urlPath) {return '';}
    const s = String(urlPath);
    if (s.includes('#')) {return '#' + s.split('#').pop();}
    try {
      const u = new URL(s, typeof location !== 'undefined' ? location.origin : 'https://local');
      return (u.pathname + u.hash) || s;
    } catch (_) {
      return s.length > 48 ? s.slice(0, 45) + '…' : s;
    }
  }

  function friendlyTenantLabel(slug) {
    if (!slug) {return 'Unknown workspace';}
    return String(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function updateGatewayKpis(logs, statusData) {
    const sentEl = document.getElementById('gw-sent-count');
    const rateEl = document.getElementById('gw-delivery-rate');
    const latEl = document.getElementById('gw-latency');
    const qEl = document.getElementById('gw-queued');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const list = Array.isArray(logs) ? logs : [];
    const sendLike = list.filter((log) => {
      const ev = String(log.event || '').toUpperCase();
      const t = log.created_at ? new Date(log.created_at) : null;
      if (!t || Number.isNaN(t.getTime()) || t < today) {return false;}
      return /SEND|SENT|ALERT|APPROVAL_WHATSAPP|DISPATCH|MESSAGE|SEND_AD|SEND_OTP/.test(ev);
    });
    const ok = sendLike.filter((l) => String(l.status || '').toLowerCase() === 'ok' || !l.status).length;
    const fail = sendLike.filter((l) => /err|fail|warn/i.test(String(l.status || ''))).length;
    if (sentEl) {sentEl.textContent = String(sendLike.length);}
    if (rateEl) {
      if (sendLike.length === 0) {rateEl.textContent = 'n/a';}
      else {
        const pct = Math.round((ok / Math.max(1, ok + fail)) * 100);
        rateEl.textContent = pct + '%';
      }
    }
    if (latEl) {
      let lat = statusData && (statusData.avgLatencyMs != null ? statusData.avgLatencyMs : statusData.latency_ms);
      // Derive rough latency from log detail ms= tags if gateway has no samples yet
      if ((lat == null || lat < 0) && sendLike.length) {
        const samples = [];
        sendLike.forEach((l) => {
          const d = l.details || l;
          const raw = String((d && (d.latency_ms || d.duration_ms || d.message)) || l.message || '');
          const m = raw.match(/(\d+)\s*ms\b/i) || raw.match(/latency[=:]\s*(\d+)/i);
          if (m) samples.push(Number(m[1]));
        });
        if (samples.length) {
          lat = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
        }
      }
      if (lat != null && Number(lat) >= 0) {
        latEl.textContent = Math.round(Number(lat)) + ' ms';
        latEl.title = 'Average send latency (typing + WhatsApp handoff)';
      } else {
        latEl.textContent = sendLike.length ? '—' : 'n/a';
        latEl.title = sendLike.length
          ? 'Latency samples start after the next send (restart gateway for live KPI)'
          : 'No sends today yet';
      }
    }
    if (qEl) {
      const q = statusData && (statusData.queued != null ? statusData.queued : statusData.queue_length);
      qEl.textContent = q != null ? String(q) : '0';
    }
  }

  function renderIncidentEmpty(title, detail, icon) {
    icon = icon || 'fa-circle-check';
    return (
      '<div class="app-incidents-empty">' +
      '<i class="fa-solid ' +
      icon +
      '"></i>' +
      '<strong>' +
      escHtml(title) +
      '</strong>' +
      '<span>' +
      escHtml(detail) +
      '</span>' +
      '</div>'
    );
  }

async function pollSuperAdminGateway() {
  const RS_API = global.RS_API;
  if (!RS_API) {return;}
  // Zero-cost launch still uses FREE platform Baileys (your PC + ngrok). No paid API.
  const isZeroCost = !!RS_API.zeroCostLaunchMode;

  const statusBadge = document.getElementById('saas-gateway-status');
  const phoneEl = document.getElementById('saas-gateway-phone');
  const sessionEl = document.getElementById('saas-gateway-session-saved');
  const qrContainer = document.getElementById('saas-gateway-qr-container');
  const qrSpinner = document.getElementById('saas-gateway-qr-spinner');
  const qrImg = document.getElementById('saas-gateway-qr-img');
  const connectedView = document.getElementById('saas-gateway-connected-view');
  const logsContainer = document.getElementById('saas-notification-logs-container');

  // 1. Fetch Gateway Status (platform line — free automation for all clients)
  try {
    const data = await RS_API.admin({ action: 'gateway_status' });
    if (data && !data.error) {
      const statusLabelEl = document.getElementById('saas-gateway-status-label');
      if (statusBadge) {
        const st = String(data.status || 'unknown').toLowerCase();
        const pretty = st === 'ready' ? 'Ready' : st === 'qr' ? 'Scan QR' : st === 'connecting' ? 'Connecting' : (st.charAt(0).toUpperCase() + st.slice(1));
        statusBadge.textContent = pretty;
        if (statusLabelEl) {
          statusLabelEl.textContent = st === 'ready' ? 'Online' : pretty;
        }
        if (data.status === 'ready') {
          statusBadge.className = 'pill pill-green';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (qrContainer) {qrContainer.style.display = 'none';}
          if (connectedView) {connectedView.style.display = 'flex';}
        } else if (data.status === 'qr') {
          statusBadge.className = 'pill pill-amber';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) {connectedView.style.display = 'none';}
          if (qrContainer) {qrContainer.style.display = 'flex';}
          if (data.qr) {
            if (qrSpinner) {qrSpinner.style.display = 'none';}
            if (qrImg) {
              qrImg.src = data.qr;
              qrImg.style.display = 'block';
            }
          } else {
            if (qrSpinner) {
              qrSpinner.style.display = 'block';
              qrSpinner.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-bottom:6px;font-size:16px;color:#FF4F00"></i><br>Preparing QR…';
            }
            if (qrImg) {qrImg.style.display = 'none';}
          }
        } else if (st === 'connecting' || st === 'starting' || st === 'syncing' || st === 'authenticated') {
          statusBadge.className = 'pill pill-amber';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) {connectedView.style.display = 'none';}
          if (qrContainer) {qrContainer.style.display = 'flex';}
          if (qrSpinner) {
            qrSpinner.style.display = 'block';
            qrSpinner.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-bottom: 6px; font-size: 16px; color: #FF4F00;"></i><br>${escHtml(pretty)}…`;
          }
          if (qrImg) {qrImg.style.display = 'none';}
        } else {
          // disconnected / offline / closed / unknown — not "connecting"
          statusBadge.className = 'pill pill-red';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) {connectedView.style.display = 'none';}
          if (qrContainer) {qrContainer.style.display = 'flex';}
          if (qrSpinner) {
            qrSpinner.style.display = 'block';
            qrSpinner.innerHTML =
              '<i class="fa-solid fa-link-slash" style="margin-bottom:8px;font-size:18px;color:#ef4444;display:block"></i>' +
              '<strong style="color:var(--text);font-size:13px">WhatsApp not linked</strong>' +
              '<span style="display:block;margin-top:8px;font-size:11.5px;color:var(--text-soft);line-height:1.45;max-width:260px">' +
              'Click <b>Reset Gateway Connection</b> above, then scan the QR from WhatsApp → Linked devices.' +
              '</span>';
          }
          if (qrImg) {qrImg.style.display = 'none';}
        }
      }
      if (phoneEl) {phoneEl.textContent = data.number ? `+${data.number}` : 'Not Linked';}
      if (sessionEl) {
        if (data.sessionSavedAt) {
          sessionEl.textContent = formatDateTimeIN(data.sessionSavedAt);
        } else {
          sessionEl.textContent = 'Never';
        }
      }
      // stash for KPI use after logs load
      global.__rsGwLastStatus = data;
    } else {
      throw new Error(data?.error || 'Failed to fetch status');
    }
  } catch(err) {
    if (statusBadge) {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'pill pill-red';
    }
    const statusLabelEl = document.getElementById('saas-gateway-status-label');
    if (statusLabelEl) {statusLabelEl.textContent = 'Offline';}
    if (phoneEl) {phoneEl.textContent = 'Unknown';}
    if (sessionEl) {sessionEl.textContent = 'Unknown';}
    if (connectedView) {connectedView.style.display = 'none';}
    if (qrContainer) {qrContainer.style.display = 'flex';}
    if (qrSpinner) {
      qrSpinner.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="margin-bottom: 6px; font-size: 16px; color: #EF4444;"></i><br>Gateway Server Offline<br><span style="font-size: 10px; color: #9CA3AF; margin-top: 4px; display: block;">Check cloud space status</span>';
      qrSpinner.style.display = 'block';
    }
    if (qrImg) {qrImg.style.display = 'none';}
  }

  // 2. Fetch Gateway Debug-Logs (human-readable primary, technical in title)
  try {
    const data = await RS_API.admin({ action: 'gateway_logs' });
    if (data && !data.error) {
      const logs = (data.logs || []).slice(0, 20);
      updateGatewayKpis(logs, global.__rsGwLastStatus || null);
      if (logsContainer) {
        if (logs.length === 0) {
          logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #9CA3AF;">No recent gateway activity.</div>';
        } else {
          logsContainer.innerHTML = logs.map(log => {
            const logDate = log.created_at ? new Date(log.created_at) : new Date();
            const timeStr = Number.isNaN(logDate.getTime())
              ? '--:--:--'
              : logDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const st = String(log.status || '').toLowerCase();
            const hum = humanizeGatewayEvent(log.event, log.details || {});
            const cls = st === 'ok' || st === 'success' || !st
              ? 'ti'
              : (st === 'warning' || st === 'warn' ? 'tw' : 'te');
            // Soften disconnect noise to warning tone when humanized
            const tone = /interrupt|closed|disconnect/i.test(hum.title) ? 'tw' : cls;
            const detailHtml = hum.detail
              ? ` <span style="opacity:.75">${escHtml(hum.detail)}</span>`
              : '';
            return `<div class="tl" title="${escHtml(hum.technical)}"><span class="tt">${escHtml(timeStr)}</span><span class="${tone}"><strong>${escHtml(hum.title)}</strong>${detailHtml}</span></div>`;
          }).join('');
          logsContainer.scrollTop = 0;
        }
      }
    } else {
      throw new Error(data?.error || 'Failed to fetch logs');
    }
  } catch(err) {
    if (logsContainer) {
      const msg = escHtml(err.message || 'Gateway request failed');
      logsContainer.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--red);"><i class="fa-solid fa-circle-exclamation" style="display:block;margin-bottom:8px"></i>Could not load gateway logs: ${msg}</div>`;
    }
    updateGatewayKpis([], global.__rsGwLastStatus || null);
  }
}

function startSaaSGatewayPolling() {
  if (saasGatewayPollingInterval) {clearInterval(saasGatewayPollingInterval);}
  pollSuperAdminGateway();
  saasGatewayPollingInterval = setInterval(pollSuperAdminGateway, 5000);
}

function stopSaaSGatewayPolling() {
  if (saasGatewayPollingInterval) {
    clearInterval(saasGatewayPollingInterval);
    saasGatewayPollingInterval = null;
  }
}

function parseReportId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function notifyIncident(msg, icon) {
  try {
    toast(msg, icon);
  } catch (_) {}
  // Always log so failures are visible in DevTools if toast is missing
  if (icon && String(icon).includes('exclamation')) {console.warn('[Incidents]', msg);}
  else {console.info('[Incidents]', msg);}
}

async function resolveIncidentById(reportId, button) {
  const id = parseReportId(reportId);
  if (!id) {
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
    notifyIncident('Missing incident id — refresh the page and try again.', 'fa-circle-exclamation');
    return false;
  }
  const api = global.RS_API;
  if (!api || typeof api.admin !== 'function') {
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
    notifyIncident('Admin API not ready. Re-login as super-admin.', 'fa-circle-exclamation');
    return false;
  }
  const label = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = '…';
  }
  try {
    const out = await api.admin({ action: 'resolve_error_report', report_id: id });
    if (out && out.error) {throw new Error(out.error);}
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    notifyIncident('Incident marked resolved.');
    return true;
  } catch (error) {
    const msg = (error && error.message) || 'Could not resolve incident.';
    try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
    notifyIncident(msg, 'fa-circle-exclamation');
    // Surface hard failures so a missing toast still informs the user
    if (/session expired|not ready|Valid report|Failed to resolve|401|403/i.test(msg)) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      try { toast('Resolve failed: ' + msg, 'fa-circle-exclamation'); } catch (_) {}
    }
    if (button) {
      button.disabled = false;
      button.textContent = label || 'Resolve';
    }
    return false;
  }
}

function bindIncidentResolveButtons(list) {
  if (!list) {return;}
  list.querySelectorAll('.app-incident-resolve-btn').forEach((btn) => {
    if (btn.dataset.bound === '1') {return;}
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
      const id = btn.getAttribute('data-report-id');
      const ok = await resolveIncidentById(id, btn);
      if (ok) {await loadAppIncidents();}
    });
  });
}

async function resolveAllOpenIncidents() {
  const api = global.RS_API;
  try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
  if (!api || typeof api.admin !== 'function') {
    notifyIncident('Admin API not ready. Re-login as super-admin.', 'fa-circle-exclamation');
    return;
  }
  const btn = document.getElementById('btn-resolve-all-incidents');
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    const result = await api.admin({ action: 'list_error_reports', status: 'open', limit: 100 });
    const reports = Array.isArray(result.reports) ? result.reports : [];
    if (!reports.length) {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      notifyIncident('No open incidents to clear.');
      await loadAppIncidents();
      return;
    }
    if (!confirm('Mark all ' + reports.length + ' open incident(s) as resolved?\n\nThis only clears your inbox — it does not change tenant data.')) {
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const r of reports) {
      const id = parseReportId(r.id);
      if (!id) { fail++; continue; }
      try {
        const out = await api.admin({ action: 'resolve_error_report', report_id: id });
        if (out && out.error) {throw new Error(out.error);}
        ok++;
      } catch (_) { fail++; }
    }
    try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
    notifyIncident(fail ? ('Resolved ' + ok + ', failed ' + fail + '.') : ('Resolved ' + ok + ' incident(s).'));
    await loadAppIncidents();
  } catch (error) {
    notifyIncident((error && error.message) || 'Could not clear incidents.', 'fa-circle-exclamation');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Resolve all';
    }
  }
}

async function loadAppIncidents() {
  const list = document.getElementById('app-incidents-list');
  const filter = document.getElementById('app-incidents-status-filter');
  if (!list) {return;}
  const RS_API = global.RS_API;
  list.innerHTML = renderIncidentEmpty('Loading incidents', 'Checking the latest platform error reports.', 'fa-spinner fa-spin');
  try {
    if (!RS_API || typeof RS_API.admin !== 'function') {
      list.innerHTML = renderIncidentEmpty('Incidents unavailable', 'Admin API not ready.', 'fa-triangle-exclamation');
      return;
    }
    const status = filter ? filter.value : 'open';
    const result = await RS_API.admin({ action: 'list_error_reports', status: status === 'all' ? null : status });
    if (result && result.error) {throw new Error(result.error);}
    const reports = Array.isArray(result.reports) ? result.reports : [];
    if (!reports.length) {
      list.innerHTML = renderIncidentEmpty('No incidents found', 'This status queue is currently clear.');
      return;
    }
    list.innerHTML = reports.map((report) => {
      const severity = String(report.severity || 'error').toLowerCase();
      const statusLabel = String(report.status || 'open').toLowerCase();
      // DB columns are message/stack (app_error_reports); accept legacy aliases too
      const rawMsg = report.message || report.error_message || '';
      const rawStack = report.stack || report.stack_trace || '';
      const msg = friendlyErrorMessage(rawMsg);
      const tenant = friendlyTenantLabel(report.tenant_slug);
      const path = shortPath(report.url_path || report.page_url || '');
      const source = report.source || 'dashboard';
      const metaLine = [tenant, source, path].filter(Boolean).join(' · ');
      const stack = rawStack
        ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:11px;color:var(--text-mute)">Technical details</summary><code style="display:block;margin-top:6px;font-size:10px;white-space:pre-wrap;max-height:120px;overflow:auto">${escHtml(String(rawStack).slice(0, 1200))}</code></details>`
        : '';
      const rid = parseReportId(report.id);
      const resolveButton = statusLabel === 'open' && rid
        ? `<button type="button" class="app-incident-resolve-btn" data-report-id="${rid}" title="Mark as reviewed (does not fix the original crash)">Resolve</button>`
        : (statusLabel === 'open'
          ? '<span style="font-size:11px;color:var(--red)">No id</span>'
          : '');
      return `
        <article class="app-incident-card" data-report-id="${rid || ''}" title="Client-side error report stored in app_error_reports">
          <div style="flex: 1; min-width: 0;">
            <strong>${escHtml(msg)}</strong>
            <span>${escHtml(metaLine)}</span>
            ${stack}
            <div class="app-incident-meta">
              <span class="app-incident-pill ${escHtml(severity)}">${escHtml(severity)}</span>
              <span class="app-incident-pill">${escHtml(statusLabel)}</span>
              <span class="app-incident-pill">${escHtml(report.app_version || 'v?')}</span>
            </div>
          </div>
          <div class="app-incident-actions">
            <time>${escHtml(formatIncidentTime(report.created_at))}</time>
            ${resolveButton}
          </div>
        </article>
      `;
    }).join('');
    bindIncidentResolveButtons(list);
  } catch (error) {
    list.innerHTML = renderIncidentEmpty('Incidents unavailable', error.message || 'Try refreshing this panel.', 'fa-triangle-exclamation');
  }
}

function renderGateway() {
  // Basic init of gateway monitor handlers
  const RS_API = global.RS_API;
  const resetBtn = document.getElementById('btn-saas-gateway-reset');
  if (resetBtn && !resetBtn.dataset.listenerBound) {
    resetBtn.dataset.listenerBound = 'true';
    resetBtn.addEventListener('click', async () => {
      if (confirm('Are you absolutely sure you want to RESET the WhatsApp Gateway?\n\nThis will completely purge the WhatsApp session files from the gateway storage. You will need to scan a new QR code to re-link your device!')) {
        try {
          resetBtn.disabled = true;
          resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

          if (!RS_API) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('API not ready. Refresh and try again.', 'fa-circle-exclamation');
            return;
          }

          const data = await RS_API.admin({ action: 'gateway_reset' });

          if (data && !data.error) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
            toast('WhatsApp Gateway reset successfully. Scan QR code to re-authenticate.', 'fa-circle-check');
            await pollSuperAdminGateway();
          } else {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Failed to reset gateway: ' + (data?.error || data?.message || 'Unknown error'), 'fa-circle-exclamation');
          }
        } catch (err) {
          console.error(err);
          try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
          toast('Error communicating with gateway: ' + (err.message || err), 'fa-circle-exclamation');
        } finally {
          resetBtn.disabled = false;
          resetBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Reset Gateway Connection';
        }
      }
    });
  }

  const refreshLogsBtn = document.getElementById('btn-refresh-saas-logs');
  if (refreshLogsBtn && !refreshLogsBtn.dataset.listenerBound) {
    refreshLogsBtn.dataset.listenerBound = 'true';
    refreshLogsBtn.addEventListener('click', async () => {
      try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {}
      const icon = refreshLogsBtn.querySelector('i');
      if (icon) {icon.classList.add('fa-spin');}
      await pollSuperAdminGateway();
      if (icon) {
        setTimeout(() => {
          icon.classList.remove('fa-spin');
        }, 600);
      }
    });
  }

  const refreshIncidentsBtn = document.getElementById('btn-refresh-app-incidents');
  if (refreshIncidentsBtn && !refreshIncidentsBtn.dataset.listenerBound) {
    refreshIncidentsBtn.dataset.listenerBound = 'true';
    refreshIncidentsBtn.addEventListener('click', () => { try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {} loadAppIncidents(); });
  }

  const resolveAllBtn = document.getElementById('btn-resolve-all-incidents');
  if (resolveAllBtn && !resolveAllBtn.dataset.listenerBound) {
    resolveAllBtn.dataset.listenerBound = 'true';
    resolveAllBtn.addEventListener('click', () => { try { if (window.RSActionFeedback) {window.RSActionFeedback.click();} } catch(_) {} resolveAllOpenIncidents(); });
  }

  const incidentFilter = document.getElementById('app-incidents-status-filter');
  if (incidentFilter && !incidentFilter.dataset.listenerBound) {
    incidentFilter.dataset.listenerBound = 'true';
    incidentFilter.addEventListener('change', loadAppIncidents);
  }

  // Delegation fallback + direct binds after each render
  const incidentsList = document.getElementById('app-incidents-list');
  if (incidentsList && !incidentsList.dataset.listenerBound) {
    incidentsList.dataset.listenerBound = 'true';
    incidentsList.addEventListener('click', async (event) => {
      const target = event.target;
      const button = target && typeof target.closest === 'function' ? target.closest('.app-incident-resolve-btn') : null;
      if (!button || button.dataset.bound === '1') {return;} // direct bind already handles
      event.preventDefault();
      const ok = await resolveIncidentById(button.getAttribute('data-report-id'), button);
      if (ok) {await loadAppIncidents();}
    });
  }

  startSaaSGatewayPolling();
  loadAppIncidents();
}

  global.RSGatewayMonitor = {
    renderGateway,
    pollSuperAdminGateway,
    startSaaSGatewayPolling,
    stopSaaSGatewayPolling,
    loadAppIncidents,
    resolveAllOpenIncidents,
    resolveIncidentById,
  };
  global.startSaaSGatewayPolling = startSaaSGatewayPolling;
  global.stopSaaSGatewayPolling = stopSaaSGatewayPolling;
  global.RSResolveIncident = resolveIncidentById;
  global.RSResolveAllIncidents = resolveAllOpenIncidents;
})(typeof window !== 'undefined' ? window : globalThis);
