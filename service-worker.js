// Bump this version on every deploy to force clients to update.
// Format: restrosuite-shell-vYYYYMMDD
const CACHE_NAME = "restrosuite-shell-v20260711-1529";
const APP_SHELL = [
  // Page URLs (Clean & Extension versions to handle redirects gracefully)
  "/",
  "/login",
  "/login.html",
  "/dashboard",
  "/dashboard.html",
  "/home",
  "/home.html",
  "/order",
  "/order.html",
  "/qr-order",
  "/qr-order.html",
  "/tokens",
  "/tokens.html",
  "/404",
  "/404.html",
  
  // Core Styles
  "/styles.css",
  "/dashboard-styles.css",
  "/assets/restrosuite.css",
  "/assets/dashboard.css",
  "/assets/features.css",
  
  // Local Scripts
  "/script.js",
  "/pwa.js",
  "/config.js",
  "/assets/supabase-config.js",
  "/assets/saas-core.js",
  "/assets/db.js",
  "/assets/doppio-api.js",
  "/assets/country-currency-data.js",
  "/assets/qrcode.min.js",
  "/src/dashboard/observability.js",
  "/src/dashboard/imports.js",
  "/src/dashboard/bills.js",
  "/src/dashboard/chain.js",
  
  // Missing Feature Scripts Loaded Dynamically by dashboard.html
  "/assets/dashboard.js",
  // Offline-lease guard — MUST be cached so enforcement survives offline.
  "/assets/license-config.js",
  "/assets/license-guard.js",
  "/assets/features-pos.js",
  "/assets/competitive-ops.js",
  "/assets/receipt.js",
  "/assets/print-bridge.js",
  "/assets/escpos-encoder.js",
  "/assets/modules/bill-identity.js",
  "/assets/modules/inventory-ledger.js",
  "/assets/modules/bills-history.js",
  "/assets/modules/inventory-ui.js",
  "/assets/modules/reports-ui.js",
  "/assets/modules/gateway-monitor.js",
  "/assets/modules/super-admin.js",
  "/assets/modules/kds-ui.js",
  "/assets/modules/qr-orders-ui.js",
  "/assets/modules/employees-ui.js",
  "/assets/modules/pos-ui.js",
  "/assets/modules/tax-helpers.js",
  "/assets/modules/growth-hub-shell.js",
  "/assets/modules/demo-script.js",
  "/assets/dist/critical.bundle.js",
  "/assets/features-editor.js",
  "/assets/features-manage.js",
  "/assets/features-growth.js",
  "/assets/features-extra.js",
  "/src/dashboard/onboarding.js",
  "/assets/features-shell.js",
  
  // Images/Assets
  "/assets/restrosuite-mark.png",
  "/assets/restrosuite-mark-512.png",
  "/assets/restrosuite-maskable-512.png",
  "/assets/restrosuite_logo.png",
  "/assets/screenshot-pos.png",
  "/assets/screenshot-cart.png",
  
  // External CDN Dependencies (Pre-cached)
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Robust caching: Fetch each URL individually to handle redirects/errors gracefully
      // without failing the entire installation if one resource is unavailable.
      for (const url of APP_SHELL) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          } else {
            console.warn(`[SW] Failed to cache ${url}: status ${response.status}`);
          }
        } catch (e) {
          console.error(`[SW] Error caching ${url}:`, e);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  // Security Contract requirement: url.origin !== self.location.origin
  // Intercept requests to same origin OR allowed third-party CDNs
  const isAllowedOrigin = (url.origin === self.location.origin ||
                           url.hostname === "cdn.jsdelivr.net" ||
                           url.hostname === "cdnjs.cloudflare.com" ||
                           url.hostname === "fonts.googleapis.com" ||
                           url.hostname === "fonts.gstatic.com");
  if (!isAllowedOrigin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful requests dynamically
        if (!response || response.status !== 200) return response;
        
        // Cache basic or CORS/CDN resources
        const isCacheable = response.type === "basic" || response.type === "cors";
        if (isCacheable) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        // Fall back to clean URL /login or /login.html for page navigations.
        if (request.mode === "navigate") {
          return caches.match("/login", { ignoreSearch: true }).then((fallback) => fallback || caches.match("/login.html", { ignoreSearch: true }));
        }
        return new Response("", { status: 504, statusText: "Offline" });
      }))
  );
});
