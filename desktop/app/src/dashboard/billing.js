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
    const loyaltyDiscount = customer && normalizeMoney(customer.visits) >= 2 && loyaltyEnabled
      ? Math.round(subtotal * (loyaltyRate / 100))
      : 0;

    const taxableAmount = Math.max(0, subtotal - loyaltyDiscount);
    const gstEnabled = profile.gstEnabled !== false;
    const gstRate = profile.gstRate !== undefined
      ? normalizeMoney(profile.gstRate)
      : 18;
    const isInclusive = profile.inclusivePricing === true;

    let gst = 0;
    if (gstEnabled) {
      let totalTax = 0;
      cart.forEach(item => {
        if (!item) return;
        const rate = (item.gst !== undefined && item.gst !== null && item.gst !== '')
          ? parseFloat(String(item.gst).replace('%', ''))
          : gstRate;
        if (Number.isNaN(rate) || rate <= 0) return;

        const itemSub = normalizeMoney(item.price) * normalizeMoney(item.qty);
        const itemDiscount = subtotal > 0 ? (itemSub * (loyaltyDiscount / subtotal)) : 0;
        const itemTaxable = Math.max(0, itemSub - itemDiscount);

        let itemTax = 0;
        if (isInclusive) {
          itemTax = itemTaxable - (itemTaxable / (1 + rate / 100));
        } else {
          itemTax = itemTaxable * (rate / 100);
        }
        totalTax += itemTax;
      });
      gst = Math.round(totalTax);
    }

    const returnSubtotal = (isInclusive && gstEnabled) ? subtotal - gst : subtotal;
    const returnTaxable = (isInclusive && gstEnabled) ? taxableAmount - gst : taxableAmount;
    const returnTotal = isInclusive ? taxableAmount : (taxableAmount + gst);

    return {
      subtotal: returnSubtotal,
      loyaltyDiscount,
      taxableAmount: returnTaxable,
      gst,
      total: returnTotal,
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
