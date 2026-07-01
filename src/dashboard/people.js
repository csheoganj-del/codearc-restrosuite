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

  function calculatePayroll(baseSalary, lossOfPayDays, daysInMonth) {
    const base = Math.max(0, Number(baseSalary) || 0);
    // Per-day rate uses a fixed 30-day month by default (standard payroll convention),
    // NOT the current wall-clock month -- basing this on "today" made payroll for a
    // fixed salary silently drift by calendar month (28/29/30/31 days) depending on
    // which day the calculation happened to run. Callers who want to compute against
    // a specific month/period can pass its actual day-count explicitly.
    const resolvedDaysInMonth = Math.max(1, Number(daysInMonth) || 30);
    const lop = Math.min(resolvedDaysInMonth, Math.max(0, Number(lossOfPayDays) || 0));
    const effectiveBase = base * (resolvedDaysInMonth - lop) / resolvedDaysInMonth;
    const basic = effectiveBase * 0.5;
    const hra = basic * 0.4;
    const allowance = effectiveBase - basic - hra;
    const gross = effectiveBase;
    const pf = basic * 0.12;
    const pt = gross > 0 ? 200 : 0;

    // Indian Income Tax -- New Regime slabs (FY 2025-26)
    // Standard deduction ₹75,000 applied under new regime
    const annualGross = gross * 12;
    const standardDeduction = 75000;
    const taxableIncome = Math.max(0, annualGross - standardDeduction);

    let annualTax = 0;
    if (taxableIncome <= 400000) {
      annualTax = 0; // Nil up to ₹4L (rebate u/s 87A covers up to ₹7L effectively)
    } else if (taxableIncome <= 800000) {
      annualTax = (taxableIncome - 400000) * 0.05;
    } else if (taxableIncome <= 1200000) {
      annualTax = 20000 + (taxableIncome - 800000) * 0.10;
    } else if (taxableIncome <= 1600000) {
      annualTax = 60000 + (taxableIncome - 1200000) * 0.15;
    } else if (taxableIncome <= 2000000) {
      annualTax = 120000 + (taxableIncome - 1600000) * 0.20;
    } else if (taxableIncome <= 2400000) {
      annualTax = 200000 + (taxableIncome - 2000000) * 0.25;
    } else {
      annualTax = 300000 + (taxableIncome - 2400000) * 0.30;
    }

    // Section 87A rebate: zero tax if taxable income <= 7L
    if (taxableIncome <= 700000) annualTax = 0;

    // Add 4% health & education cess
    annualTax = annualTax * 1.04;

    const tds = annualTax / 12;
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
