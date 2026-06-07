(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.inventory = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function expiryTime(batch) {
    const parsed = Date.parse(batch && batch.expiryDate ? batch.expiryDate : "2099-12-31");
    return Number.isNaN(parsed) ? Date.parse("2099-12-31") : parsed;
  }

  function deductFefo(batches, requiredQuantity, createFallbackBatch) {
    const ordered = (Array.isArray(batches) ? batches : [])
      .map((batch) => ({ ...batch, qty: Number(batch.qty) || 0 }))
      .sort((left, right) => expiryTime(left) - expiryTime(right));
    let remaining = Math.max(0, Number(requiredQuantity) || 0);
    const updated = [];

    ordered.forEach((batch) => {
      if (remaining <= 0) {
        updated.push(batch);
      } else if (batch.qty > remaining) {
        updated.push({ ...batch, qty: batch.qty - remaining });
        remaining = 0;
      } else {
        remaining -= batch.qty;
      }
    });

    if (remaining > 0) {
      if (updated.length > 0) {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          qty: updated[updated.length - 1].qty - remaining
        };
      } else {
        const fallback = typeof createFallbackBatch === "function"
          ? createFallbackBatch(remaining)
          : { id: "untracked", expiryDate: null, receivedDate: null };
        updated.push({ ...fallback, qty: -remaining });
      }
    }

    return {
      batches: updated,
      total: Math.max(0, updated.reduce((sum, batch) => sum + batch.qty, 0)),
      shortfall: remaining
    };
  }

  return { deductFefo };
});
