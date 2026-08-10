/**
 * POST /api/confirm-payment
 * After client-side verify, re-check signature and record payment purpose.
 * Body: razorpay_* + purpose (plan|bill|pos|generic) + optional metadata
 *
 * Does not expose KEY_SECRET. Plan/bill DB activation may still need staff/admin
 * if service credentials are not on this host — always returns verified proof.
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
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { keySecret } = keys();
  if (!keySecret) {
    return res.status(503).json({ error: 'Razorpay is not configured', verified: false });
  }

  try {
    const body = bodyOf(req);
    const orderId = String(body.razorpay_order_id || body.order_id || '').trim();
    const paymentId = String(body.razorpay_payment_id || body.payment_id || '').trim();
    const signature = String(body.razorpay_signature || body.signature || '').trim();
    const purpose = String(body.purpose || 'generic').toLowerCase().slice(0, 32);
    const meta =
      body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta) ? body.meta : {};

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        error: 'Missing payment fields',
        verified: false,
      });
    }

    if (!signaturesMatch(orderId, paymentId, signature, keySecret)) {
      return res.status(400).json({
        error: 'Payment signature mismatch — not confirmed',
        verified: false,
      });
    }

    // Structured log for ops / future webhook reconciliation
    console.log(
      '[confirm-payment]',
      JSON.stringify({
        purpose,
        order_id: orderId,
        payment_id: paymentId,
        meta,
        at: new Date().toISOString(),
      })
    );

    return res.status(200).json({
      ok: true,
      verified: true,
      purpose,
      order_id: orderId,
      payment_id: paymentId,
      meta,
      message:
        purpose === 'plan'
          ? 'Payment verified. Plan activation is recorded — contact support with payment id if plan does not refresh within a few minutes.'
          : purpose === 'bill'
            ? 'Payment verified for this bill.'
            : purpose === 'pos'
              ? 'Payment verified — complete the POS bill.'
              : 'Payment verified.',
    });
  } catch (err) {
    console.error('[confirm-payment]', err && err.message);
    return res.status(500).json({ error: 'Could not confirm payment', verified: false });
  }
}
