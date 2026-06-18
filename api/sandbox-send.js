// Simple in-memory rate limiter (per-serverless-instance)
const rateLimitMap = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Basic IP-based rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const limitTime = 60 * 60 * 1000; // 1 hour
  const maxRequests = 3;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip).filter(t => now - t < limitTime);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);

  if (timestamps.length > maxRequests) {
    return res.status(429).json({
      error: 'Too many requests. You can send up to 3 real WhatsApp messages per hour.'
    });
  }

  const { phone, items } = req.body;

  if (!phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing phone number or cart items' });
  }

  // Clean phone number format
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length === 10 && !cleanPhone.startsWith('91')) {
    cleanPhone = '91' + cleanPhone;
  }

  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number format. Please provide a valid 10-digit number.' });
  }

  // Format the WhatsApp message
  const border = "========================";
  const divider = "------------------------";
  
  let msg = `*RestroSuite Interactive Sandbox*\n`;
  msg += `${border}\n`;
  msg += `Receipt: #RS-DEMO-${Math.floor(1000 + Math.random() * 9000)}\n`;
  msg += `Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}\n`;
  msg += `${divider}\n`;
  
  let subtotal = 0;
  items.forEach(item => {
    const price = Number(item.price);
    const qty = Number(item.qty);
    const itemTotal = price * qty;
    subtotal += itemTotal;
    msg += `${qty} x ${item.name} - ₹${itemTotal}\n`;
  });
  
  const tax = Math.round(subtotal * 0.05);
  const finalTotal = subtotal + tax;
  
  msg += `${divider}\n`;
  msg += `Subtotal: ₹${subtotal}\n`;
  msg += `GST (5%): ₹${tax}\n`;
  msg += `*Total: ₹${finalTotal}*\n`;
  msg += `${border}\n`;
  msg += `Thank you for testing the RestroSuite sandbox! ☕\n`;
  msg += `Experience the fastest local-first billing software at *half the normal cost*.\n`;
  msg += `👉 Visit: https://restrosuite.codearc.co.in`;

  // Call the WhatsApp Gateway
  const baseGatewayUrl = process.env.WHATSAPP_GATEWAY_URL || process.env.GATEWAY_URL || 'https://kalpeshdeora1006-whatsapp-gateway.hf.space';
  const gatewayUrl = baseGatewayUrl.replace(/\/$/, '') + '/send';
  const token = process.env.WHATSAPP_GATEWAY_TOKEN || '';

  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
  }

  try {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        phone: cleanPhone,
        message: msg
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Sandbox Send] Gateway error:', data);
      return res.status(response.status).json({
        error: data.error || `Gateway returned HTTP ${response.status}`
      });
    }

    return res.status(200).json({ success: true, cleanPhone });
  } catch (err) {
    console.error('[Sandbox Send] Network error:', err.message);
    return res.status(500).json({ error: 'Failed to contact WhatsApp gateway' });
  }
}
