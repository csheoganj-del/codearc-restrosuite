(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.observability = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function redact(value) {
    return String(value || "")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/\b\d{10,}\b/g, "[number]")
      .slice(0, 1800);
  }

  function createReporter(options) {
    const config = options || {};
    const fetchImpl = config.fetchImpl || fetch;
    const baseUrl = String(config.baseUrl || "").replace(/\/$/, "");
    const anonKey = String(config.anonKey || "");
    const source = String(config.source || "dashboard");
    const appVersion = String(config.appVersion || "2.0");
    const seen = new Set();

    async function report(input) {
      const payload = input || {};
      const message = redact(payload.message || "Unknown app error").slice(0, 500);
      const fingerprint = `${source}:${message}:${payload.url_path || ""}`;
      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      if (seen.size > 60) seen.clear();
      if (!baseUrl || !anonKey || !message) return;

      try {
        await fetchImpl(`${baseUrl}/functions/v1/app-observability`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
          },
          body: JSON.stringify({
            severity: payload.severity || "error",
            source,
            tenant_id: payload.tenant_id || "",
            tenant_slug: payload.tenant_slug || "",
            message,
            stack: redact(payload.stack),
            url_path: redact(payload.url_path || (location && location.pathname) || ""),
            app_version: appVersion,
            user_agent: redact((navigator && navigator.userAgent) || "").slice(0, 300),
            metadata: payload.metadata || {},
          }),
        });
      } catch {
        // Error reporting must never create user-visible failures.
      }
    }

    function installGlobalHandlers(getContext) {
      const context = typeof getContext === "function" ? getContext : function () { return {}; };
      window.addEventListener("error", (event) => {
        const info = context();
        report({
          ...info,
          message: event.message,
          stack: event.error && event.error.stack,
          url_path: event.filename || location.pathname,
        });
      });
      window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason || {};
        const info = context();
        report({
          ...info,
          message: reason.message || String(reason),
          stack: reason.stack || "",
          url_path: location.pathname,
        });
      });
    }

    return { installGlobalHandlers, report };
  }

  return { createReporter, redact };
});
