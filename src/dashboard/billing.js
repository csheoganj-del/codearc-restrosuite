(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.billing = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function findCustomer(customers, customerName, customerPhone) {
    const phone = String(customerPhone || "").trim();
    const name = String(customerName || "").trim().toLowerCase();
    return (Array.isArray(customers) ? customers : []).find((customer) => {
      if (!customer) return false;
      if (phone && String(customer.phone || "").trim() === phone) return true;
      return name && String(customer.name || "").trim().toLowerCase() === name;
    }) || null;
  }

  function calculateCartTotals(options) {
    const config = options || {};
    const profile = config.businessProfile || {};
    const cart = Array.isArray(config.cart) ? config.cart : [];
    const subtotal = cart.reduce((sum, item) => {
      return sum + (normalizeMoney(item && item.price) * normalizeMoney(item && item.qty));
    }, 0);

    const customer = findCustomer(
      config.customers,
      config.customerName,
      config.customerPhone
    );
    const loyaltyEnabled = profile.loyaltyEnabled === true;
    const loyaltyRate = profile.loyaltyRate !== undefined
      ? normalizeMoney(profile.loyaltyRate)
      : 10;
    const loyaltyDiscount = customer && normalizeMoney(customer.visits) >= 1 && loyaltyEnabled
      ? Math.round(subtotal * (loyaltyRate / 100))
      : 0;

    const taxableAmount = Math.max(0, subtotal - loyaltyDiscount);
    const gstEnabled = profile.gstEnabled !== false;
    const gstRate = profile.gstRate !== undefined
      ? normalizeMoney(profile.gstRate)
      : 18;
    const gst = gstEnabled ? Math.round(taxableAmount * (gstRate / 100)) : 0;

    return {
      subtotal,
      loyaltyDiscount,
      taxableAmount,
      gst,
      total: taxableAmount + gst,
      matchedCustomer: customer
    };
  }

  function aggregateDeductions(cart, getSpecs) {
    const totals = {};
    (Array.isArray(cart) ? cart : []).forEach((item) => {
      const specs = typeof getSpecs === "function" ? getSpecs(item) : {};
      Object.keys(specs || {}).forEach((ingredient) => {
        totals[ingredient] = (totals[ingredient] || 0)
          + (normalizeMoney(specs[ingredient]) * normalizeMoney(item && item.qty));
      });
    });
    return totals;
  }

  return {
    aggregateDeductions,
    calculateCartTotals,
    findCustomer
  };
});
