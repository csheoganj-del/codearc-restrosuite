/**
 * POST /api/create-order
 * Razorpay Standard Checkout — create order (server-side only).
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 */
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

function setCors(res) {
  // Desktop EXE (localhost) + web share this API
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

  const { keyId, keySecret } = keys();
  if (!keyId || !keySecret) {
    return res.status(503).json({
      error: 'Razorpay is not configured on the server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    });
  }

  try {
    const body = bodyOf(req);
    const amount = Math.round(Number(body.amount));
    const currency = String(body.currency || 'INR').toUpperCase().slice(0, 3);
    const receipt = String(body.receipt || `rcpt_${Date.now()}`).slice(0, 40);
    const notes =
      body.notes && typeof body.notes === 'object' && !Array.isArray(body.notes)
        ? body.notes
        : undefined;

    if (!Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({
        error: 'Amount must be at least 100 paise (₹1.00).',
        min_amount: 100,
      });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64');
    const upstream = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount, currency, receipt, notes }),
    });

    const text = await upstream.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

    if (!upstream.ok) {
      const desc =
        (data.error && (data.error.description || data.error.reason || data.error.code)) ||
        text ||
        'Razorpay order create failed';
      if (upstream.status === 401) {
        return res.status(401).json({ error: 'Razorpay authentication failed. Check API keys.' });
      }
      console.error('[create-order] upstream', upstream.status, desc);
      return res.status(500).json({ error: desc });
    }

    return res.status(200).json({
      order_id: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt: data.receipt || receipt,
      key_id: keyId,
    });
  } catch (err) {
    console.error('[create-order] failed', err && err.message, err && err.stack);
    return res.status(500).json({ error: (err && err.message) || 'Could not create payment order' });
  }
}
