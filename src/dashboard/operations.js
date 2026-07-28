(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {module.exports = api;}
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.operations = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseCustomLocaleString(value) {
    if (typeof value !== 'string') {return null;}
    try {
      const parts = value.split(', ');
      if (parts.length !== 2 || parts[0].split('/').length !== 3) {return null;}
      const [day, month, year] = parts[0].split('/').map(Number);
      const timeParts = parts[1].trim().split(' ');
      const [rawHour, minute = 0, second = 0] = timeParts[0].split(':').map(Number);
      const period = String(timeParts[1] || '').toUpperCase();
      let hour = rawHour;
      if (period === 'PM' && hour < 12) {hour += 12;}
      if (period === 'AM' && hour === 12) {hour = 0;}
      const date = new Date(year, month - 1, day, hour, minute, second);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    } catch (_) {
      return null;
    }
  }

  function renderOperationsShiftBtn() {
    return '<button aria-label="Open current shift status and handover panel"><i class="fa-solid fa-user-clock" aria-hidden="true"></i></button>';
  }

  function renderOperationsCashierBtn() {
    return '<button aria-label="View cashier session logs and cash summary"><i class="fa-solid fa-cash-register" aria-hidden="true"></i></button>';
  }

  function renderOperationsKdsBtn() {
    return '<button aria-label="Open kitchen display and order ticket status"><i class="fa-solid fa-kitchen-set" aria-hidden="true"></i></button>';
  }

  function renderOperationsTicketsBtn() {
    return '<button aria-label="View live token queue and waitlist status"><i class="fa-solid fa-ticket" aria-hidden="true"></i></button>';
  }

  return { parseCustomLocaleString, renderOperationsShiftBtn, renderOperationsCashierBtn, renderOperationsKdsBtn, renderOperationsTicketsBtn };
});
