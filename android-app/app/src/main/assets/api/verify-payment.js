/**
 * POST /api/verify-payment
 * HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET) vs razorpay_signature
 */
import crypto from 'node:crypto';

function keys() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || '').trim(),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || '').trim(),
  };
}

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return {};
}

function signaturesMatch(orderId, paymentId, signature, keySecret) {
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { keySecret } = keys();
  if (!keySecret) {
    return res.status(503).json({
      error: 'Razorpay is not configured on the server. Set RAZORPAY_KEY_SECRET.',
    });
  }

  try {
    const body = bodyOf(req);
    const orderId = String(body.razorpay_order_id || body.order_id || '').trim();
    const paymentId = String(body.razorpay_payment_id || body.payment_id || '').trim();
    const signature = String(body.razorpay_signature || body.signature || '').trim();

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        error: 'Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature',
        verified: false,
      });
    }

    if (!signaturesMatch(orderId, paymentId, signature, keySecret)) {
      return res.status(400).json({
        error: 'Payment signature mismatch — payment not verified',
        verified: false,
      });
    }

    return res.status(200).json({
      ok: true,
      verified: true,
      order_id: orderId,
      payment_id: paymentId,
    });
  } catch (err) {
    console.error('[verify-payment] failed', err && err.message);
    return res.status(500).json({ error: 'Could not verify payment', verified: false });
  }
}
