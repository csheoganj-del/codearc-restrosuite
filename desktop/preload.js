/* ============================================================
   RestroSuite Desktop -- preload bridge
   ------------------------------------------------------------
   Runs before the web app loads, in an isolated context. Exposes
   a tiny, read-only surface under window.RS_DESKTOP so the app can
   *optionally* detect it is running inside the desktop shell. The
   web app works fine even if it never checks this -- nothing here
   is required.
   ============================================================ */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('RS_DESKTOP', {
  isDesktop: true,
  platform: process.platform,
  isNativeApp: true,
  /** Desktop installer version (e.g. 2.0.26) — plain "App" version for owners */
  appVersion: (() => {
    try {
      return String(require('./package.json').version || '');
    } catch (_) {
      return '';
    }
  })(),
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Convenience mirror of navigator.onLine for any UI that wants it.
  isOnline: () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
  // Wave 4 — silent / thermal print bridge
  listPrinters: () => ipcRenderer.invoke('rs-list-printers'),
  printHtml: (html, opts) => ipcRenderer.invoke('rs-print-html', { html, ...(opts || {}) }),
  /** Open receipt HTML in real Chrome/Edge (auto-print). Avoids black POS58 from Electron. */
  openReceiptInBrowser: (html, opts) =>
    ipcRenderer.invoke('rs-open-receipt-browser', { html, ...(opts || {}) }),
  printEscPos: (payload) => ipcRenderer.invoke('rs-print-escpos', payload || {}),
  getPreferredPrinter: () => ipcRenderer.invoke('rs-get-preferred-printer'),
  setPreferredPrinter: (name) => ipcRenderer.invoke('rs-set-preferred-printer', name),
  // Dual updater: live UI content + NSIS/portable shell
  checkForUpdates: () => ipcRenderer.invoke('rs-check-for-updates'),
  contentUpdateStatus: () => ipcRenderer.invoke('rs-content-update-status'),
});

// Mark the DOM as native desktop as early as possible (app-like chrome, hide PWA install)
try {
  const mark = () => {
    try {
      document.documentElement.classList.add('rs-desktop-app', 'rs-native-app');
      document.documentElement.setAttribute('data-rs-desktop', '1');
      document.documentElement.setAttribute('data-rs-native', '1');
      window.RS_NATIVE_APP = true;
      window.RS_PLATFORM = 'desktop';
    } catch (_) {}
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mark);
  } else {
    mark();
  }
} catch (_) {}

// License bridge: the renderer's license-guard.js calls window.rsDesktop.storeLease
// whenever it obtains a fresh lease, so the main process can persist it
// (DPAPI-encrypted) and verify it natively on the next cold start.
contextBridge.exposeInMainWorld('rsDesktop', {
  storeLease: (leaseToken, serverTimeMs) => ipcRenderer.invoke('rs-license-store', leaseToken, serverTimeMs),
  recheckLicense: () => ipcRenderer.invoke('rs-license-recheck'),
  listPrinters: () => ipcRenderer.invoke('rs-list-printers'),
  printHtml: (html, opts) => ipcRenderer.invoke('rs-print-html', { html, ...(opts || {}) }),
  openReceiptInBrowser: (html, opts) =>
    ipcRenderer.invoke('rs-open-receipt-browser', { html, ...(opts || {}) }),
  printEscPos: (payload) => ipcRenderer.invoke('rs-print-escpos', payload || {}),
  getPreferredPrinter: () => ipcRenderer.invoke('rs-get-preferred-printer'),
  setPreferredPrinter: (name) => ipcRenderer.invoke('rs-set-preferred-printer', name),
});
