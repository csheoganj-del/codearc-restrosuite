// CACHE_NAME bumped on every deploy by scripts/bump-sw-version.cjs.
// Changing this causes the activate event to delete the old cache.
// Format: restrosuite-shell-vYYYYMMDD-HHmm
const CACHE_NAME = 'restrosuite-shell-v20260811-pin-otp';

// Per-file content hashes for stale-check in fetch handler (auto-generated — do not edit).
// Populated by scripts/bump-sw-version.cjs on every deploy. Maps URL pathname → 12-char SHA-256.
// Files whose hash matches the cached copy are served from cache without a network round-trip.
// Files whose hash differs (or that have no entry) trigger a network re-fetch and cache update.
const CACHE_MANIFEST = {};

// Allow the page to activate a waiting worker immediately (Reload now).
self.addEventListener('message', (event) => {
  try {
    if (event && event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  } catch (_) {}
});

const APP_SHELL = [
  // Page URLs (Clean & Extension versions to handle redirects gracefully)
  '/',
  '/login',
  '/login.html',
  '/dashboard',
  '/dashboard.html',
  '/home',
  '/home.html',
  '/order',
  '/order.html',
  '/qr-order',
  '/qr-order.html',
  '/feedback',
  '/feedback.html',
  '/bill',
  '/bill.html',
  '/tokens',
  '/tokens.html',
  '/404',
  '/404.html',

  // Core Styles
  '/styles.css',
  '/dashboard-styles.css',
  '/assets/restrosuite.css',
  '/assets/dashboard.css',
  '/assets/features.css',

  // Local Scripts
  '/script.js',
  '/pwa.js',
  '/config.js',
  '/assets/supabase-config.js',
  '/assets/saas-core.js',
  '/assets/db.js',
  '/assets/doppio-api.js',
  '/assets/country-currency-data.js',
  '/assets/qrcode.min.js',
  '/src/dashboard/observability.js',
  '/src/dashboard/imports.js',
  '/src/dashboard/bills.js',
  '/src/dashboard/chain.js',

  // Feature Scripts (minified in Pass 2 of build-critical.cjs)
  '/assets/dashboard.js',
  // Offline-lease guard — MUST be cached so enforcement survives offline.
  '/assets/license-config.js',
  '/assets/license-guard.js',
  '/assets/features-pos.js',
  '/assets/features-shell.js',
  '/assets/features-editor.js',
  '/assets/features-manage.js',
  '/assets/features-extra.js',
  '/assets/features-growth.js',
  '/assets/competitive-ops.js',
  '/assets/receipt.js',
  '/assets/print-bridge.js',
  '/assets/escpos-encoder.js',
  '/assets/modules/rs-action-feedback.js',
  '/assets/modules/bill-identity.js',
  '/assets/modules/recipe-units.js',
  '/assets/modules/inventory-ledger.js',
  '/assets/modules/inventory-batches.js',
  '/assets/modules/kitchen-link-coach.js',
  '/assets/modules/xlsx-lite.js',
  '/assets/modules/bills-history.js',
  '/assets/modules/inventory-ui.js',
  '/assets/modules/reports-ui.js',
  '/assets/modules/gateway-monitor.js',
  '/assets/modules/super-admin.js',
  '/assets/modules/kds-ui.js',
  '/assets/modules/qr-orders-ui.js',
  '/assets/modules/staff-table-scanner.js',
  '/assets/modules/view-mode.js',
  '/assets/modules/employees-ui.js',
  '/assets/modules/progress-ops.js',
  '/assets/modules/report-pdf.js',
  '/assets/lib/jspdf.umd.min.js',
  '/assets/modules/menu-intelligence.js',
  '/assets/modules/owner-wa-reports.js',
  '/assets/modules/hr-extended.js',
  '/assets/modules/commission.js',
  '/assets/modules/security-shield.js',
  '/assets/modules/wa-send-queue.js',
  '/assets/modules/pos-ui.js',
  '/assets/modules/tax-helpers.js',
  '/assets/modules/growth-hub-shell.js',
  '/assets/modules/demo-script.js',
  '/assets/dist/critical.bundle.js',
  '/src/dashboard/onboarding.js',

  // Images/Assets
  '/assets/restrosuite-mark.png',
  '/assets/restrosuite-mark-512.png',
  '/assets/restrosuite-maskable-512.png',
  '/assets/restrosuite_logo.png',
  '/assets/screenshot-pos.png',
  '/assets/screenshot-cart.png',

  // External CDN Dependencies (Pre-cached)
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
// Each file is fetched individually so one missing resource does not abort
// the entire installation. CDN resources use no-cors mode.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of APP_SHELL) {
        try {
          const isExternal = /^https?:\/\//.test(url);
          const response = await fetch(url, isExternal ? { mode: 'no-cors' } : undefined);
          // no-cors responses are opaque (status 0) — cache them anyway
          if (response.ok || response.type === 'opaque') {
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

// ── Activate: delete stale caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first with per-file hash stale detection ─────────────────
//
// Strategy per resource type:
//
//   App-shell assets that have a CACHE_MANIFEST entry:
//     Try cache first. If the cached response has a matching x-content-hash
//     header (stamped at cache-write time), serve it immediately without a
//     network request. If the hash is stale or absent, fetch from network,
//     stamp the new hash, and update the cache.
//
//   App-shell assets without a CACHE_MANIFEST entry (HTML pages, CDN):
//     Network-first with cache fallback (original behaviour).
//
//   API routes (/api/*): always bypass — never intercepted.
//   Non-GET requests: always bypass.
//   Cross-origin requests to non-whitelisted hosts: always bypass.
//
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {return;}

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {return;}

  // Security Contract requirement: url.origin !== self.location.origin
  // Intercept requests to same origin OR allowed third-party CDNs.
  const isAllowedOrigin = (
    url.origin === self.location.origin ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
  if (!isAllowedOrigin) {return;}

  // Determine if this URL has a known content hash
  const cacheKey     = url.pathname; // strip query string for manifest lookup
  const knownHash    = CACHE_MANIFEST[cacheKey] || null;
  const isHashable   = knownHash !== null;

  if (isHashable) {
    // Cache-first with hash validation: serve instantly if hash matches,
    // otherwise re-fetch and update.
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) {
          const cachedHash = cached.headers.get('x-content-hash');
          if (cachedHash === knownHash) {
            // Cache hit with valid hash — serve instantly, no network call
            return cached;
          }
        }
        // Stale or missing — fetch fresh copy
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.status === 200) {
            // Stamp the content hash into a synthetic header so future
            // requests can validate without re-hashing the body.
            const stamped = new Response(await fresh.clone().arrayBuffer(), {
              status:     fresh.status,
              statusText: fresh.statusText,
              headers: (() => {
                const h = new Headers(fresh.headers);
                h.set('x-content-hash', knownHash);
                return h;
              })(),
            });
            cache.put(request, stamped.clone());
            return stamped;
          }
          return fresh;
        } catch (_) {
          // Offline — return stale copy if any
          return cached || new Response('', { status: 504, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // No hash entry — network-first with cache fallback (pages, CDN, etc.)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200) {return response;}
        const isCacheable = response.type === 'basic' || response.type === 'cors';
        if (isCacheable) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then((cached) => {
          if (cached) {return cached;}
          if (request.mode === 'navigate') {
            return caches
              .match('/login', { ignoreSearch: true })
              .then((fb) => fb || caches.match('/login.html', { ignoreSearch: true }));
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});
