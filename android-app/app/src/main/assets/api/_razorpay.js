/**
 * Shared Razorpay helpers for Vercel serverless routes.
 * KEY_SECRET must never be returned to the client.
 * Uses fetch + Basic auth (avoids Razorpay SDK / undici header issues).
 */
import crypto from 'node:crypto';

export function getRazorpayKeys() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  return { keyId, keySecret };
}

function basicAuthHeader(keyId, keySecret) {
  const token = Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/**
 * POST https://api.razorpay.com/v1/orders
 */
export async function createRazorpayOrder({ amount, currency, receipt, notes }) {
  const { keyId, keySecret } = getRazorpayKeys();
  if (!keyId || !keySecret) {
    const err = new Error('Razorpay is not configured');
    err.code = 'not_configured';
    err.status = 503;
    throw err;
  }

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(keyId, keySecret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency,
      receipt,
      notes: notes || undefined,
    }),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: { description: text || 'Invalid response from Razorpay' } };
  }

  if (!res.ok) {
    const desc =
      (data.error && (data.error.description || data.error.reason || data.error.code)) ||
      text ||
      'Razorpay order create failed';
    const err = new Error(desc);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

export function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

export function setCors(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
}

export function verifyPaymentSignature({ orderId, paymentId, signature, keySecret }) {
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex');
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(signature || ''));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
