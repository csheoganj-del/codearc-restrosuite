(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.pos = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function evaluateSplitPayment(total, payments) {
    const target = Math.max(0, Number(total) || 0);
    const paid = ["upi", "cash", "card"].reduce((sum, key) => {
      return sum + Math.max(0, Number(payments && payments[key]) || 0);
    }, 0);
    const remaining = target - paid;
    return {
      total: target,
      paid,
      remaining,
      status: remaining === 0 ? "balanced" : remaining > 0 ? "remaining" : "overpaid",
      isBalanced: remaining === 0
    };
  }

  return { evaluateSplitPayment };
});
