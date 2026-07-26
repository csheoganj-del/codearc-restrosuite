/* ============================================================
   RestroSuite — action feedback
   ------------------------------------------------------------
   Never fail silently. If an action is unavailable, staff get a
   clear toast when they try to use it.

   Usage:
     RS_setActionEnabled(btn, false, 'No open tables to clear');
     RS_setActionEnabled(btn, true);
     RS_notifyWhy('Camera not available on this device');
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    const text = String(msg || '').trim();
    if (!text) return;
    try {
      if (global.RS && typeof global.RS.toast === 'function') {
        global.RS.toast(text, icon || 'fa-circle-info');
        return;
      }
    } catch (_) {}
    try {
      if (typeof global.__toast === 'function') {
        global.__toast(text, icon || 'fa-circle-info');
        return;
      }
    } catch (_) {}
    try {
      console.info('[RS action]', text);
    } catch (_) {}
  }

  /** Show a one-shot explanation (why something did not run). */
  function notifyWhy(reason, icon) {
    toast(reason || 'This action is not available right now', icon || 'fa-circle-info');
  }

  /**
   * Mark a control as available or not. Keeps it clickable when disabled so
   * we can explain why (native disabled=true swallows clicks).
   * @param {Element|null} el
   * @param {boolean} enabled
   * @param {string} [why] required when enabled=false
   */
  function setActionEnabled(el, enabled, why) {
    if (!el) return;
    const on = !!enabled;
    const reason = String(why || 'This action is not available right now').trim();
    try {
      if (on) {
        el.classList.remove('rs-action-disabled');
        el.removeAttribute('aria-disabled');
        el.removeAttribute('data-rs-why');
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
          el.disabled = false;
        }
        el.style.opacity = '';
        el.style.cursor = '';
        // keep useful title if it was not only the disable reason
        if (el.dataset.rsTitleBackup != null) {
          if (el.dataset.rsTitleBackup) el.title = el.dataset.rsTitleBackup;
          else el.removeAttribute('title');
          delete el.dataset.rsTitleBackup;
        }
      } else {
        if (el.dataset.rsTitleBackup == null) {
          el.dataset.rsTitleBackup = el.getAttribute('title') || '';
        }
        el.classList.add('rs-action-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('data-rs-why', reason);
        el.title = reason;
        // Never use native disabled — it blocks click + feedback
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
          el.disabled = false;
        }
        el.style.opacity = '0.55';
        el.style.cursor = 'not-allowed';
      }
    } catch (_) {}
  }

  function isActionDisabled(el) {
    if (!el) return false;
    try {
      if (el.classList && el.classList.contains('rs-action-disabled')) return true;
      if (el.getAttribute('aria-disabled') === 'true') return true;
      if (el.disabled) return true;
    } catch (_) {}
    return false;
  }

  function reasonFor(el) {
    try {
      return (
        (el && el.getAttribute('data-rs-why')) ||
        (el && el.getAttribute('title')) ||
        'This action is not available right now'
      );
    } catch (_) {
      return 'This action is not available right now';
    }
  }

  // Capture-phase: soft-disabled controls stay clickable and explain why.
  // Prefer RS_setActionEnabled() over native disabled=true (native blocks click).
  function onClickCapture(e) {
    try {
      const el = e.target && e.target.closest
        ? e.target.closest('button, [role="button"], a.btn, .btn, [data-rs-why]')
        : null;
      if (!el) return;
      if (el.dataset && el.dataset.rsSilentDisable === '1') return;

      if (el.classList.contains('rs-action-disabled') || el.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        e.stopPropagation();
        notifyWhy(reasonFor(el), 'fa-circle-info');
      }
    } catch (_) {}
  }

  function boot() {
    if (global.__rsActionFeedbackBooted) return;
    global.__rsActionFeedbackBooted = true;
    document.addEventListener('click', onClickCapture, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.RS_notifyWhy = notifyWhy;
  global.RS_setActionEnabled = setActionEnabled;
  global.RS_isActionDisabled = isActionDisabled;
  global.RS_actionReason = reasonFor;
})(typeof window !== 'undefined' ? window : globalThis);
