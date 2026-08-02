/**
 * RestroSuite — Razorpay Standard Web Checkout helper
 * KEY_SECRET never touches the browser. Public key_id comes from create-order.
 */
(function (global) {
  'use strict';

  const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
  const PROD_API_ORIGIN = 'https://restrosuite.codearc.co.in';
  let scriptPromise = null;

  /**
   * Desktop EXE serves UI from http://localhost:8001 which has no Razorpay
   * serverless routes. Point billing API calls at production so create-order
   * works without baking KEY_SECRET into the installer.
   */
  function apiUrl(path) {
    const p = path.charAt(0) === '/' ? path : '/' + path;
    try {
      const host = String(location.hostname || '');
      if (host === 'localhost' || host === '127.0.0.1') {
        return PROD_API_ORIGIN + p;
      }
    } catch (_) {}
    return p;
  }

  function loadCheckoutScript() {
    if (global.Razorpay) return Promise.resolve(global.Razorpay);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[src="' + CHECKOUT_SRC + '"]');
      if (existing) {
        existing.addEventListener('load', function () {
          global.Razorpay ? resolve(global.Razorpay) : reject(new Error('Razorpay failed to load'));
        });
        existing.addEventListener('error', function () {
          reject(new Error('Could not load Razorpay checkout script'));
        });
        if (global.Razorpay) resolve(global.Razorpay);
        return;
      }
      const s = document.createElement('script');
      s.src = CHECKOUT_SRC;
      s.async = true;
      s.onload = function () {
        global.Razorpay ? resolve(global.Razorpay) : reject(new Error('Razorpay failed to load'));
      };
      s.onerror = function () {
        reject(new Error('Could not load Razorpay checkout script'));
      };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  async function createOrder(opts) {
    const amount = Math.round(Number(opts && opts.amount));
    if (!Number.isFinite(amount) || amount < 100) {
      throw new Error('Amount must be at least 100 paise (₹1)');
    }
    const res = await fetch(apiUrl('/api/create-order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amount,
        currency: (opts && opts.currency) || 'INR',
        receipt: (opts && opts.receipt) || undefined,
        notes: (opts && opts.notes) || undefined,
      }),
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      const err = new Error(data.error || 'Could not create payment order');
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  async function verifyPayment(payload) {
    const res = await fetch(apiUrl('/api/verify-payment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: payload.razorpay_order_id,
        razorpay_payment_id: payload.razorpay_payment_id,
        razorpay_signature: payload.razorpay_signature,
      }),
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      const err = new Error(data.error || 'Payment verification failed');
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  /** Re-verify + purpose log (plan / bill / pos) */
  async function confirmPayment(payload, purpose, meta) {
    const res = await fetch(apiUrl('/api/confirm-payment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: payload.razorpay_order_id || payload.order_id,
        razorpay_payment_id: payload.razorpay_payment_id || payload.payment_id,
        razorpay_signature: payload.razorpay_signature || payload.signature,
        purpose: purpose || 'generic',
        meta: meta || {},
      }),
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      const err = new Error(data.error || 'Payment confirmation failed');
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  function rememberPayment(record) {
    try {
      const key = 'rs_rzp_payments';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const row = Object.assign(
        { at: new Date().toISOString() },
        record || {}
      );
      list.unshift(row);
      while (list.length > 40) list.pop();
      localStorage.setItem(key, JSON.stringify(list));
    } catch (_) {}
  }

  /**
   * Open Razorpay Standard Checkout modal.
   * @param {object} opts
   * @param {number} opts.amount - amount in paise (min 100)
   * @param {string} [opts.currency]
   * @param {string} [opts.name]
   * @param {string} [opts.description]
   * @param {string} [opts.prefillName]
   * @param {string} [opts.prefillEmail]
   * @param {string} [opts.prefillContact]
   * @param {object} [opts.notes]
   * @param {string} [opts.themeColor]
   * @returns {Promise<{verified:boolean, order_id:string, payment_id:string}|{cancelled:true}>}
   */
  async function openCheckout(opts) {
    opts = opts || {};
    const order = await createOrder({
      amount: opts.amount,
      currency: opts.currency,
      receipt: opts.receipt,
      notes: opts.notes,
    });

    await loadCheckoutScript();

    return new Promise(function (resolve, reject) {
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: opts.name || 'RestroSuite',
        description: opts.description || 'RestroSuite plan payment',
        order_id: order.order_id,
        prefill: {
          name: opts.prefillName || '',
          email: opts.prefillEmail || '',
          contact: opts.prefillContact || '',
        },
        notes: opts.notes || {},
        theme: { color: opts.themeColor || '#FF4F00' },
        modal: {
          ondismiss: function () {
            resolve({ cancelled: true, order_id: order.order_id });
          },
          confirm_close: true,
          escape: true,
          animation: true,
        },
        handler: function (response) {
          verifyPayment(response)
            .then(function (verified) {
              const base = {
                verified: true,
                order_id: verified.order_id || response.razorpay_order_id,
                payment_id: verified.payment_id || response.razorpay_payment_id,
                raw: response,
              };
              const purpose = (opts && opts.purpose) || 'generic';
              const meta = Object.assign({}, (opts && opts.notes) || {}, (opts && opts.meta) || {});
              return confirmPayment(
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
                purpose,
                meta
              )
                .then(function (confirmed) {
                  rememberPayment({
                    purpose: purpose,
                    order_id: base.order_id,
                    payment_id: base.payment_id,
                    meta: meta,
                  });
                  resolve(Object.assign({}, base, { confirmed: confirmed }));
                })
                .catch(function () {
                  // Signature already verified — still treat as paid for UX
                  rememberPayment({
                    purpose: purpose,
                    order_id: base.order_id,
                    payment_id: base.payment_id,
                    meta: meta,
                    confirm_soft_fail: true,
                  });
                  resolve(base);
                });
            })
            .catch(function (err) {
              reject(err);
            });
        },
      };
      if (opts.image) options.image = opts.image;

      try {
        const rzp = new global.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          const desc =
            (resp && resp.error && (resp.error.description || resp.error.reason)) ||
            'Payment failed';
          const err = new Error(desc);
          err.code = 'payment_failed';
          err.payload = resp;
          reject(err);
        });
        rzp.open();
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Convenience: amount in rupees → paise, open checkout.
   */
  async function payRupees(rupees, opts) {
    const paise = Math.round(Number(rupees) * 100);
    return openCheckout(Object.assign({}, opts || {}, { amount: paise }));
  }

  global.RSRazorpay = {
    loadCheckoutScript: loadCheckoutScript,
    createOrder: createOrder,
    verifyPayment: verifyPayment,
    confirmPayment: confirmPayment,
    rememberPayment: rememberPayment,
    openCheckout: openCheckout,
    payRupees: payRupees,
  };
})(typeof window !== 'undefined' ? window : globalThis);
