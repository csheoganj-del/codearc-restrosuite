(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {module.exports = api;}
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.superadmin = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getTenantStatusPresentation(status) {
    if (status === 'approved') {
      return {
        text: 'Active',
        style: 'background: rgba(34, 197, 94, 0.1); color: #22C55E;'
      };
    }
    if (status === 'suspended') {
      return {
        text: 'Suspended',
        style: 'background: rgba(239, 68, 68, 0.1); color: #EF4444;'
      };
    }
    return {
      text: 'Pending',
      style: 'background: rgba(245, 158, 11, 0.1); color: #F59E0B;'
    };
  }

  function getSelectionState(total, selected) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeSelected = Math.min(safeTotal, Math.max(0, Number(selected) || 0));
    return {
      checked: safeTotal > 0 && safeSelected === safeTotal,
      indeterminate: safeSelected > 0 && safeSelected < safeTotal,
      showBulkDelete: safeSelected > 0
    };
  }

  function renderSuperAdminApproveBtn(tenantId) {
    return `<button aria-label="Approve tenant workspace ${tenantId}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button>`;
  }

  function renderSuperAdminSuspendBtn(tenantId) {
    return `<button aria-label="Suspend tenant workspace ${tenantId}"><i class="fa-solid fa-lock" aria-hidden="true"></i></button>`;
  }

  function renderSuperAdminImpersonateBtn(tenantId) {
    return `<button aria-label="Impersonate and log in to tenant workspace ${tenantId}"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i></button>`;
  }

  function renderSuperAdminBillingBtn(tenantId) {
    return `<button aria-label="View SaaS billing and invoices for tenant ${tenantId}"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i></button>`;
  }

  return { getSelectionState, getTenantStatusPresentation, renderSuperAdminApproveBtn, renderSuperAdminSuspendBtn, renderSuperAdminImpersonateBtn, renderSuperAdminBillingBtn };
});
