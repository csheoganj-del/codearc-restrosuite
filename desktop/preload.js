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

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('RS_DESKTOP', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Convenience mirror of navigator.onLine for any UI that wants it.
  isOnline: () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
});
