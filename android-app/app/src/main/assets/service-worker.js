// Bump this version on every deploy to force clients to update.
// Format: restrosuite-shell-vYYYYMMDD
const CACHE_NAME = "restrosuite-shell-v20260626";
const APP_SHELL = [
  "/",
  "/index.html",
  "/login.html",
  "/home.html",
  "/order.html",
  "/qr-order.html",
  "/tokens.html",
  "/404.html",
  "/styles.css",
  "/dashboard-styles.css",
  "/script.js",
  "/pwa.js",
  "/config.js",
  "/assets/restrosuite.css",
  "/assets/supabase-config.js",
  "/assets/saas-core.js",
  "/assets/db.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
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
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        // Only fall back to the login shell for page navigations.
        // Returning HTML for failed image/script/style requests corrupts the page.
        if (request.mode === "navigate") return caches.match("/login.html");
        return new Response("", { status: 504, statusText: "Offline" });
      }))
  );
});
