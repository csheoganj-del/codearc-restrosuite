/**
 * RestroSuite — RSActionFeedback module (Wave 14 UI/UX refinement)
 * ---------------------------------------------------------------
 * Provides safe, non-blocking audio and haptic feedback for key POS/KDS actions
 * (e.g. Add to Cart, Print Bill, KOT Complete).
 *
 * Guarded against:
 *   - Browser autoplay policies (AudioContext state check + resume)
 *   - Missing Web Audio API (try/catch throughout)
 *   - Missing haptic hardware (navigator.vibrate existence check)
 *   - prefers-reduced-motion OS setting (audio and vibration both suppressed)
 */
(function (global) {
  'use strict';

  let audioCtx = null;

  /**
   * Returns true when the user's OS/browser accessibility setting requests
   * reduced motion. Both audio tones and haptic vibration are suppressed
   * in this mode — they share the same motion-based sensory disruption
   * that the user is opting out of.
   *
   * The media query is checked live on every call (not cached at module load)
   * so that changes made while the tab is open take effect immediately.
   */
  function prefersReducedMotion() {
    try {
      return (
        typeof global.matchMedia === 'function' &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch (_) {
      return false;
    }
  }

  function getAudioContext() {
    if (audioCtx) {return audioCtx;}
    try {
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    } catch (_) {}
    return audioCtx;
  }

  function playTone(freq, type, duration, vol) {
    // Respect the user's OS "reduce motion" preference — no audio surprises.
    if (prefersReducedMotion()) {return;}
    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state === 'suspended') {
        if (ctx && ctx.resume) {ctx.resume().catch(function () {});}
      }
      if (!ctx || ctx.state !== 'running') {return;}

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq || 440, ctx.currentTime);

      gain.gain.setValueAtTime(vol || 0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (duration || 0.1));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + (duration || 0.1));
    } catch (_) {}
  }

  function vibrate(pattern) {
    // Respect the user's OS "reduce motion" preference — no haptic surprises.
    if (prefersReducedMotion()) {return;}
    try {
      if (global.navigator && typeof global.navigator.vibrate === 'function') {
        global.navigator.vibrate(pattern || 30);
      }
    } catch (_) {}
  }

  const RSActionFeedback = {
    /** Light click confirmation — adding an item, toggling a switch. */
    click: function () {
      playTone(600, 'sine', 0.04, 0.03);
      vibrate(15);
    },
    /** Two-tone ascending chime — KOT sent, bill printed, checkout complete. */
    success: function () {
      playTone(800, 'sine', 0.08, 0.04);
      setTimeout(function () { playTone(1200, 'sine', 0.1, 0.04); }, 60);
      vibrate([20, 30, 40]);
    },
    /** Single mid-tone notice — new order arrived, low stock warning. */
    notice: function () {
      playTone(450, 'triangle', 0.06, 0.04);
      vibrate(25);
    },
    /** Low sawtooth buzz — validation error, payment failure. */
    error: function () {
      playTone(300, 'sawtooth', 0.15, 0.05);
      vibrate([50, 50, 50]);
    }
  };

  global.RSActionFeedback = RSActionFeedback;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RSActionFeedback;
  }
})(typeof window !== 'undefined' ? window : globalThis);
