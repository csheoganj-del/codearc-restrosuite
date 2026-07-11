/* ============================================================
   RestroSuite — Gateway monitor & app incidents (Wave 8)
   ============================================================ */
(function (global) {
  'use strict';

  let saasGatewayPollingInterval = null;

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }

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
  if (!RS_API) return;
  const isZeroCost = !!RS_API.zeroCostLaunchMode;
  const gatewayUrl = isZeroCost ? '' : 'https://kalpeshdeora1006-restrosuite-gateway.hf.space';

  const statusBadge = document.getElementById('saas-gateway-status');
  const phoneEl = document.getElementById('saas-gateway-phone');
  const sessionEl = document.getElementById('saas-gateway-session-saved');
  const qrContainer = document.getElementById('saas-gateway-qr-container');
  const qrSpinner = document.getElementById('saas-gateway-qr-spinner');
  const qrImg = document.getElementById('saas-gateway-qr-img');
  const connectedView = document.getElementById('saas-gateway-connected-view');
  const logsContainer = document.getElementById('saas-notification-logs-container');

  if (isZeroCost || !gatewayUrl) {
    if (statusBadge) {
      statusBadge.textContent = 'ZERO-COST MODE';
      statusBadge.className = 'pill';
      statusBadge.style.background = 'rgba(107, 114, 128, 0.1)';
      statusBadge.style.color = '#6B7280';
    }
    if (phoneEl) phoneEl.textContent = 'Disabled';
    if (sessionEl) sessionEl.textContent = 'Upgrade add-on';
    if (connectedView) connectedView.style.display = 'none';
    if (qrContainer) qrContainer.style.display = 'flex';
    if (qrSpinner) {
      qrSpinner.innerHTML = `<i class="fa-solid fa-circle-info" style="margin-bottom: 6px; font-size: 16px; color: #6B7280;"></i><br>Gateway disabled for zero-cost launch<br><span style="font-size: 10px; color: #9CA3AF; margin-top: 4px; display: block;">Manual WhatsApp sharing remains available.</span>`;
      qrSpinner.style.display = 'block';
    }
    if (logsContainer) {
      logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #6B7280;">Gateway logs are disabled in zero-cost launch mode.</div>';
    }
    return;
  }

  // 1. Fetch Gateway Status
  try {
    const data = await RS_API.admin({ action: 'gateway_status' });
    if (data && !data.error) {
      if (statusBadge) {
        statusBadge.textContent = data.status ? data.status.toUpperCase() : 'UNKNOWN';
        if (data.status === 'ready') {
          statusBadge.className = 'pill pill-green';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (qrContainer) qrContainer.style.display = 'none';
          if (connectedView) connectedView.style.display = 'flex';
        } else if (data.status === 'qr') {
          statusBadge.className = 'pill pill-amber';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) connectedView.style.display = 'none';
          if (qrContainer) qrContainer.style.display = 'flex';
          if (data.qr) {
            if (qrSpinner) qrSpinner.style.display = 'none';
            if (qrImg) {
              qrImg.src = data.qr;
              qrImg.style.display = 'block';
            }
          } else {
            if (qrSpinner) qrSpinner.style.display = 'block';
            if (qrImg) qrImg.style.display = 'none';
          }
        } else {
          statusBadge.className = 'pill pill-red';
          statusBadge.style.background = '';
          statusBadge.style.color = '';
          if (connectedView) connectedView.style.display = 'none';
          if (qrContainer) qrContainer.style.display = 'flex';
          if (qrSpinner) {
            qrSpinner.style.display = 'block';
            qrSpinner.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-bottom: 6px; font-size: 16px; color: #FF4F00;"></i><br>Connecting (Status: ${data.status.toUpperCase()})`;
          }
          if (qrImg) qrImg.style.display = 'none';
        }
      }
      if (phoneEl) phoneEl.textContent = data.number ? `+${data.number}` : 'Not Linked';
      if (sessionEl) {
        if (data.sessionSavedAt) {
          sessionEl.textContent = new Date(data.sessionSavedAt).toLocaleString('en-IN');
        } else {
          sessionEl.textContent = 'Never';
        }
      }
    } else {
      throw new Error(data?.error || 'Failed to fetch status');
    }
  } catch(err) {
    if (statusBadge) {
      statusBadge.textContent = 'OFFLINE';
      statusBadge.className = 'pill pill-red';
    }
    if (phoneEl) phoneEl.textContent = 'Unknown';
    if (sessionEl) sessionEl.textContent = 'Unknown';
    if (connectedView) connectedView.style.display = 'none';
    if (qrContainer) qrContainer.style.display = 'flex';
    if (qrSpinner) {
      qrSpinner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-bottom: 6px; font-size: 16px; color: #EF4444;"></i><br>Gateway Server Offline<br><span style="font-size: 10px; color: #9CA3AF; margin-top: 4px; display: block;">Check cloud space status</span>`;
      qrSpinner.style.display = 'block';
    }
    if (qrImg) qrImg.style.display = 'none';
  }

  // 2. Fetch Gateway Debug-Logs
  try {
    const data = await RS_API.admin({ action: 'gateway_logs' });
    if (data && !data.error) {
      const logs = (data.logs || []).slice(0, 15);
      if (logsContainer) {
        if (logs.length === 0) {
          logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #9CA3AF;">No recent dispatch logs found.</div>';
        } else {
          logsContainer.innerHTML = logs.map(log => {
            const logDate = log.created_at ? new Date(log.created_at) : new Date();
            const timeStr = logDate.toTimeString().slice(0, 8);
            const cls = log.status === 'ok' ? 'ti' : (log.status === 'warning' ? 'tw' : 'te');
            return `<div class="tl"><span class="tt">${timeStr}</span><span class="${cls}">[${log.event.toUpperCase()}] ${escHtml(log.details?.message || log.details?.error || 'System event')}</span></div>`;
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
  }
}

function startSaaSGatewayPolling() {
  if (saasGatewayPollingInterval) clearInterval(saasGatewayPollingInterval);
  pollSuperAdminGateway();
  saasGatewayPollingInterval = setInterval(pollSuperAdminGateway, 5000);
}

function stopSaaSGatewayPolling() {
  if (saasGatewayPollingInterval) {
    clearInterval(saasGatewayPollingInterval);
    saasGatewayPollingInterval = null;
  }
}

async function loadAppIncidents() {
  const list = document.getElementById('app-incidents-list');
  const filter = document.getElementById('app-incidents-status-filter');
  if (!list) return;
  const RS_API = global.RS_API;
  list.innerHTML = renderIncidentEmpty('Loading incidents', 'Checking the latest platform error reports.', 'fa-spinner fa-spin');
  try {
    if (!RS_API || typeof RS_API.admin !== 'function') {
      list.innerHTML = renderIncidentEmpty('Incidents unavailable', 'Admin API not ready.', 'fa-triangle-exclamation');
      return;
    }
    const status = filter ? filter.value : 'open';
    const result = await RS_API.admin({ action: 'list_error_reports', status: status === 'all' ? null : status });
    const reports = Array.isArray(result.reports) ? result.reports : [];
    if (!reports.length) {
      list.innerHTML = renderIncidentEmpty('No incidents found', 'This status queue is currently clear.');
      return;
    }
    list.innerHTML = reports.map((report) => {
      const severity = String(report.severity || 'error');
      const statusLabel = String(report.status || 'open');
      const stack = report.stack_trace ? `<code>${escHtml(report.stack_trace)}</code>` : '';
      const resolveButton = statusLabel === 'open'
        ? `<button type="button" class="staff-secondary-btn app-incident-resolve-btn" data-report-id="${escHtml(report.id)}">Resolve</button>`
        : '';
      return `
        <article class="app-incident-card">
          <div style="flex: 1; min-width: 0;">
            <strong>${escHtml(report.error_message || 'Unknown application error')}</strong>
            <span>${escHtml(report.tenant_slug || 'unknown workspace')} · ${escHtml(report.source || 'dashboard')} · ${escHtml(report.url_path || 'unknown path')}</span>
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
      if (confirm("Are you absolutely sure you want to RESET the WhatsApp Gateway?\n\nThis will completely purge the WhatsApp session files from the gateway storage. You will need to scan a new QR code to re-link your device!")) {
        try {
          resetBtn.disabled = true;
          resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

          if (!RS_API || RS_API.zeroCostLaunchMode) {
            alert("Gateway automation is disabled in zero-cost launch mode.");
            return;
          }

          const data = await RS_API.admin({ action: 'gateway_reset' });

          if (data && !data.error) {
            toast("WhatsApp Gateway reset successfully. Scan QR code to re-authenticate.");
            await pollSuperAdminGateway();
          } else {
            alert("Failed to reset gateway: " + (data?.error || data?.message || 'Unknown error'));
          }
        } catch (err) {
          console.error(err);
          alert("Error communicating with gateway: " + err.message);
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
      const icon = refreshLogsBtn.querySelector('i');
      if (icon) icon.classList.add('fa-spin');
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
    refreshIncidentsBtn.addEventListener('click', loadAppIncidents);
  }

  const incidentFilter = document.getElementById('app-incidents-status-filter');
  if (incidentFilter && !incidentFilter.dataset.listenerBound) {
    incidentFilter.dataset.listenerBound = 'true';
    incidentFilter.addEventListener('change', loadAppIncidents);
  }

  const incidentsList = document.getElementById('app-incidents-list');
  if (incidentsList && !incidentsList.dataset.listenerBound) {
    incidentsList.dataset.listenerBound = 'true';
    incidentsList.addEventListener('click', async (event) => {
      const target = event.target;
      const button = target && typeof target.closest === 'function' ? target.closest('.app-incident-resolve-btn') : null;
      if (!button) return;
      button.disabled = true;
      try {
        const api = global.RS_API;
        if (!api || typeof api.admin !== 'function') throw new Error('Admin API not ready');
        await api.admin({ action: 'resolve_error_report', report_id: Number(button.dataset.reportId) });
        toast('Application incident resolved.');
        await loadAppIncidents();
      } catch (error) {
        toast(error.message || 'Could not resolve incident.', 'fa-circle-exclamation');
        button.disabled = false;
      }
    });
  }

  startSaaSGatewayPolling();
  loadAppIncidents();
};

  global.RSGatewayMonitor = {
    renderGateway,
    pollSuperAdminGateway,
    startSaaSGatewayPolling,
    stopSaaSGatewayPolling,
    loadAppIncidents,
  };
  global.startSaaSGatewayPolling = startSaaSGatewayPolling;
  global.stopSaaSGatewayPolling = stopSaaSGatewayPolling;
})(typeof window !== 'undefined' ? window : globalThis);
