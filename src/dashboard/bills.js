(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.bills = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseBillDate(value) {
    if (!value) return new Date(0);
    const dateString = typeof value === "object" && value !== null
      ? value.dateTime
      : value;
    if (!dateString || typeof dateString !== "string") return new Date(0);

    try {
      const clean = dateString.replace(/[^0-9/:\sAMP,]/gi, "").trim();
      const parts = clean.split(",");
      const dateParts = parts[0].trim().split("/");
      if (dateParts.length === 3) {
        const day = Number.parseInt(dateParts[0], 10);
        const month = Number.parseInt(dateParts[1], 10) - 1;
        const year = Number.parseInt(dateParts[2], 10);
        if (
          !Number.isInteger(day)
          || !Number.isInteger(month)
          || !Number.isInteger(year)
        ) {
          throw new Error("Invalid bill date components.");
        }
        let hour = 0;
        let minute = 0;
        let second = 0;

        if (parts[1]) {
          const timeParts = parts[1].trim().split(" ");
          const hms = timeParts[0].split(":");
          hour = Number.parseInt(hms[0], 10);
          minute = Number.parseInt(hms[1], 10) || 0;
          second = Number.parseInt(hms[2], 10) || 0;
          const period = String(timeParts[1] || "").toUpperCase();
          if (period === "PM" && hour < 12) hour += 12;
          if (period === "AM" && hour === 12) hour = 0;
        }
        return new Date(year, month, day, hour, minute, second);
      }
    } catch (_) {
      // Fall through to native parsing for ISO and database timestamps.
    }
    const parsed = Date.parse(dateString);
    return Number.isNaN(parsed) ? new Date(0) : new Date(parsed);
  }

  function convertToCSV(data) {
    const headers = [
      "orderId",
      "customerName",
      "dateTime",
      "items",
      "subtotal",
      "gst",
      "total",
      "paymentMethod"
    ];
    const rows = (Array.isArray(data) ? data : []).map((row) => {
      return headers.map((header) => {
        let value = row ? row[header] : undefined;
        if (value === null || value === undefined) return '""';
        if (typeof value === "object") value = JSON.stringify(value);
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  }

  return { convertToCSV, parseBillDate };
});
