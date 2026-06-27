export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, items, country, pdfData, filename } = req.body;

  if (!phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing phone number or cart items' });
  }

  // Country config for message formatting
  const CONFIGS = {
    IN: { sym:'₹', dial:'91',  taxLabel:'GST', taxMode:'cgst_sgst',   taxRate:5,  sacCode:'9963' },
    IE: { sym:'€', dial:'353', taxLabel:'VAT', taxMode:'vat_breakout', taxRate:9  },
    GB: { sym:'£', dial:'44',  taxLabel:'VAT', taxMode:'vat_breakout', taxRate:20 },
    US: { sym:'$', dial:'1',   taxLabel:'Tax', taxMode:'sales_tax',    taxRate:8  },
    AU: { sym:'A$',dial:'61',  taxLabel:'GST', taxMode:'sales_tax',    taxRate:10 },
    CA: { sym:'CA$',dial:'1', taxLabel:'HST', taxMode:'sales_tax',    taxRate:13 }
  };
  const cfg = CONFIGS[country] || CONFIGS['IN'];
  const sym = cfg.sym;
  const rs  = n => sym + n;

  // Normalise phone — strip non-digits, strip leading dial code if already present
  let cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone.startsWith(cfg.dial)) {
    cleanPhone = cfg.dial + cleanPhone;
  }
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  // Bill number & date matching production format
  const now    = new Date();
  const ymd    = now.toISOString().slice(0,10).replace(/-/g,'');
  const billNo = `RS-${ymd}-${String(Math.floor(100 + Math.random() * 900)).padStart(3,'0')}`;
  const dateStr = now.toLocaleDateString('en-GB', { day:'numeric', month:'short', timeZone:'UTC' }) +
                  ', ' + now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'UTC' });

  let subtotal = 0;
  items.forEach(item => { subtotal += Number(item.price) * Number(item.qty); });
  const tax   = Math.round(subtotal * cfg.taxRate / 100);
  const total = subtotal + tax;

  // ── WhatsApp text message ────────────────────────────────────────────────
  let msg = `*RestroSuite Demo*\n`;
  msg += `📞 +919983721179\n\n`;
  msg += `🧾 ${billNo}   ${dateStr}\n`;
  msg += `Table: Walk-in / Takeaway\n`;
  msg += `Phone: +${cleanPhone}\n\n`;

  items.forEach(item => {
    const qty = Number(item.qty);
    const pr  = Number(item.price);
    const tr  = item.taxRate || cfg.taxRate;
    msg += `${qty}× ${item.name} (${tr}%)    ${rs(qty * pr)}\n`;
  });

  msg += `\nSubtotal    ${rs(subtotal)}\n`;

  if (cfg.taxMode === 'cgst_sgst') {
    const halfGst = Math.round(tax / 2);
    msg += `CGST (2.5%)    ${rs(halfGst)}\n`;
    msg += `SGST (2.5%)    ${rs(tax - halfGst)}\n`;
    msg += `SAC: ${cfg.sacCode}\n`;
  } else if (cfg.taxMode === 'vat_breakout') {
    msg += `VAT Breakout\n`;
    msg += `Rate ${cfg.taxRate}%    Net ${rs(subtotal)} | VAT ${rs(tax)}\n`;
  } else {
    msg += `${cfg.taxLabel} (${cfg.taxRate}%)    ${rs(tax)}\n`;
  }

  msg += `\n*TOTAL    ${rs(total)}*\n\n`;
  msg += `Cash    ${rs(total)}\n\n`;
  msg += `Thank you for dining with us!\n`;
  msg += `*Powered by RestroSuite* — https://codearc-restrosuite.vercel.app`;

  // ── Call WhatsApp gateway ────────────────────────────────────────────────
  const baseUrl    = (process.env.WHATSAPP_GATEWAY_URL || process.env.GATEWAY_URL || 'https://kalpeshdeora1006-whatsapp-gateway.hf.space').replace(/\/$/, '');
  const token      = process.env.WHATSAPP_GATEWAY_TOKEN || '';
  const headers    = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  try {
    // Step 1 — send text receipt
    const textResp = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: cleanPhone, message: msg })
    });
    const textData = await textResp.json();
    if (!textResp.ok) {
      return res.status(textResp.status).json({ error: textData.error || `Gateway error ${textResp.status}` });
    }

    // Step 2 — send PDF as WhatsApp document (if provided)
    if (pdfData) {
      try {
        await fetch(`${baseUrl}/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: cleanPhone,
            pdfData,
            filename: filename || `Receipt_${billNo}.pdf`
          })
        });
      } catch (_) { /* PDF send failure is non-fatal — text already delivered */ }
    }

    return res.status(200).json({ success: true, cleanPhone, billNo });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to contact WhatsApp gateway: ' + err.message });
  }
}
