(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.people = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getLoyaltyTier(spend) {
    const amount = Number(spend) || 0;
    if (amount >= 5000) return "Platinum";
    if (amount >= 2500) return "Gold";
    if (amount >= 1000) return "Silver";
    return "Bronze";
  }

  function calculatePayroll(baseSalary, lossOfPayDays) {
    const base = Math.max(0, Number(baseSalary) || 0);
    const lop = Math.min(30, Math.max(0, Number(lossOfPayDays) || 0));
    const effectiveBase = base * (30 - lop) / 30;
    const basic = effectiveBase * 0.5;
    const hra = basic * 0.4;
    const allowance = effectiveBase - basic - hra;
    const gross = effectiveBase;
    const pf = basic * 0.12;
    const pt = gross > 0 ? 200 : 0;
    const annualGross = gross * 12;
    const tds = annualGross > 700000
      ? ((annualGross - 700000) * 0.1) / 12
      : 0;
    const deductions = pf + pt + tds;

    return {
      effectiveBase,
      basic,
      hra,
      allowance,
      gross,
      pf,
      pt,
      tds,
      deductions,
      net: Math.max(0, gross - deductions)
    };
  }

  return { calculatePayroll, getLoyaltyTier };
});
