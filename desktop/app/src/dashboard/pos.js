(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {module.exports = api;}
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.pos = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function evaluateSplitPayment(total, payments) {
    const target = Math.max(0, Number(total) || 0);
    const paid = ['upi', 'cash', 'card'].reduce((sum, key) => {
      return sum + Math.max(0, Number(payments && payments[key]) || 0);
    }, 0);
    const remaining = target - paid;
    return {
      total: target,
      paid,
      remaining,
      status: remaining === 0 ? 'balanced' : remaining > 0 ? 'remaining' : 'overpaid',
      isBalanced: remaining === 0
    };
  }

  function renderPosClearBtn() {
    return '<button aria-label="Clear all items from current POS cart"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>';
  }

  function renderPosHoldBtn() {
    return '<button aria-label="Hold current cart and switch to a new order"><i class="fa-solid fa-pause" aria-hidden="true"></i></button>';
  }

  function renderPosVoidBtn() {
    return '<button aria-label="Void selected line item from current cart"><i class="fa-solid fa-ban" aria-hidden="true"></i></button>';
  }

  function renderPosDiscountBtn() {
    return '<button aria-label="Apply item-level or cart-wide discount"><i class="fa-solid fa-tags" aria-hidden="true"></i></button>';
  }

  return { evaluateSplitPayment, renderPosClearBtn, renderPosHoldBtn, renderPosVoidBtn, renderPosDiscountBtn };
});
