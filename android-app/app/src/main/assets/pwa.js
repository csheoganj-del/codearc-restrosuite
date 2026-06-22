(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  // Disable service worker on localhost/127.0.0.1 for local development
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return;
  }

  if (location.protocol !== "https:") {
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js").catch(function (error) {
      console.warn("PWA registration failed:", error);
    });
  });
})();
