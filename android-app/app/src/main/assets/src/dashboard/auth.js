(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {module.exports = api;}
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.auth = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * createSessionManager — session token storage security contract
   * ──────────────────────────────────────────────────────────────
   * SECURITY: The `storage` parameter MUST be `window.sessionStorage`, never
   * `window.localStorage`. This is enforced at the call site in doppio-api.js
   * (const SS = window.sessionStorage; passed as config.storage).
   *
   * Rationale:
   *   - sessionStorage is tab-scoped and cleared when the tab/browser closes.
   *     A stolen token from one tab cannot persist across sessions or be read
   *     by a different tab (prevents multi-outlet session swaps).
   *   - localStorage persists indefinitely across sessions and is readable by
   *     all tabs on the same origin, including any compromised third-party
   *     script loaded from cdn.jsdelivr.net or cdnjs.cloudflare.com.
   *
   * The "remember me" feature uses a single opaque restore blob written to
   * localStorage under the key 'rs_remembered_session_v1'. This blob is only
   * used to hydrate a brand-new tab — it is never the live auth token.
   * See: doppio-api.js → writeRememberBlobFromSession / hydrateSessionFromBlob.
   *
   * CDN risk mitigation:
   *   - The CSP (vercel.json + middleware.js) restricts script-src to specific
   *     known CDN paths and the per-request nonce, limiting blast radius of a
   *     CDN compromise.
   *   - The Supabase anon key intentionally has no data access (all tables have
   *     deny_anon_all RLS policies). A compromised CDN script can read the anon
   *     key but cannot query or mutate any tenant data directly.
   *   - Signed session tokens are short-lived JWTs validated server-side on
   *     every request through Edge Functions.
   */
  function createSessionManager(options) {
    const config = options || {};
    const storage = config.storage;
    const validateSession = config.validateSession;

    function getSignedToken() {
      const role = storage.getItem('logged_in_role');
      return role === 'superadmin'
        ? storage.getItem('superadmin_admin_token')
        : storage.getItem('tenant_session_token');
    }

    function persistSession(session) {
      const previousResetAt = storage.getItem('tenant_data_reset_at') || '';
      const nextResetAt = session.data_reset_at || '';
      if (
        session.role === 'admin'
        && previousResetAt
        && nextResetAt
        && previousResetAt !== nextResetAt
      ) {
        storage.setItem('tenant_data_reset_pending', 'true');
      }
      storage.setItem('logged_in_user', session.username || '');
      storage.setItem('logged_in_display_name', session.display_name || session.username || '');
      storage.setItem('logged_in_role', session.role || '');
      storage.setItem('tenant_user_id', session.user_id || '');
      storage.setItem('tenant_id', session.tenant_id || '');
      storage.setItem('tenant_slug', session.tenant_slug || '');
      storage.setItem('tenant_name', session.tenant_name || '');
      storage.setItem('allowed_tabs', JSON.stringify(session.allowed_tabs || []));
      storage.setItem('tenant_data_reset_at', nextResetAt);
      storage.setItem('tenant_plan_code', session.plan_code || '');
      storage.setItem('tenant_plan_name', session.plan_name || '');
      storage.setItem('tenant_subscription_status', session.subscription_status || '');
      storage.setItem('tenant_plan_limits', JSON.stringify(session.plan_limits || {}));
      return session;
    }

    async function validateStoredSession() {
      const token = getSignedToken();
      if (!token) {throw new Error('Missing signed session token.');}
      const result = await validateSession(token);
      return persistSession(result.session || {});
    }

    return {
      getSignedToken,
      persistSession,
      validateStoredSession
    };
  }

  function renderAuthLoginBtn() {
    return '<button aria-label="Sign in to workspace"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i></button>';
  }

  function renderAuthLogoutBtn() {
    return '<button aria-label="Sign out of current session"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i></button>';
  }

  function renderAuthRefreshBtn() {
    return '<button aria-label="Refresh and validate current session token"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></button>';
  }

  function renderAuthForgotBtn() {
    return '<button aria-label="Initiate password reset flow"><i class="fa-solid fa-key" aria-hidden="true"></i></button>';
  }

  return { createSessionManager, renderAuthLoginBtn, renderAuthLogoutBtn, renderAuthRefreshBtn, renderAuthForgotBtn };
});
