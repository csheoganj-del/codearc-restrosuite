'use strict';

/**
 * Lightweight Web Vitals RUM (no third-party).
 * Captures LCP / CLS / INP (or FID fallback) into sessionStorage for support diagnostics.
 * Does not send PII off-device.
 */
(function (global) {
  if (!global || !global.PerformanceObserver) {return;}

  const KEY = 'rs_rum_vitals_v1';
  const state = { lcp: null, cls: 0, inp: null, fid: null, url: String(global.location && global.location.pathname || ''), at: Date.now() };

  function persist() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {}
    global.__RS_RUM__ = state;
  }

  try {
    const poLcp = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (!last) {return;}
      state.lcp = Math.round(last.renderTime || last.loadTime || last.startTime || 0);
      persist();
    });
    poLcp.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}

  try {
    let cls = 0;
    const poCls = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {cls += e.value;}
      }
      state.cls = Math.round(cls * 1000) / 1000;
      persist();
    });
    poCls.observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}

  try {
    const poInp = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const d = e.duration || 0;
        if (state.inp == null || d > state.inp) {state.inp = Math.round(d);}
      }
      persist();
    });
    poInp.observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch (_) {
    try {
      const poFid = new PerformanceObserver((list) => {
        const e = list.getEntries()[0];
        if (e) {
          state.fid = Math.round(e.processingStart - e.startTime);
          persist();
        }
      });
      poFid.observe({ type: 'first-input', buffered: true });
    } catch (_) {}
  }

  persist();
})(typeof window !== 'undefined' ? window : undefined);
