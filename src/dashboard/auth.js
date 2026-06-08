(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.auth = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createSessionManager(options) {
    const config = options || {};
    const storage = config.storage;
    const validateSession = config.validateSession;

    function getSignedToken() {
      const role = storage.getItem("logged_in_role");
      return role === "superadmin"
        ? storage.getItem("superadmin_admin_token")
        : storage.getItem("tenant_session_token");
    }

    function persistSession(session) {
      const previousResetAt = storage.getItem("tenant_data_reset_at") || "";
      const nextResetAt = session.data_reset_at || "";
      if (
        session.role === "admin"
        && previousResetAt
        && nextResetAt
        && previousResetAt !== nextResetAt
      ) {
        storage.setItem("tenant_data_reset_pending", "true");
      }
      storage.setItem("logged_in_user", session.username || "");
      storage.setItem("logged_in_display_name", session.display_name || session.username || "");
      storage.setItem("logged_in_role", session.role || "");
      storage.setItem("tenant_user_id", session.user_id || "");
      storage.setItem("tenant_id", session.tenant_id || "");
      storage.setItem("tenant_slug", session.tenant_slug || "");
      storage.setItem("tenant_name", session.tenant_name || "");
      storage.setItem("allowed_tabs", JSON.stringify(session.allowed_tabs || []));
      storage.setItem("tenant_data_reset_at", nextResetAt);
      storage.setItem("tenant_plan_code", session.plan_code || "");
      storage.setItem("tenant_plan_name", session.plan_name || "");
      storage.setItem("tenant_subscription_status", session.subscription_status || "");
      storage.setItem("tenant_plan_limits", JSON.stringify(session.plan_limits || {}));
      return session;
    }

    async function validateStoredSession() {
      const token = getSignedToken();
      if (!token) throw new Error("Missing signed session token.");
      const result = await validateSession(token);
      return persistSession(result.session || {});
    }

    return {
      getSignedToken,
      persistSession,
      validateStoredSession
    };
  }

  return { createSessionManager };
});
