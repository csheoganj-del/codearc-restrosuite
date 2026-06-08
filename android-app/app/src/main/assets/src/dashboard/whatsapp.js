(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.whatsapp = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeIndianPhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10) digits = `91${digits}`;
    if (digits.length < 10 || digits.length > 15) return null;
    return digits;
  }

  function resolveGatewaySendUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (
      url.endsWith("/send")
      || url.endsWith("/api/mock-whatsapp")
      || url.includes("httpbin.org")
    ) {
      return url;
    }
    return `${url.replace(/\/+$/, "")}/send`;
  }

  return { normalizeIndianPhone, resolveGatewaySendUrl };
});
