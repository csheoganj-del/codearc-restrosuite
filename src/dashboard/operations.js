(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.operations = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseCustomLocaleString(value) {
    if (typeof value !== "string") return null;
    try {
      const parts = value.split(", ");
      if (parts.length !== 2 || parts[0].split("/").length !== 3) return null;
      const [day, month, year] = parts[0].split("/").map(Number);
      const timeParts = parts[1].trim().split(" ");
      const [rawHour, minute = 0, second = 0] = timeParts[0].split(":").map(Number);
      const period = String(timeParts[1] || "").toUpperCase();
      let hour = rawHour;
      if (period === "PM" && hour < 12) hour += 12;
      if (period === "AM" && hour === 12) hour = 0;
      const date = new Date(year, month - 1, day, hour, minute, second);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    } catch (_) {
      return null;
    }
  }

  return { parseCustomLocaleString };
});
